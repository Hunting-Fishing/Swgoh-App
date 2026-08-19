import { createGacAttackPlanApi } from "./gac-attack-plan-api.mjs";
import { createGacBoardObservationApi } from "./gac-board-observation-api.mjs";
import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";

const MAX_BODY_BYTES = 8 * 1024;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(code) ? code : "";
}

function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
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
    const error = new Error("Cross-origin GAC confirmation request rejected.");
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

export function createGacCurrentOpponentConfirmationApi(options = {}) {
  const requestGateway = options.requestGateway;
  const writeJson = options.writeJson;
  const authSession = options.authSession || supabaseAuthSession;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");
  const boardApi = createGacBoardObservationApi({
    requestGateway,
    writeJson,
    authSession,
    bracketIndex,
    confirmation,
    ...(options.boardObservations ? { observations: options.boardObservations } : {}),
  });
  const attackPlanApi = createGacAttackPlanApi({
    requestGateway,
    writeJson,
    authSession,
    bracketIndex,
    confirmation,
    ...(options.boardObservations ? { boards: options.boardObservations } : {}),
    ...(options.attackPlans ? { plans: options.attackPlans } : {}),
  });

  async function indexedBracket(code, currentEvent, playerContext) {
    const id = eventInstanceId(currentEvent, playerContext);
    if (!id) {
      const error = new Error("No current GAC event is available for confirmation.");
      error.status = 404;
      throw error;
    }

    let bracket = await bracketIndex.findIndexedBracket(code, id).catch(() => null);
    if (!bracket) {
      const liveBracket = await requestGateway(`/v1/gac/bracket/by-player/${code}`, true);
      await bracketIndex.persistBracket(liveBracket, {
        sourceRef: `/v1/gac/bracket/by-player/${code}`,
      });
      bracket = await bracketIndex.findIndexedBracket(code, id).catch(() => null) || liveBracket;
    }
    return { id, bracket };
  }

  return Object.freeze({
    async handle(request, response, url) {
      if (await boardApi.handle(request, response, url)) return true;
      if (await attackPlanApi.handle(request, response, url)) return true;
      const match = request.method === "POST" && url.pathname.match(/^\/api\/gac\/current-opponent\/(\d{9})\/confirm$/);
      if (!match) return false;

      try {
        assertSameOrigin(request);
        const user = await authSession.currentUser(request);
        if (!user?.id) {
          const error = new Error("Sign in to Command Center before saving a confirmed GAC opponent.");
          error.status = 401;
          throw error;
        }

        const code = normalizeAllyCode(match[1]);
        const body = await readJsonBody(request);
        const opponentAllyCode = normalizeAllyCode(body?.opponentAllyCode);
        if (!opponentAllyCode || opponentAllyCode === code) {
          const error = new Error("Select a different valid opponent Ally Code from the live bracket.");
          error.status = 400;
          throw error;
        }

        const [currentEvent, playerContext] = await Promise.all([
          requestGateway("/v1/gac/current-event", true),
          requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
        ]);
        const indexed = await indexedBracket(code, currentEvent, playerContext);
        const liveRound = bracketIndex.currentRoundFrom?.(playerContext, currentEvent) ?? null;
        const requestedRound = validRound(body?.round);
        if (liveRound && requestedRound && liveRound !== requestedRound) {
          const error = new Error(`The live GAC context reports Round ${liveRound}, not Round ${requestedRound}.`);
          error.status = 409;
          throw error;
        }
        const round = liveRound || requestedRound;
        if (!round) {
          const error = new Error("Select the current GAC round before saving this opponent.");
          error.status = 400;
          throw error;
        }

        const result = await confirmation.confirm(user.id, {
          allyCode: code,
          opponentAllyCode,
          eventInstanceId: indexed.id,
          round,
          roundSource: liveRound ? "live-context" : "verified-user-confirmed",
          sourceRef: "gac-command-center-live-bracket",
        });
        writeJson(response, 200, result, {
          "X-GAC-Source": result.source,
          "X-GAC-Confirmation": "verified-user",
        });
      } catch (error) {
        writeJson(response, statusFor(error), {
          error: error?.message || "The current GAC opponent could not be confirmed.",
        });
      }
      return true;
    },
  });
}

export {
  assertSameOrigin,
  eventInstanceId,
  normalizeAllyCode,
  readJsonBody,
  validRound,
};
