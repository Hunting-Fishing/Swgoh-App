import { gacAttackPlanService } from "./gac-attack-plan-service.mjs";
import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import {
  assertSameOrigin,
  datacronById,
  eventInstanceId,
  normalizeAllyCode,
  normalizeBaseId,
  readJsonBody,
  rosterUnits,
  validRound,
} from "./gac-board-observation-api.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export function createGacAttackPlanApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const boards = options.boards || gacBoardObservationService;
  const plans = options.plans || gacAttackPlanService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for the war room.");
      error.status = 404;
      throw error;
    }
    const liveRound = bracketIndex.currentRoundFrom?.(playerContext, currentEvent) ?? null;
    const requestedRound = validRound(requestedRoundInput);
    if (liveRound && requestedRound && liveRound !== requestedRound) {
      const error = new Error(`The live GAC context reports Round ${liveRound}, not Round ${requestedRound}.`);
      error.status = 409;
      throw error;
    }
    const round = liveRound || requestedRound;
    if (!round) {
      const error = new Error("Select the current GAC Round 1, 2, or 3 before using the war room.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent for this event and round before using the war room.");
      error.status = 409;
      throw error;
    }
    return { eventInstanceId: id, round, confirmed };
  }

  async function commonInput(userId, code, roundInput) {
    const context = await currentContext(code, roundInput);
    return {
      userId,
      context,
      input: {
        allyCode: code,
        opponentAllyCode: normalizeAllyCode(context.confirmed.opponent.allyCode),
        eventInstanceId: context.eventInstanceId,
        round: context.round,
      },
    };
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = url.pathname.match(/^\/api\/gac\/attack-plan\/(\d{9})$/);
      if (!match || !["GET", "POST", "PATCH"].includes(request.method)) return false;
      try {
        if (["POST", "PATCH"].includes(request.method)) assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account to use the GAC war room.");
          error.status = 401;
          throw error;
        }
        const code = normalizeAllyCode(match[1]);
        if (!code) {
          const error = new Error("A valid 9-digit Ally Code is required.");
          error.status = 400;
          throw error;
        }

        if (request.method === "GET") {
          const common = await commonInput(user.id, code, url.searchParams.get("round"));
          const result = await plans.getAssignments(user.id, common.input);
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-War-Room": "verified-owner",
          });
          return true;
        }

        const body = await readJsonBody(request);
        const common = await commonInput(user.id, code, body?.round);
        if (request.method === "PATCH") {
          const result = await plans.updateStatus(user.id, {
            ...common.input,
            id: body?.id,
            status: body?.status,
            banners: body?.banners,
          });
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-War-Room": "verified-owner",
          });
          return true;
        }

        const members = [...new Set(asArray(body?.members).map(normalizeBaseId).filter(Boolean))];
        const leaderBaseId = normalizeBaseId(body?.leaderBaseId);
        if (!members.length || !leaderBaseId || !members.includes(leaderBaseId)) {
          const error = new Error("Select a complete planned attack squad and its leader.");
          error.status = 400;
          throw error;
        }

        const [liveRoster, ownBoard] = await Promise.all([
          requestGateway(`/v1/player/${code}`, true),
          boards.getPlayerDefenses(user.id, common.input),
        ]);
        const liveUnits = rosterUnits(liveRoster);
        const missing = members.filter((id) => !liveUnits.has(id));
        if (missing.length) {
          const error = new Error(`The planned counter contains units not present in your current live roster: ${missing.join(", ")}.`);
          error.status = 409;
          throw error;
        }
        const defended = new Set(asArray(ownBoard?.defenses).flatMap((defense) => asArray(defense?.members).map(normalizeBaseId)));
        const reserved = members.filter((id) => defended.has(id));
        if (reserved.length) {
          const error = new Error(`Those attackers are already reserved on your verified defense: ${reserved.join(", ")}.`);
          error.status = 409;
          throw error;
        }

        const datacronId = clean(body?.datacronId);
        const datacron = datacronId ? datacronById(liveRoster, datacronId, "player") : null;
        const result = await plans.saveAssignment(user.id, {
          ...common.input,
          defenseId: body?.defenseId,
          leaderBaseId,
          members,
          datacron,
          sourceRef: "gac-command-center-round-war-room",
        });
        writeJson(response, 200, result, {
          "X-GAC-Source": result.source,
          "X-GAC-War-Room": "verified-owner",
        });
      } catch (error) {
        writeJson(response, statusFor(error), { error: error?.message || "The GAC war-room request could not be processed." });
      }
      return true;
    },
  });
}

export { statusFor };
