import { commandCenterHistoryService } from "./command-center-history-service.mjs";
import { guildHistoryArchiveService } from "./guild-history-archive-service.mjs";
import { guildIntelligenceService } from "./guild-intelligence-service.mjs";

function positiveLimit(value, fallback, max) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(max, parsed) : fallback;
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function safeStatus(error) {
  return [400, 404, 503].includes(error?.status) ? error.status : 502;
}

export function createCommandCenterHistoryApi(options = {}) {
  const service = options.service || commandCenterHistoryService;
  const intelligence = options.intelligence || guildIntelligenceService;
  const archive = options.archive || guildHistoryArchiveService;

  async function handle(request, response, url) {
    if (request.method !== "GET") return false;

    const playerMatch = url.pathname.match(/^\/api\/player\/(\d{9})\/history$/);
    if (playerMatch) {
      try {
        const body = await service.getPlayerHistory(playerMatch[1], {
          eventLimit: positiveLimit(url.searchParams.get("events"), 100, 500),
          snapshotLimit: positiveLimit(url.searchParams.get("snapshots"), 90, 365),
        });
        writeJson(response, 200, body);
      } catch (error) {
        writeJson(response, safeStatus(error), { error: error?.message || "Player history is unavailable." });
      }
      return true;
    }

    const intelligenceMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/intelligence$/);
    if (intelligenceMatch) {
      try {
        const body = await intelligence.getByPlayer(intelligenceMatch[1]);
        writeJson(response, 200, body);
      } catch (error) {
        writeJson(response, safeStatus(error), { error: error?.message || "Guild Intelligence is unavailable." });
      }
      return true;
    }

    const coverageMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/history\/coverage$/);
    if (coverageMatch) {
      try {
        writeJson(response, 200, await archive.getCoverage(coverageMatch[1]));
      } catch (error) {
        writeJson(response, safeStatus(error), { error: error?.message || "Historical Guild coverage is unavailable." });
      }
      return true;
    }

    const archiveMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/history\/archive$/);
    if (archiveMatch) {
      try {
        writeJson(response, 200, await archive.getSection(archiveMatch[1], url.searchParams.get("section")));
      } catch (error) {
        writeJson(response, safeStatus(error), { error: error?.message || "Historical Guild archive is unavailable." });
      }
      return true;
    }

    const guildMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/history$/);
    if (guildMatch) {
      try {
        const body = await service.getGuildHistoryByPlayer(guildMatch[1], {
          eventLimit: positiveLimit(url.searchParams.get("events"), 200, 1000),
          snapshotLimit: positiveLimit(url.searchParams.get("snapshots"), 90, 365),
        });
        writeJson(response, 200, body);
      } catch (error) {
        writeJson(response, safeStatus(error), { error: error?.message || "Guild history is unavailable." });
      }
      return true;
    }

    return false;
  }

  return Object.freeze({ handle });
}

export const commandCenterHistoryApi = createCommandCenterHistoryApi();
