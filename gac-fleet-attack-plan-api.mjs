import { gacFleetAttackPlanService } from "./gac-fleet-attack-plan-service.mjs";
import {
  assertSameOrigin,
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
function normalizeIds(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
function isKnownNonShip(unit = {}) {
  const type = clean(unit.unitType).toLowerCase();
  const combatType = Number(unit.combatType);
  if (type) return type !== "ship";
  if (Number.isFinite(combatType)) return combatType !== 2;
  return false;
}

export function createGacFleetAttackPlanApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const plans = options.plans || gacFleetAttackPlanService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for the Fleet War Room.");
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
      const error = new Error("Select the current GAC round before using the Fleet War Room.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent before using the canonical Fleet War Room.");
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
      const match = url.pathname.match(/^\/api\/gac\/fleet-attack-plan\/(\d{9})$/);
      if (!match || !["GET", "POST", "PATCH"].includes(request.method)) return false;
      try {
        if (["POST", "PATCH"].includes(request.method)) assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account to use the Fleet War Room.");
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
          writeJson(response, 200, result, { "X-GAC-Source": result.source, "X-GAC-Fleet-War-Room": "verified-owner" });
          return true;
        }
        const body = await readJsonBody(request);
        const common = await commonInput(user.id, code, body?.round);
        if (request.method === "PATCH") {
          const result = await plans.updateStatus(user.id, { ...common.input, id: body?.id, status: body?.status, banners: body?.banners });
          writeJson(response, 200, result, { "X-GAC-Source": result.source, "X-GAC-Fleet-War-Room": "verified-owner" });
          return true;
        }
        if (body?.datacronId || body?.datacron) {
          const error = new Error("Datacrons do not apply to fleet attacks.");
          error.status = 400;
          throw error;
        }
        const capitalShipBaseId = normalizeBaseId(body?.capitalShipBaseId);
        const starters = normalizeIds(body?.starters).filter((id) => id !== capitalShipBaseId);
        const reinforcements = normalizeIds(body?.reinforcements).filter((id) => id !== capitalShipBaseId && !starters.includes(id));
        if (!capitalShipBaseId || starters.length !== 3 || reinforcements.length > 4) {
          const error = new Error("Locking a fleet counter requires one capital ship, exactly three user-confirmed starters, and up to four reinforcements.");
          error.status = 400;
          throw error;
        }
        const members = normalizeIds([capitalShipBaseId, ...starters, ...reinforcements]);
        const liveRoster = await requestGateway(`/v1/player/${code}`, true);
        const index = rosterUnits(liveRoster);
        const missing = members.filter((id) => !index.has(id));
        if (missing.length) {
          const error = new Error(`The planned fleet contains units not present in your current live roster: ${missing.join(", ")}.`);
          error.status = 409;
          throw error;
        }
        const nonShips = members.filter((id) => isKnownNonShip(index.get(id)));
        if (nonShips.length) {
          const error = new Error(`The planned fleet contains non-ship units: ${nonShips.join(", ")}.`);
          error.status = 409;
          throw error;
        }
        const result = await plans.saveAssignment(user.id, {
          ...common.input,
          defenseFleetId: body?.defenseFleetId,
          capitalShipBaseId,
          starters,
          reinforcements,
          sourceRef: clean(body?.sourceRef || "gac-command-center-fleet-war-room"),
        });
        writeJson(response, 200, result, { "X-GAC-Source": result.source, "X-GAC-Fleet-War-Room": "verified-owner" });
      } catch (error) {
        writeJson(response, statusFor(error), { error: error?.message || "The Fleet War Room request could not be processed." });
      }
      return true;
    },
  });
}

export { isKnownNonShip, statusFor };
