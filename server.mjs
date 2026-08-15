import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withCapabilityContract } from "./capability-contract.mjs";
import { LiveRosterCache } from "./live-roster-cache.mjs";
import { aggregateRoteOperations } from "./rote-operations.mjs";

const port = positiveNumber(process.env.PORT, 8080);
const gatewayUrl = trimUrl(process.env.SWGOH_GATEWAY_URL);
const gatewayApiKey = String(process.env.SWGOH_GATEWAY_API_KEY || "").trim();
const requestTimeoutMs = positiveNumber(process.env.SWGOH_REQUEST_TIMEOUT_MS, 35000);
const guildRequestTimeoutMs = positiveNumber(process.env.SWGOH_GUILD_REQUEST_TIMEOUT_MS, 120000);
const rosterCacheFreshMs = positiveNumber(process.env.SWGOH_CACHE_FRESH_SECONDS, 90) * 1000;
const rosterCacheStaleMs = positiveNumber(process.env.SWGOH_CACHE_STALE_SECONDS, 600) * 1000;
const rosterCacheMaxEntries = Math.max(1, Math.floor(positiveNumber(process.env.SWGOH_CACHE_MAX_ENTRIES, 500)));
const guildCacheFreshMs = positiveNumber(process.env.SWGOH_GUILD_CACHE_FRESH_SECONDS, 600) * 1000;
const guildCacheStaleMs = positiveNumber(process.env.SWGOH_GUILD_CACHE_STALE_SECONDS, 1800) * 1000;
const guildCacheMaxEntries = Math.max(1, Math.floor(positiveNumber(process.env.SWGOH_GUILD_CACHE_MAX_ENTRIES, 100)));
const roteOperationsUrl = String(process.env.SWGOH_ROTE_OPERATIONS_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json").trim();
const roteCacheMs = positiveNumber(process.env.SWGOH_ROTE_CACHE_SECONDS, 21600) * 1000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const rosterCache = new LiveRosterCache({
  freshMs: rosterCacheFreshMs,
  staleMs: rosterCacheStaleMs,
  maxEntries: rosterCacheMaxEntries,
});
const guildCache = new LiveRosterCache({
  freshMs: guildCacheFreshMs,
  staleMs: guildCacheStaleMs,
  maxEntries: guildCacheMaxEntries,
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

function validGuildRoster(body) {
  return body?.source === "live" && body?.guild && Array.isArray(body?.members);
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

async function loadGuildRoster(allyCode) {
  const body = await requestGateway(`/v1/guild/by-player/${allyCode}/roster`, true, guildRequestTimeoutMs);
  if (!validGuildRoster(body)) {
    const error = new Error("The live gateway returned an unexpected guild roster response.");
    error.status = 502;
    throw error;
  }
  return body;
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health") {
    try {
      const gateway = await requestGateway("/healthz", false);
      writeJson(response, 200, {
        status: gateway?.status === "configured" ? "ready" : "needs-configuration",
        liveOnly: true,
        gateway,
        rosterCache: {
          mode: "process-local-coalesced-swr-lru",
          freshSeconds: Math.round(rosterCacheFreshMs / 1000),
          staleSeconds: Math.round(rosterCacheStaleMs / 1000),
          maxEntries: rosterCacheMaxEntries,
          shared: false,
        },
        guildRosterCache: {
          mode: "process-local-coalesced-swr-lru",
          freshSeconds: Math.round(guildCacheFreshMs / 1000),
          staleSeconds: Math.round(guildCacheStaleMs / 1000),
          maxEntries: guildCacheMaxEntries,
          shared: false,
          coldRequestTimeoutSeconds: Math.round(guildRequestTimeoutMs / 1000),
        },
        roteOperations: {
          source: "swgoh-utils/gamedata",
          cached: Boolean(roteCache.value),
          cacheSeconds: Math.round(roteCacheMs / 1000),
        },
      });
    } catch (error) {
      writeJson(response, error?.status || 502, {
        status: "unavailable",
        liveOnly: true,
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

  const guildMatch = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/roster$/);
  if (guildMatch) {
    try {
      const allyCode = guildMatch[1];
      const cached = await guildCache.getOrLoad(allyCode, () => loadGuildRoster(allyCode));
      writeJson(response, 200, cached.value, {
        "X-Guild-Source": "comlink-live",
        "X-Guild-Cache": cached.cache,
        Age: String(Math.max(0, Math.floor((cached.ageMs || 0) / 1000))),
      });
    } catch (error) {
      const status = [400, 401, 404, 429, 503].includes(error?.status) ? error.status : 502;
      writeJson(response, status, {
        error: error?.name === "AbortError" ? "The live guild request timed out." : error?.message || "The live SWGOH guild pipeline is unavailable.",
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
  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed." }, { Allow: "GET" });
    return;
  }

  const url = new URL(request.url || "/", "http://localhost");
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
