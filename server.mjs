import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withCapabilityContract } from "./capability-contract.mjs";
import { LiveRosterCache } from "./live-roster-cache.mjs";

const port = positiveNumber(process.env.PORT, 8080);
const gatewayUrl = trimUrl(process.env.SWGOH_GATEWAY_URL);
const gatewayApiKey = String(process.env.SWGOH_GATEWAY_API_KEY || "").trim();
const requestTimeoutMs = positiveNumber(process.env.SWGOH_REQUEST_TIMEOUT_MS, 35000);
const rosterCacheFreshMs = positiveNumber(process.env.SWGOH_CACHE_FRESH_SECONDS, 90) * 1000;
const rosterCacheStaleMs = positiveNumber(process.env.SWGOH_CACHE_STALE_SECONDS, 600) * 1000;
const rosterCacheMaxEntries = Math.max(1, Math.floor(positiveNumber(process.env.SWGOH_CACHE_MAX_ENTRIES, 500)));
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const rosterCache = new LiveRosterCache({
  freshMs: rosterCacheFreshMs,
  staleMs: rosterCacheStaleMs,
  maxEntries: rosterCacheMaxEntries,
});

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

async function requestGateway(pathname, includeKey) {
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
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
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

function validLiveRoster(body) {
  return body?.source === "live" && body?.player && Array.isArray(body?.units);
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
      // ES module dependencies were cached for an hour even when index.html's
      // app.js URL changed. Revalidate source/data until we use hashed bundles.
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
