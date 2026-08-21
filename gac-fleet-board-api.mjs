import { gacFleetBoardService } from "./gac-fleet-board-service.mjs";
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
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
function normalizeIds(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }
function fleetPayload(body = {}) {
  const capitalShipBaseId = normalizeBaseId(body.capitalShipBaseId);
  const starters = normalizeIds(body.starters).filter((id) => id !== capitalShipBaseId);
  const reinforcements = normalizeIds(body.reinforcements).filter((id) => id !== capitalShipBaseId && !starters.includes(id));
  if (!capitalShipBaseId) {
    const error = new Error("Select a capital ship before saving this fleet observation.");
    error.status = 400;
    throw error;
  }
  if (starters.length !== 3) {
    const error = new Error("Select exactly three starting ships before saving this fleet observation.");
    error.status = 400;
    throw error;
  }
  if (reinforcements.length > 4) {
    const error = new Error("A saved fleet can contain at most four reinforcements.");
    error.status = 400;
    throw error;
  }
  const members = normalizeIds([capitalShipBaseId, ...starters, ...reinforcements]);
  if (members.length !== 4 + reinforcements.length) {
    const error = new Error("Capital ship, starters and reinforcements must be unique fleet units.");
    error.status = 400;
    throw error;
  }
  return Object.freeze({ capitalShipBaseId, starters: Object.freeze(starters), reinforcements: Object.freeze(reinforcements), members: Object.freeze(members) });
}
function isKnownNonShip(unit = {}) {
  const type = clean(unit.unitType).toLowerCase();
  const combatType = Number(unit.combatType);
  if (type) return type !== "ship";
  if (Number.isFinite(combatType)) return combatType !== 2;
  return false;
}

export function createGacFleetBoardApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const fleets = options.fleets || gacFleetBoardService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  async function currentContext(code, requestedRoundInput) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for fleet-board persistence.");
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
      const error = new Error("Select the current GAC round before saving or loading fleet evidence.");
      error.status = 400;
      throw error;
    }
    const confirmed = await confirmation.findLatestConfirmed(code, id, round);
    if (!confirmed?.opponent?.allyCode) {
      const error = new Error("Confirm the current opponent before using canonical fleet-board evidence.");
      error.status = 409;
      throw error;
    }
    return { eventInstanceId: id, round, confirmed };
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = url.pathname.match(/^\/api\/gac\/current-fleet-board\/(\d{9})\/(defense|my-defense)$/);
      if (!match || !["GET", "POST", "DELETE"].includes(request.method)) return false;
      const owner = match[2] === "my-defense" ? "player" : "opponent";
      try {
        if (["POST", "DELETE"].includes(request.method)) assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account to save or load canonical GAC fleet evidence.");
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
          const input = { allyCode: code, opponentAllyCode: normalizeAllyCode(context.confirmed.opponent.allyCode), eventInstanceId: context.eventInstanceId, round: context.round };
          const result = owner === "player" ? await fleets.getPlayerDefenses(user.id, input) : await fleets.getDefenses(user.id, input);
          writeJson(response, 200, result, { "X-GAC-Source": result.source, "X-GAC-Fleet-Evidence": "verified-user", "X-GAC-Board-Owner": owner });
          return true;
        }

        const body = await readJsonBody(request);
        const context = await currentContext(code, body?.round);
        const confirmedOpponent = normalizeAllyCode(context.confirmed.opponent.allyCode);
        const commonInput = { allyCode: code, opponentAllyCode: confirmedOpponent, eventInstanceId: context.eventInstanceId, round: context.round };
        if (request.method === "DELETE") {
          const result = owner === "player"
            ? await fleets.deletePlayerDefense(user.id, { ...commonInput, id: body?.id })
            : await fleets.deleteDefense(user.id, { ...commonInput, id: body?.id });
          writeJson(response, 200, result, { "X-GAC-Source": result.source, "X-GAC-Fleet-Evidence": "verified-user", "X-GAC-Board-Owner": owner });
          return true;
        }
        if (body?.datacronId || body?.datacron) {
          const error = new Error("Datacrons do not apply to fleet defenses.");
          error.status = 400;
          throw error;
        }
        if (owner === "opponent") {
          const submittedOpponent = normalizeAllyCode(body?.opponentAllyCode);
          if (!submittedOpponent || submittedOpponent !== confirmedOpponent) {
            const error = new Error("The submitted opponent does not match the verified current-round opponent.");
            error.status = 409;
            throw error;
          }
        }
        const payload = fleetPayload(body);
        const rosterCode = owner === "player" ? code : confirmedOpponent;
        const rosterLabel = owner === "player" ? "player" : "opponent";
        const liveRoster = await requestGateway(`/v1/player/${rosterCode}`, true);
        const index = rosterUnits(liveRoster);
        const missing = payload.members.filter((id) => !index.has(id));
        if (missing.length) {
          const error = new Error(`The submitted fleet contains units not present in the ${rosterLabel} current live roster: ${missing.join(", ")}.`);
          error.status = 409;
          throw error;
        }
        const nonShips = payload.members.filter((id) => isKnownNonShip(index.get(id)));
        if (nonShips.length) {
          const error = new Error(`The submitted fleet contains non-ship units: ${nonShips.join(", ")}.`);
          error.status = 409;
          throw error;
        }
        const saveInput = {
          ...commonInput,
          ...payload,
          zone: "BACK-TOP",
          slot: body?.slot,
          sourceRef: owner === "player" ? "gac-command-center-my-fleet-defense" : "gac-command-center-current-fleet-board",
        };
        const result = owner === "player" ? await fleets.savePlayerDefense(user.id, saveInput) : await fleets.saveDefense(user.id, saveInput);
        writeJson(response, 200, result, { "X-GAC-Source": result.source, "X-GAC-Fleet-Evidence": "verified-user", "X-GAC-Board-Owner": owner });
      } catch (error) {
        writeJson(response, statusFor(error), { error: error?.message || "The current GAC fleet observation could not be processed." });
      }
      return true;
    },
  });
}

export { fleetPayload, isKnownNonShip, statusFor };
