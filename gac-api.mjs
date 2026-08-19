import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { gacCounterEvidenceBatchService } from "./gac-counter-evidence-batch-service.mjs";
import { createGacCurrentOpponentConfirmationApi } from "./gac-current-opponent-confirmation-api.mjs";
import { gacHistoryImportService } from "./gac-history-import-service.mjs";
import { gacHistoryService } from "./gac-history-service.mjs";
import { createGacMatchupService } from "./gac-matchup-service.mjs";
import { gacScoutingService } from "./gac-scouting-service.mjs";

function writeError(writeJson, response, error, fallback) {
  const status = [400, 401, 404, 409, 429, 503].includes(error?.status) ? error.status : 502;
  writeJson(response, status, {
    error: error?.name === "AbortError" ? "The GAC request timed out." : error?.message || fallback,
  });
}

function positiveLimit(value, fallback, max) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, parsed) : fallback;
}

function emptyHistoryBody(allyCode) {
  return Object.freeze({
    source: "gac-history",
    player: Object.freeze({ allyCode, name: "", playerId: "" }),
    rounds: Object.freeze([]),
    summary: Object.freeze({ rounds: 0, wins: 0, losses: 0, verified: 0 }),
  });
}

function historyHasRows(body) {
  return Array.isArray(body?.rounds) && body.rounds.length > 0;
}

function scoutingHasEvidence(body) {
  return Boolean(
    body?.coverage?.hasDefenseEvidence ||
    body?.coverage?.hasOffenseEvidence ||
    (Array.isArray(body?.defensiveTendencies) && body.defensiveTendencies.length) ||
    (Array.isArray(body?.offensiveTendencies) && body.offensiveTendencies.length)
  );
}

function eventInstanceId(...values) {
  for (const value of values) {
    const id = String(value?.eventInstanceId || value?.event?.eventInstanceId || "").trim();
    if (id) return id;
  }
  return "";
}

function allyCode(value) {
  const normalized = String(value || "").replace(/\D/g, "");
  return /^\d{9}$/.test(normalized) ? normalized : "";
}

export function createGacApi({
  requestGateway,
  writeJson,
  history = gacHistoryService,
  historyImport = gacHistoryImportService,
  bracketIndex = gacBracketIndexService,
  counterBatch = gacCounterEvidenceBatchService,
  scouting = gacScoutingService,
  now = Date.now,
  importCooldownMs = 30 * 60 * 1000,
}) {
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");
  const matchup = createGacMatchupService({ requestGateway, history });
  const confirmationApi = createGacCurrentOpponentConfirmationApi({ requestGateway, writeJson, bracketIndex });
  const importPromises = new Map();
  const importCache = new Map();

  async function importHistoryOnce(code, { force = false } = {}) {
    const cached = importCache.get(code);
    if (!force && cached && cached.expiresAt > now()) return cached.value;
    if (importPromises.has(code)) return importPromises.get(code);

    const promise = Promise.resolve()
      .then(() => historyImport.importPlayer(code))
      .then((result) => Object.freeze({
        status: "complete",
        source: result?.source || "c3po-gahistory",
        imported: Number(result?.imported || 0),
        importedRounds: Number(result?.importedRounds || 0),
        importedCounters: Number(result?.importedCounters || 0),
        failedModes: Number(result?.failedModes || 0),
        importedAt: result?.importedAt || new Date(now()).toISOString(),
      }))
      .catch((error) => Object.freeze({
        status: "failed",
        error: String(error?.message || error).slice(0, 240),
        errorStatus: Number(error?.status || 0) || null,
      }))
      .then((value) => {
        importCache.set(code, { value, expiresAt: now() + Math.max(60_000, Number(importCooldownMs) || 0) });
        return value;
      })
      .finally(() => importPromises.delete(code));

    importPromises.set(code, promise);
    return promise;
  }

  async function playerHistoryWithLazyImport(code, options = {}) {
    let body = null;
    let initialError = null;
    try {
      body = await history.getPlayerHistory(code, { limit: options.limit });
    } catch (error) {
      initialError = error;
      if (error?.status !== 404) throw error;
    }

    if (historyHasRows(body) || options.import === false) {
      if (body) return { body, autoImport: null };
      throw initialError;
    }

    const autoImport = await importHistoryOnce(code, { force: options.forceImport === true });
    if (autoImport.status === "failed" && !body && [404, 409].includes(autoImport.errorStatus)) {
      const error = new Error(autoImport.error);
      error.status = autoImport.errorStatus;
      throw error;
    }

    if (autoImport.status === "complete" && (autoImport.imported > 0 || autoImport.importedRounds > 0)) {
      try {
        body = await history.getPlayerHistory(code, { limit: options.limit });
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    }

    return { body: body || emptyHistoryBody(code), autoImport };
  }

  async function scoutingWithLazyImport(code, options = {}) {
    let body = await scouting.getScoutingReport(code, { limit: options.limit });
    if (scoutingHasEvidence(body) || options.import === false) return { body, autoImport: null };

    const autoImport = await importHistoryOnce(code, { force: options.forceImport === true });
    if (autoImport.status === "complete" && autoImport.imported > 0) {
      body = await scouting.getScoutingReport(code, { limit: options.limit });
    }
    return { body, autoImport };
  }

  async function attachOpponentResolution(code, bracket, currentEvent, playerContext) {
    const id = eventInstanceId(currentEvent, bracket, playerContext);
    const round = bracketIndex?.currentRoundFrom?.(playerContext, currentEvent) ?? null;
    if (!id || !round || !bracketIndex?.findExactOpponent) {
      return {
        ...bracket,
        currentOpponent: null,
        opponentResolution: {
          exact: false,
          method: "public-bracket-only",
          eventInstanceId: id,
          round,
          reason: !round ? "current-round-not-exposed" : "exact-opponent-evidence-unavailable",
        },
      };
    }

    let exact = await bracketIndex.findExactOpponent(code, id, round).catch(() => null);
    let autoImport = null;
    if (!exact) {
      autoImport = await importHistoryOnce(code);
      if (autoImport.status === "complete" && (autoImport.imported > 0 || autoImport.importedRounds > 0)) {
        exact = await bracketIndex.findExactOpponent(code, id, round).catch(() => null);
      }
    }

    if (exact) {
      const exactAllyCode = allyCode(exact?.opponent?.allyCode);
      const belongsToBracket = Array.isArray(bracket?.players)
        && bracket.players.some((entry) => allyCode(entry?.allyCode) === exactAllyCode);
      if (exactAllyCode && belongsToBracket) {
        return {
          ...bracket,
          currentOpponent: exact.opponent,
          opponentResolution: exact.resolution,
          ...(autoImport ? { opponentHistoryImport: autoImport } : {}),
        };
      }
    }

    return {
      ...bracket,
      currentOpponent: null,
      opponentResolution: {
        exact: false,
        method: "public-bracket-only",
        eventInstanceId: id,
        round,
        reason: exact ? "historical-opponent-not-in-live-bracket" : "matching-event-round-evidence-not-found",
      },
      ...(autoImport ? { opponentHistoryImport: autoImport } : {}),
    };
  }

  async function loadBracketByPlayer(code, options = {}) {
    const [currentEvent, playerContext] = await Promise.all([
      requestGateway("/v1/gac/current-event", true),
      requestGateway(`/v1/gac/player/${code}`, true).catch(() => ({})),
    ]);
    const id = eventInstanceId(currentEvent, playerContext);
    let bracket = null;
    let cache = "miss";

    if (!options.refresh && id && bracketIndex?.findIndexedBracket) {
      bracket = await bracketIndex.findIndexedBracket(code, id).catch(() => null);
      if (bracket) cache = "hit";
    }

    if (!bracket) {
      bracket = await requestGateway(`/v1/gac/bracket/by-player/${code}`, true);
      if (bracketIndex?.persistBracket) {
        try {
          const indexStatus = await bracketIndex.persistBracket(bracket, {
            sourceRef: `/v1/gac/bracket/by-player/${code}`,
          });
          bracket = { ...bracket, indexStatus };
        } catch (error) {
          bracket = {
            ...bracket,
            indexStatus: {
              indexed: false,
              error: String(error?.message || error).slice(0, 180),
            },
          };
        }
      }
    }

    const resolved = await attachOpponentResolution(code, bracket, currentEvent, playerContext);
    return { body: resolved, cache };
  }

  return Object.freeze({
    async handle(request, response, url) {
      if (await confirmationApi.handle(request, response, url)) return true;
      if (request.method !== "GET") return false;

      const matchupMatch = url.pathname.match(/^\/api\/gac\/matchup\/(\d{9})$/);
      if (matchupMatch) {
        try {
          const body = await matchup.analyze(matchupMatch[1], {
            enemyLeaderBaseId: url.searchParams.get("enemyLeader"),
          });
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "live-gac-matchup-intelligence" });
        } catch (error) {
          writeError(writeJson, response, error, "The live GAC matchup could not be analyzed.");
        }
        return true;
      }

      if (url.pathname === "/api/gac/current-event") {
        try {
          const body = await requestGateway("/v1/gac/current-event", true);
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The current GAC event is unavailable.");
        }
        return true;
      }

      const historyMatch = url.pathname.match(/^\/api\/gac\/history\/(\d{9})$/);
      if (historyMatch) {
        try {
          const result = await playerHistoryWithLazyImport(historyMatch[1], {
            limit: positiveLimit(url.searchParams.get("limit"), 30, 100),
            import: url.searchParams.get("import") !== "0",
            forceImport: url.searchParams.get("refresh") === "1",
          });
          const body = result.autoImport ? { ...result.body, autoImport: result.autoImport } : result.body;
          writeJson(response, 200, body, {
            "X-GAC-Source": "persisted-history",
            ...(result.autoImport ? { "X-GAC-History-Import": result.autoImport.status } : {}),
          });
        } catch (error) {
          writeError(writeJson, response, error, "Persisted GAC history is unavailable.");
        }
        return true;
      }

      const scoutingMatch = url.pathname.match(/^\/api\/gac\/scouting\/(\d{9})$/);
      if (scoutingMatch) {
        try {
          const result = await scoutingWithLazyImport(scoutingMatch[1], {
            limit: positiveLimit(url.searchParams.get("limit"), 2000, 5000),
            import: url.searchParams.get("import") !== "0",
            forceImport: url.searchParams.get("refresh") === "1",
          });
          const body = result.autoImport ? { ...result.body, autoImport: result.autoImport } : result.body;
          writeJson(response, 200, body, {
            "X-GAC-Source": body?.source || "persisted-gac-battle-scouting",
            ...(result.autoImport ? { "X-GAC-History-Import": result.autoImport.status } : {}),
          });
        } catch (error) {
          writeError(writeJson, response, error, "GAC opponent scouting evidence is unavailable.");
        }
        return true;
      }

      if (url.pathname === "/api/gac/counters/batch") {
        try {
          const leaders = [
            ...url.searchParams.getAll("enemyLeader"),
            ...String(url.searchParams.get("leaders") || "").split(","),
          ].filter(Boolean);
          const body = await counterBatch.getCounterEvidenceBatch({
            format: url.searchParams.get("format"),
            enemyLeaderBaseIds: leaders,
            limit: positiveLimit(url.searchParams.get("limit"), 40, 100),
          });
          writeJson(response, 200, body, { "X-GAC-Source": "persisted-counter-evidence-batch" });
        } catch (error) {
          writeError(writeJson, response, error, "Batched GAC counter evidence is unavailable.");
        }
        return true;
      }

      if (url.pathname === "/api/gac/counters") {
        try {
          const body = await history.getCounterEvidence({
            format: url.searchParams.get("format"),
            enemyLeaderBaseId: url.searchParams.get("enemyLeader"),
            limit: positiveLimit(url.searchParams.get("limit"), 100, 500),
          });
          writeJson(response, 200, body, { "X-GAC-Source": "persisted-counter-evidence" });
        } catch (error) {
          writeError(writeJson, response, error, "GAC counter evidence is unavailable.");
        }
        return true;
      }

      const playerMatch = url.pathname.match(/^\/api\/gac\/player\/(\d{9})$/);
      if (playerMatch) {
        try {
          const body = await requestGateway(`/v1/gac/player/${playerMatch[1]}`, true);
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The player GAC context is unavailable.");
        }
        return true;
      }

      const bracketByPlayerMatch = url.pathname.match(/^\/api\/gac\/bracket\/by-player\/(\d{9})$/);
      if (bracketByPlayerMatch) {
        try {
          const result = await loadBracketByPlayer(bracketByPlayerMatch[1], {
            refresh: url.searchParams.get("refresh") === "1",
          });
          writeJson(response, 200, result.body, {
            "X-GAC-Source": result.body?.source || "comlink-live",
            "X-GAC-Bracket-Cache": result.cache,
          });
        } catch (error) {
          writeError(writeJson, response, error, "The player's live GAC bracket is unavailable.");
        }
        return true;
      }

      const bracketMatch = url.pathname.match(/^\/api\/gac\/bracket\/(KYBER|AURODIUM|CHROMIUM|BRONZIUM|CARBONITE)\/(\d+)$/i);
      if (bracketMatch) {
        const league = bracketMatch[1].toUpperCase();
        const bracketNumber = Number(bracketMatch[2]);
        try {
          let body = await requestGateway(`/v1/gac/bracket/${league}/${bracketNumber}`, true);
          if (bracketIndex?.persistBracket) {
            try {
              body = {
                ...body,
                indexStatus: await bracketIndex.persistBracket(body, {
                  sourceRef: `/v1/gac/bracket/${league}/${bracketNumber}`,
                }),
              };
            } catch {
              // Direct bracket reads remain available even if persistence is temporarily unavailable.
            }
          }
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The requested GAC bracket is unavailable.");
        }
        return true;
      }

      return false;
    },
  });
}
