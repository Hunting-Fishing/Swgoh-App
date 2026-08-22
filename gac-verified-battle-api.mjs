import {
  assertSameOrigin,
  eventInstanceId,
  normalizeAllyCode,
  readJsonBody,
  validRound,
} from "./gac-board-observation-api.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { gacRelicEvidenceEnricher } from "./gac-relic-evidence-enricher.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";
import { gacVerifiedBattleService } from "./gac-verified-battle-service.mjs";

function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export function createGacVerifiedBattleApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const battles = options.battles || gacVerifiedBattleService;
  const relicEvidence = options.relicEvidence || gacRelicEvidenceEnricher;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for verified battle capture.");
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
      const error = new Error("Select the current GAC Round 1, 2, or 3 before verifying a battle result.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent for this event and round before verifying battle history.");
      error.status = 409;
      throw error;
    }
    return { eventInstanceId: id, round, confirmed };
  }

  async function softRosterSnapshots(ownerCode, opponentCode) {
    const [ownerRosterSnapshot, opponentRosterSnapshot] = await Promise.all([
      requestGateway(`/v1/player/${ownerCode}`, true).catch(() => null),
      opponentCode ? requestGateway(`/v1/player/${opponentCode}`, true).catch(() => null) : Promise.resolve(null),
    ]);
    return { ownerRosterSnapshot, opponentRosterSnapshot };
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = request.method === "POST" && url.pathname.match(/^\/api\/gac\/verified-battle\/(\d{9})$/);
      if (!match) return false;
      try {
        assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account before archiving a GAC battle result.");
          error.status = 401;
          throw error;
        }
        const code = normalizeAllyCode(match[1]);
        const body = await readJsonBody(request);
        const context = await currentContext(code, body?.round);
        const opponentAllyCode = normalizeAllyCode(context.confirmed.opponent.allyCode);
        const result = await battles.verifyAttempt(user.id, {
          allyCode: code,
          opponentAllyCode,
          eventInstanceId: context.eventInstanceId,
          round: context.round,
          assignmentId: body?.assignmentId,
          attemptIndex: body?.attemptIndex,
          confirm: body?.confirm === true,
        });
        const snapshots = await softRosterSnapshots(code, opponentAllyCode);
        const relicResult = relicEvidence?.enrichBattle
          ? await relicEvidence.enrichBattle({
              battleKey: result?.battle?.battleKey,
              battle: result?.battle,
              ownerRosterSnapshot: snapshots.ownerRosterSnapshot,
              opponentRosterSnapshot: snapshots.opponentRosterSnapshot,
            }).catch((error) => Object.freeze({ enriched:false, reason:"supplemental-relic-enrichment-failed", error:String(error?.message || error).slice(0,180) }))
          : null;
        const enrichedResult = relicResult ? { ...result, relicEvidence: relicResult } : result;
        writeJson(response, 200, enrichedResult, {
          "X-GAC-Source": result.source,
          "X-GAC-Battle-Evidence": "verified-owner-explicit-confirmation",
        });
      } catch (error) {
        writeJson(response, statusFor(error), {
          error: error?.message || "The GAC battle result could not be verified.",
        });
      }
      return true;
    },
  });
}

export { statusFor };
