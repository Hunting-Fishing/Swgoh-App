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

export function createGacApi({
  requestGateway,
  writeJson,
  history = gacHistoryService,
  historyImport = gacHistoryImportService,
  scouting = gacScoutingService,
  now = Date.now,
  importCooldownMs = 30 * 60 * 1000,
}) {
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");
  const matchup = createGacMatchupService({ requestGateway, history });
  const importPromises = new Map();
  const importCache = new Map();

  async function importHistoryOnce(allyCode, { force = false } = {}) {
    const cached = importCache.get(allyCode);
    if (!force && cached && cached.expiresAt > now()) return cached.value;
    if (importPromises.has(allyCode)) return importPromises.get(allyCode);

    const promise = Promise.resolve()
      .then(() => historyImport.importPlayer(allyCode))
      .then((result) => Object.freeze({
        status: "complete",
        source: result?.source || "c3po-gahistory",
        imported: Number(result?.imported || 0),
        importedRounds: Number(result?.importedRounds || 0),
        importedCounters: Number(result?.importedCounters || 0),
        importedAt: result?.importedAt || new Date(now()).toISOString(),
      }))
      .catch((error) => Object.freeze({
        status: "failed",
        error: String(error?.message || error).slice(0, 240),
        errorStatus: Number(error?.status || 0) || null,
      }))
      .then((value) => {
        importCache.set(allyCode, { value, expiresAt: now() + Math.max(60_000, Number(importCooldownMs) || 0) });
        return value;
      })
      .finally(() => importPromises.delete(allyCode));

    importPromises.set(allyCode, promise);
    return promise;
  }

  async function playerHistoryWithLazyImport(allyCode, options = {}) {
    let body = null;
    let initialError = null;
    try {
      body = await history.getPlayerHistory(allyCode, { limit: options.limit });
    } catch (error) {
      initialError = error;
      if (error?.status !== 404) throw error;
    }

    if (historyHasRows(body) || options.import === false) {
      if (body) return { body, autoImport: null };
      throw initialError;
    }

    const autoImport = await importHistoryOnce(allyCode, { force: options.forceImport === true });
    if (autoImport.status === "failed" && !body && [404, 409].includes(autoImport.errorStatus)) {
      const error = new Error(autoImport.error);
      error.status = autoImport.errorStatus;
      throw error;
    }

    if (autoImport.status === "complete" && (autoImport.imported > 0 || autoImport.importedRounds > 0)) {
      try {
        body = await history.getPlayerHistory(allyCode, { limit: options.limit });
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    }

    return { body: body || emptyHistoryBody(allyCode), autoImport };
  }

  return Object.freeze({
    async handle(request, response, url) {
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
          const body = await scouting.getScoutingReport(scoutingMatch[1], {
            limit: positiveLimit(url.searchParams.get("limit"), 2000, 5000),
          });
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "persisted-gac-battle-scouting" });
        } catch (error) {
          writeError(writeJson, response, error, "GAC opponent scouting evidence is unavailable.");
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
          const body = await requestGateway(`/v1/gac/bracket/by-player/${bracketByPlayerMatch[1]}`, true);
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The player's live GAC bracket is unavailable.");
        }
        return true;
      }

      const bracketMatch = url.pathname.match(/^\/api\/gac\/bracket\/(KYBER|AURODIUM|CHROMIUM|BRONZIUM|CARBONITE)\/(\d+)$/i);
      if (bracketMatch) {
        const league = bracketMatch[1].toUpperCase();
        const bracketIndex = Number(bracketMatch[2]);
        try {
          const body = await requestGateway(`/v1/gac/bracket/${league}/${bracketIndex}`, true);
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