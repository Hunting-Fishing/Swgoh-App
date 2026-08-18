import { gacHistoryService } from "./gac-history-service.mjs";
import { createGacMatchupService } from "./gac-matchup-service.mjs";

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

export function createGacApi({ requestGateway, writeJson, history = gacHistoryService }) {
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");
  const matchup = createGacMatchupService({ requestGateway, history });

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
          const body = await history.getPlayerHistory(historyMatch[1], {
            limit: positiveLimit(url.searchParams.get("limit"), 30, 100),
          });
          writeJson(response, 200, body, { "X-GAC-Source": "persisted-history" });
        } catch (error) {
          writeError(writeJson, response, error, "Persisted GAC history is unavailable.");
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