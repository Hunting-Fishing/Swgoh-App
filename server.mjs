import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accountOnboarding } from "./account-onboarding.mjs";
import { withCapabilityContract } from "./capability-contract.mjs";
import { canonicalRosterService } from "./canonical-roster-service.mjs";
import { commandCenterHistoryApi } from "./command-center-history-api.mjs";
import { commandCenterHistoryService } from "./command-center-history-service.mjs";
import { handleDiscordInteractionRequest } from "./discord-interaction-router.mjs";
import { discordStateStore } from "./discord-state-store.mjs";
import { discordTbPublicStatus } from "./discord-tb.mjs";
import { resolveGuildPlanningOverlay } from "./guild-planning-overlay.mjs";
import { guildRosterService } from "./guild-roster-service.mjs";
import { LiveRosterCache } from "./live-roster-cache.mjs";
import { aggregateRoteOperations } from "./rote-operations.mjs";
import { supabaseAuthSession } from "./supabase-auth-session.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

const port = positiveNumber(process.env.PORT, 8080);
const gatewayUrl = trimUrl(process.env.SWGOH_GATEWAY_URL);
const gatewayApiKey = String(process.env.SWGOH_GATEWAY_API_KEY || "").trim();
const requestTimeoutMs = positiveNumber(process.env.SWGOH_REQUEST_TIMEOUT_MS, 35000);
const modRequestTimeoutMs = positiveNumber(process.env.SWGOH_MOD_REQUEST_TIMEOUT_MS, 45000);
const rosterCacheFreshMs = positiveNumber(process.env.SWGOH_CACHE_FRESH_SECONDS, 90) * 1000;
const rosterCacheStaleMs = positiveNumber(process.env.SWGOH_CACHE_STALE_SECONDS, 600) * 1000;
const rosterCacheMaxEntries = Math.max(1, Math.floor(positiveNumber(process.env.SWGOH_CACHE_MAX_ENTRIES, 500)));
const modCacheFreshMs = positiveNumber(process.env.SWGOH_MOD_CACHE_FRESH_SECONDS, 300) * 1000;
const modCacheStaleMs = positiveNumber(process.env.SWGOH_MOD_CACHE_STALE_SECONDS, 900) * 1000;
const modCacheMaxEntries = Math.max(1, Math.floor(positiveNumber(process.env.SWGOH_MOD_CACHE_MAX_ENTRIES, 500)));
const roteOperationsUrl = String(process.env.SWGOH_ROTE_OPERATIONS_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json").trim();
const roteCacheMs = positiveNumber(process.env.SWGOH_ROTE_CACHE_SECONDS, 21600) * 1000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const rosterCache = new LiveRosterCache({
  freshMs: rosterCacheFreshMs,
  staleMs: rosterCacheStaleMs,
  maxEntries: rosterCacheMaxEntries,
});
const modCache = new LiveRosterCache({
  freshMs: modCacheFreshMs,
  staleMs: modCacheStaleMs,
  maxEntries: modCacheMaxEntries,
});
const roteCache = { value: null, expiresAt: 0, promise: null };

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function discordPublicStatus() {
  return Object.freeze({
    ...discordTbPublicStatus(),
    durableState: discordStateStore.status(),
  });
}

function writeJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function requestGateway(pathname, includeKey, timeoutMs = requestTimeoutMs) {
  if (!gatewayUrl) {
    const error = new Error("SWGOH_GATEWAY_URL is not configured.");
    error.status = 503;
    throw error;
  }
  if (includeKey && !gatewayApiKey) {
    const error = new Error("SWGOH_GATEWAY_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${gatewayUrl}${pathname}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(includeKey ? { "X-API-Key": gatewayApiKey } : {}),
      },
      redirect: "error",
      signal: controller.signal,
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { error: "The live gateway returned invalid JSON." };
    }

    if (!response.ok) {
      const error = new Error(body?.error || `The live gateway returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRoteOperations() {
  const now = Date.now();
  if (roteCache.value && roteCache.expiresAt > now) return roteCache.value;
  if (roteCache.promise) return roteCache.promise;

  roteCache.promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, 20_000));
    try {
      const response = await fetch(roteOperationsUrl, {
        headers: { Accept: "application/json", "User-Agent": "swgoh-roster-command" },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`ROTE game-data source returned HTTP ${response.status}.`);
      const payload = await response.json();
      const aggregated = aggregateRoteOperations(payload);
      return {
        ...aggregated,
        fetchedAt: new Date().toISOString(),
        cacheSeconds: Math.round(roteCacheMs / 1000),
      };
    } finally {
      clearTimeout(timeout);
    }
  })();

  try {
    const value = await roteCache.promise;
    roteCache.value = value;
    roteCache.expiresAt = Date.now() + roteCacheMs;
    return value;
  } catch (error) {
    if (roteCache.value) return { ...roteCache.value, stale: true };
    throw error;
  } finally {
    roteCache.promise = null;
  }
}

function validLiveRoster(body) {
  return body?.source === "live" && body?.player && Array.isArray(body?.units);
}

function validEquippedMods(body) {
  return body?.source === "live" && body?.player && Array.isArray(body?.units) && body?.summary;
}

async function loadLiveRoster(allyCode) {
  const body = await requestGateway(`/v1/player/${allyCode}`, true);
  if (!validLiveRoster(body)) {
    const error = new Error("The live gateway returned an unexpected roster response.");
    error.status = 502;
    throw error;
  }
  return withCapabilityContract(body);
}

async function loadEquippedMods(allyCode) {
  const body = await requestGateway(`/v1/mods/by-player/${allyCode}`, true, modRequestTimeoutMs);
  if (!validEquippedMods(body)) {
    const error = new Error("The live gateway returned an unexpected equipped-mod response.");
    error.status = 502;
    throw error;
  }
  return body;
}

async function writeCanonicalGuildOrLiveFallback(response, allyCode) {
  try {
    const body = await canonicalRosterService.getGuildRosterByPlayer(allyCode);
    writeJson(response, 200, body, {
      "X-Guild-Source": "supabase-canonical",
      "X-Guild-Cache": "persistent",
      "X-Guild-Refresh": "normal",
      "X-Guild-Logical-Members": String(body?.members?.length || 0),
      Age: String(Math.max(0, Math.floor((Date.now() - Date.parse(body?.fetchedAt || Date.now())) / 1000))),
    });
    return;
  } catch (canonicalError) {
    if (![404, 503].includes(canonicalError?.status)) throw canonicalError;
    const cached = await guildRosterService.getGuildRoster(allyCode, { staleWhileRevalidate: true });
    writeJson(response, 200, cached.value, {
      "X-Guild-Source": "comlink-live-fallback",
      "X-Guild-Cache": cached.cache,
      "X-Guild-Refresh": "fallback",
      "X-Guild-Canonical-Error": String(canonicalError?.message || "canonical unavailable").slice(0, 180),
      Age: String(Math.max(0, Math.floor((cached.ageMs || 0) / 1000))),
    });
  }
}

async function handleApi(request, response, url) {
  if (await commandCenterHistoryApi.handle(request, response, url)) return true;

  if (url.pathname === "/api/discord/status") {
    writeJson(response, 200, discordPublicStatus());
    return true;
  }

  if (url.pathname === "/api/health") {
    try {
      const gateway = await requestGateway("/healthz", false);
      writeJson(response, 200, {
        status: gateway?.status === "configured" ? "ready" : "needs-configuration",
        dataMode: "supabase-canonical-baseline+comlink-live-refresh",
        gateway,
        auth: supabaseAuthSession.status(),
        persistence: supabaseCoreStore.status(),
        canonicalRoster: canonicalRosterService.status(),
        commandCenterHistory: commandCenterHistoryService.status(),
        discordTb: discordPublicStatus(),
        rosterCache: {
          mode: "process-local-coalesced-swr-lru",
          freshSeconds: Math.round(rosterCacheFreshMs / 1000),
          staleSeconds: Math.round(rosterCacheStaleMs / 1000),
          maxEntries: rosterCacheMaxEntries,
          shared: false,
        },
        equippedModCache: {
          mode: "process-local-coalesced-swr-lru",
          freshSeconds: Math.round(modCacheFreshMs / 1000),
          staleSeconds: Math.round(modCacheStaleMs / 1000),
          maxEntries: modCacheMaxEntries,
          shared: false,
          coldRequestTimeoutSeconds: Math.round(modRequestTimeoutMs / 1000),
        },
        guildRosterCache: guildRosterService.status(),
        roteOperations: {
          source: "swgoh-utils/gamedata",
          cached: Boolean(roteCache.value),
          cacheSeconds: Math.round(roteCacheMs / 1000),
        },
      });
    } catch (error) {
      writeJson(response, error?.status || 502, {
        status: "live-gateway-unavailable",
        dataMode: "supabase-canonical-baseline+comlink-live-refresh",
        auth: supabaseAuthSession.status(),
        persistence: supabaseCoreStore.status(),
        canonicalRoster: canonicalRosterService.status(),
        commandCenterHistory: commandCenterHistoryService.status(),
        discordTb: discordPublicStatus(),
        error: error?.name === "AbortError" ? "The live gateway timed out." : error?.message || "The live gateway is unavailable.",
      });
    }
    return true;
  }

  if (url.pathname === "/api/rote/operations") {
    try {
      const body = await loadRoteOperations();
      writeJson(response, 200, body, {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600",
        "X-ROTE-Source": "swgoh-utils-gamedata",
      });
    } catch (error) {
      writeJson(response, 502, {
        error: error?.name === "AbortError" ? "The ROTE game-data source timed out." : error?.message || "ROTE operations data is unavailable.",
      });
    }
    return true;
  }

  const modMatch = url.pathname.match(/^\/api\/mods\/(\d{9})$/);
  if (modMatch) {
    try {
      const allyCode = modMatch[1];
      const cached = await modCache.getOrLoad(allyCode, () => loadEquippedMods(allyCode));
      writeJson(response, 200, cached.value, {
        "X-Mod-Source": "comlink-live-equipped",
        "X-Mod-Cache": cached.cache,
        Age: String(Math.max(0, Math.floor((cached.ageMs || 0) / 1000))),
      });
    } catch (error) {
      const status = [400, 401, 404, 429, 503].includes(error?.status) ? error.status : 502;
      writeJson(response, status, {
        error: error?.name === "AbortError" ? "The live equipped-mod request timed out." : error?.message || "The live equipped-mod pipeline is unavailable.",
      });
    }
    return true;
  }

  const planningOverlayMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/planning-overlay$/);
  if (planningOverlayMatch) {
    try {
      const lookupAllyCode = planningOverlayMatch[1];
      const cached = await guildRosterService.getGuildRoster(lookupAllyCode, { staleWhileRevalidate: false });
      const overlay = await resolveGuildPlanningOverlay(cached.value);
      writeJson(response, 200, overlay, {
        "X-Guild-Planning-Overlay": overlay.bound ? "bound" : "unbound",
        "X-Guild-Planning-Source": overlay.source,
      });
    } catch (error) {
      writeJson(response, 502, {
        error: error?.message || "The guild planning overlay is unavailable.",
      });
    }
    return true;
  }

  const guildBaselineMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/baseline$/);
  if (guildBaselineMatch) {
    try {
      const body = await canonicalRosterService.getGuildRosterByPlayer(guildBaselineMatch[1]);
      writeJson(response, 200, body, {
        "X-Guild-Source": "supabase-canonical",
        "X-Guild-Cache": "persistent",
        "X-Guild-Logical-Members": String(body?.members?.length || 0),
      });
    } catch (error) {
      writeJson(response, [400, 404, 503].includes(error?.status) ? error.status : 502, {
        error: error?.message || "The persisted Guild baseline is unavailable.",
      });
    }
    return true;
  }

  const guildMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/roster$/);
  if (guildMatch) {
    try {
      const allyCode = guildMatch[1];
      const forceRefresh = url.searchParams.get("refresh") === "1";
      if (!forceRefresh) {
        await writeCanonicalGuildOrLiveFallback(response, allyCode);
        return true;
      }
      const cached = await guildRosterService.getGuildRoster(allyCode, {
        forceRefresh: true,
        staleWhileRevalidate: false,
      });
      writeJson(response, 200, cached.value, {
        "X-Guild-Source": "comlink-live",
        "X-Guild-Cache": cached.cache,
        "X-Guild-Refresh": "requested",
        Age: String(Math.max(0, Math.floor((cached.ageMs || 0) / 1000))),
      });
    } catch (error) {
      const status = [400, 401, 404, 429, 503].includes(error?.status) ? error.status : 502;
      writeJson(response, status, {
        error: error?.name === "AbortError" ? "The live guild request timed out." : error?.message || "The SWGOH guild pipeline is unavailable.",
      });
    }
    return true;
  }

  const playerBaselineMatch = url.pathname.match(/^\/api\/player\/(\d{9})\/baseline$/);
  if (playerBaselineMatch) {
    try {
      const body = await canonicalRosterService.getPlayerRoster(playerBaselineMatch[1]);
      writeJson(response, 200, body, {
        "X-Roster-Source": "supabase-canonical",
        "X-Roster-Cache": "persistent",
        "X-Roster-Logical-Units": String((body?.units?.length || 0) + (body?.ships?.length || 0)),
      });
    } catch (error) {
      writeJson(response, [400, 404, 503].includes(error?.status) ? error.status : 502, {
        error: error?.message || "The persisted player roster is unavailable.",
      });
    }
    return true;
  }

  const playerMatch = url.pathname.match(/^\/api\/player\/(\d{9})$/);
  if (!playerMatch) return false;

  try {
    const allyCode = playerMatch[1];
    const cached = await rosterCache.getOrLoad(allyCode, () => loadLiveRoster(allyCode));
    writeJson(response, 200, cached.value, {
      "X-Roster-Source": "comlink-live",
      "X-Roster-Cache": cached.cache,
      Age: String(Math.max(0, Math.floor((cached.ageMs || 0) / 1000))),
    });
  } catch (error) {
    const status = [400, 401, 404, 429, 503].includes(error?.status) ? error.status : 502;
    writeJson(response, status, {
      error: error?.name === "AbortError" ? "The live SWGOH request timed out." : error?.message || "The live SWGOH pipeline is unavailable.",
    });
  }
  return true;
}

async function serveStatic(response, pathname) {
  let relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\/+/, ""));
  relative = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(root, relative);

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const activelyVersionedSource = [".html", ".js", ".css", ".json"].includes(extension);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
      "Cache-Control": activelyVersionedSource ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    response.end(data);
  } catch {
    try {
      const data = await readFile(path.join(root, "index.html"));
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(data);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");

  if (url.pathname.startsWith("/api/auth/")) {
    const handled = await supabaseAuthSession.handle(request, response, url);
    if (handled) return;
  }

  if (url.pathname.startsWith("/api/account/")) {
    const handled = await accountOnboarding.handle(request, response, url);
    if (handled) return;
  }

  if (request.method === "POST" && url.pathname === "/api/discord/interactions") {
    await handleDiscordInteractionRequest(request, response);
    return;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed." }, { Allow: "GET, POST" });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(request, response, url);
    if (!handled) writeJson(response, 404, { error: "API route not found." });
    return;
  }

  await serveStatic(response, url.pathname);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`SWGOH Roster Command listening on port ${port}`);
});
