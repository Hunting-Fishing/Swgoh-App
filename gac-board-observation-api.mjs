import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import {
  assertSameOrigin,
  eventInstanceId,
  normalizeAllyCode,
  readJsonBody,
  validRound,
} from "./gac-current-opponent-confirmation-api.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function validSize(value) {
  const size = Number(value);
  return size === 3 || size === 5 ? size : null;
}
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
function rosterUnits(body = {}) {
  const values = [
    ...asArray(body?.units),
    ...asArray(body?.roster),
    ...asArray(body?.rosterUnit),
  ];
  const index = new Map();
  for (const unit of values) {
    const id = normalizeBaseId(unit?.baseId || unit?.base_id || unit?.definitionId || unit?.defId);
    if (id) index.set(id, unit);
  }
  return index;
}
function datacronById(body = {}, idInput) {
  const id = clean(idInput);
  if (!id) return null;
  if (!Array.isArray(body?.datacrons)) {
    const error = new Error("The opponent live roster did not expose individual datacrons, so this assignment cannot be persisted canonically.");
    error.status = 409;
    throw error;
  }
  const found = body.datacrons.find((datacron) => clean(datacron?.id) === id);
  if (!found) {
    const error = new Error("The selected datacron ID is not present in the opponent's current live datacron inventory.");
    error.status = 409;
    throw error;
  }
  return found;
}

export function createGacBoardObservationApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const observations = options.observations || gacBoardObservationService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for board persistence.");
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
      const error = new Error("Select the current GAC Round 1, 2, or 3 before saving or loading board evidence.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent for this event and round before using persisted board evidence.");
      error.status = 409;
      throw error;
    }
    return { currentEvent, playerContext, eventInstanceId: id, round, confirmed };
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = url.pathname.match(/^\/api\/gac\/current-board\/(\d{9})\/defense$/);
      if (!match || !["GET", "POST"].includes(request.method)) return false;

      try {
        if (request.method === "POST") assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account to save or reload current GAC board evidence.");
          error.status = 401;
          throw error;
        }

        const code = normalizeAllyCode(match[1]);
        if (request.method === "GET") {
          const context = await currentContext(code, url.searchParams.get("round"));
          const result = await observations.getDefenses(user.id, {
            allyCode: code,
            opponentAllyCode: context.confirmed.opponent.allyCode,
            eventInstanceId: context.eventInstanceId,
            round: context.round,
          });
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-Board-Evidence": "verified-user",
          });
          return true;
        }

        const body = await readJsonBody(request);
        const context = await currentContext(code, body?.round);
        const opponentAllyCode = normalizeAllyCode(body?.opponentAllyCode);
        const confirmedOpponent = normalizeAllyCode(context.confirmed.opponent.allyCode);
        if (!opponentAllyCode || opponentAllyCode !== confirmedOpponent) {
          const error = new Error("The submitted opponent does not match the verified current-round opponent.");
          error.status = 409;
          throw error;
        }

        const size = validSize(body?.size);
        if (!size) {
          const error = new Error("GAC defense size must be 3 or 5.");
          error.status = 400;
          throw error;
        }
        const members = [...new Set(asArray(body?.members).map(normalizeBaseId).filter(Boolean))];
        if (members.length !== size) {
          const error = new Error(`Select exactly ${size} defenders before saving this board observation.`);
          error.status = 400;
          throw error;
        }
        const leaderBaseId = normalizeBaseId(body?.leaderBaseId);
        if (!leaderBaseId || !members.includes(leaderBaseId)) {
          const error = new Error("The defense leader must be one of the selected defenders.");
          error.status = 400;
          throw error;
        }

        const opponentRoster = await requestGateway(`/v1/player/${confirmedOpponent}`, true);
        const liveUnits = rosterUnits(opponentRoster);
        const missing = members.filter((id) => !liveUnits.has(id));
        if (missing.length) {
          const error = new Error(`The submitted defense contains units not present in the opponent's current live roster: ${missing.join(", ")}.`);
          error.status = 409;
          throw error;
        }

        const datacronId = clean(body?.datacronId);
        const datacron = datacronId ? datacronById(opponentRoster, datacronId) : null;
        const result = await observations.saveDefense(user.id, {
          allyCode: code,
          opponentAllyCode: confirmedOpponent,
          eventInstanceId: context.eventInstanceId,
          round: context.round,
          size,
          leaderBaseId,
          members,
          datacron,
          zone: body?.zone,
          slot: body?.slot,
          sourceRef: "gac-command-center-current-board",
        });
        writeJson(response, 200, result, {
          "X-GAC-Source": result.source,
          "X-GAC-Board-Evidence": "verified-user",
        });
      } catch (error) {
        writeJson(response, statusFor(error), {
          error: error?.message || "The current GAC board observation could not be processed.",
        });
      }
      return true;
    },
  });
}

export { datacronById, normalizeBaseId, rosterUnits, validSize };
