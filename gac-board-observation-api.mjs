import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";

const MAX_BODY_BYTES = 12 * 1024;
const DATACRON_STATES = new Set(["unknown", "none", "assigned"]);

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(code) ? code : "";
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function validSize(value) {
  const size = Number(value);
  return size === 3 || size === 5 ? size : null;
}
function validDatacronState(value, hasDatacron = false) {
  const state = clean(value).toLowerCase();
  if (!state) return hasDatacron ? "assigned" : "unknown";
  return DATACRON_STATES.has(state) ? state : "";
}
function eventInstanceId(...values) {
  for (const value of values) {
    const id = clean(value?.eventInstanceId || value?.event?.eventInstanceId);
    if (id) return id;
  }
  return "";
}
function expectedOrigin(request) {
  const host = clean(request?.headers?.["x-forwarded-host"] || request?.headers?.host);
  const proto = clean(clean(request?.headers?.["x-forwarded-proto"]).split(",")[0]) || "https";
  return host ? `${proto}://${host}` : "";
}
function assertSameOrigin(request) {
  const origin = clean(request?.headers?.origin);
  if (!origin) return;
  const expected = expectedOrigin(request);
  if (!expected || origin !== expected) {
    const error = new Error("Cross-origin GAC board request rejected.");
    error.status = 403;
    throw error;
  }
}
async function readJsonBody(request) {
  const type = clean(request?.headers?.["content-type"]).toLowerCase();
  if (type && !type.startsWith("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.status = 415;
    throw error;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.status = 400;
    throw error;
  }
}
function statusFor(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
function rosterUnits(body = {}) {
  const values = [...asArray(body?.units), ...asArray(body?.roster), ...asArray(body?.rosterUnit)];
  const index = new Map();
  for (const unit of values) {
    const id = normalizeBaseId(unit?.baseId || unit?.base_id || unit?.definitionId || unit?.defId);
    if (id) index.set(id, unit);
  }
  return index;
}
function datacronById(body = {}, idInput, rosterLabel = "roster") {
  const id = clean(idInput);
  if (!id) return null;
  if (!Array.isArray(body?.datacrons)) {
    const error = new Error(`The ${rosterLabel} live roster did not expose individual datacrons, so this assignment cannot be persisted canonically.`);
    error.status = 409;
    throw error;
  }
  const found = body.datacrons.find((datacron) => clean(datacron?.id) === id);
  if (!found) {
    const error = new Error(`The selected datacron ID is not present in the ${rosterLabel} current live datacron inventory.`);
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
    return { eventInstanceId: id, round, confirmed };
  }

  return Object.freeze({
    async handle(request, response, url) {
      const match = url.pathname.match(/^\/api\/gac\/current-board\/(\d{9})\/(defense|my-defense)$/);
      if (!match || !["GET", "POST", "DELETE"].includes(request.method)) return false;
      const owner = match[2] === "my-defense" ? "player" : "opponent";

      try {
        if (["POST", "DELETE"].includes(request.method)) assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in with the verified owner account to save or reload current GAC board evidence.");
          error.status = 401;
          throw error;
        }

        const code = normalizeAllyCode(match[1]);
        if (request.method === "GET") {
          const context = await currentContext(code, url.searchParams.get("round"));
          const input = {
            allyCode: code,
            opponentAllyCode: context.confirmed.opponent.allyCode,
            eventInstanceId: context.eventInstanceId,
            round: context.round,
          };
          const result = owner === "player"
            ? await observations.getPlayerDefenses(user.id, input)
            : await observations.getDefenses(user.id, input);
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-Board-Evidence": "verified-user",
            "X-GAC-Board-Owner": owner,
          });
          return true;
        }

        const body = await readJsonBody(request);
        const context = await currentContext(code, body?.round);
        const confirmedOpponent = normalizeAllyCode(context.confirmed.opponent.allyCode);
        const commonInput = {
          allyCode: code,
          opponentAllyCode: confirmedOpponent,
          eventInstanceId: context.eventInstanceId,
          round: context.round,
        };

        if (request.method === "DELETE") {
          const result = owner === "player"
            ? await observations.deletePlayerDefense(user.id, { ...commonInput, id: body?.id })
            : await observations.deleteDefense(user.id, { ...commonInput, id: body?.id });
          writeJson(response, 200, result, {
            "X-GAC-Source": result.source,
            "X-GAC-Board-Evidence": "verified-user",
            "X-GAC-Board-Owner": owner,
          });
          return true;
        }

        if (owner === "opponent") {
          const submittedOpponent = normalizeAllyCode(body?.opponentAllyCode);
          if (!submittedOpponent || submittedOpponent !== confirmedOpponent) {
            const error = new Error("The submitted opponent does not match the verified current-round opponent.");
            error.status = 409;
            throw error;
          }
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

        const rosterCode = owner === "player" ? code : confirmedOpponent;
        const rosterLabel = owner === "player" ? "player" : "opponent";
        const liveRoster = await requestGateway(`/v1/player/${rosterCode}`, true);
        const liveUnits = rosterUnits(liveRoster);
        const missing = members.filter((id) => !liveUnits.has(id));
        if (missing.length) {
          const error = new Error(`The submitted defense contains units not present in the ${rosterLabel} current live roster: ${missing.join(", ")}.`);
          error.status = 409;
          throw error;
        }

        const datacronId = clean(body?.datacronId);
        const datacron = datacronId ? datacronById(liveRoster, datacronId, rosterLabel) : null;
        const datacronState = validDatacronState(body?.datacronState, Boolean(datacron?.id));
        if (!datacronState) {
          const error = new Error("Datacron state must be unknown, none, or assigned.");
          error.status = 400;
          throw error;
        }
        if (datacron?.id && datacronState !== "assigned") {
          const error = new Error("A submitted Datacron ID requires datacronState=assigned.");
          error.status = 400;
          throw error;
        }
        if (!datacron?.id && datacronState === "assigned") {
          const error = new Error("datacronState=assigned requires an exact Datacron ID from the current live roster.");
          error.status = 400;
          throw error;
        }
        const saveInput = {
          ...commonInput,
          size,
          leaderBaseId,
          members,
          datacron,
          datacronState,
          zone: body?.zone,
          slot: body?.slot,
          sourceRef: owner === "player" ? "gac-command-center-my-defense" : "gac-command-center-current-board",
        };
        const result = owner === "player"
          ? await observations.savePlayerDefense(user.id, saveInput)
          : await observations.saveDefense(user.id, saveInput);
        writeJson(response, 200, result, {
          "X-GAC-Source": result.source,
          "X-GAC-Board-Evidence": "verified-user",
          "X-GAC-Board-Owner": owner,
        });
      } catch (error) {
        writeJson(response, statusFor(error), { error: error?.message || "The current GAC board observation could not be processed." });
      }
      return true;
    },
  });
}

export {
  assertSameOrigin,
  datacronById,
  eventInstanceId,
  normalizeAllyCode,
  normalizeBaseId,
  readJsonBody,
  rosterUnits,
  validDatacronState,
  validRound,
  validSize,
};
