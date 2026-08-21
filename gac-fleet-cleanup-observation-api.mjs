import {
  assertSameOrigin,
  eventInstanceId,
  normalizeAllyCode,
  readJsonBody,
  validRound,
} from "./gac-board-observation-api.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { gacFleetCleanupObservationService } from "./gac-fleet-cleanup-observation-service.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";

function clean(value) { return String(value ?? "").trim(); }
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export function createGacFleetCleanupObservationApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const cleanup = options.cleanup || gacFleetCleanupObservationService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for fleet cleanup-state capture.");
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
      const error = new Error("Select the current GAC round before using fleet cleanup-state capture.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent before saving or loading fleet cleanup state.");
      error.status = 409;
      throw error;
    }
    return Object.freeze({ eventInstanceId: id, round, confirmed });
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = url.pathname.match(/^\/api\/gac\/fleet-cleanup\/(\d{9})$/);
      if (!match || !["GET", "POST"].includes(request.method)) return false;
      try {
        if (request.method === "POST") assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account before using canonical fleet cleanup state.");
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
          const context = await currentContext(code, url.searchParams.get("round"));
          const result = await cleanup.getObservations(user.id, {
            allyCode: code,
            opponentAllyCode: normalizeAllyCode(context.confirmed.opponent.allyCode),
            eventInstanceId: context.eventInstanceId,
            round: context.round,
          });
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-Fleet-Cleanup": "verified-owner-post-loss-observation",
          });
          return true;
        }

        const body = await readJsonBody(request);
        const context = await currentContext(code, body?.round);
        const confirmedOpponent = normalizeAllyCode(context.confirmed.opponent.allyCode);
        const submittedOpponent = normalizeAllyCode(body?.opponentAllyCode);
        if (submittedOpponent && submittedOpponent !== confirmedOpponent) {
          const error = new Error("The submitted opponent does not match the verified current-round opponent.");
          error.status = 409;
          throw error;
        }
        const result = await cleanup.saveObservation(user.id, {
          allyCode: code,
          opponentAllyCode: confirmedOpponent,
          eventInstanceId: context.eventInstanceId,
          round: context.round,
          assignmentId: body?.assignmentId,
          attemptIndex: body?.attemptIndex,
          units: body?.units,
          notes: body?.notes,
          sourceRef: clean(body?.sourceRef || "gac-command-center-fleet-cleanup-control"),
        });
        writeJson(response, 200, result, {
          "X-GAC-Source": result.source,
          "X-GAC-Fleet-Cleanup": "verified-owner-post-loss-observation",
        });
      } catch (error) {
        writeJson(response, statusFor(error), {
          error: error?.message || "The Fleet War Room cleanup observation could not be processed.",
        });
      }
      return true;
    },
  });
}

export { statusFor };
