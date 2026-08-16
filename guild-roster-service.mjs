import { LiveRosterCache } from "./live-roster-cache.mjs";

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeAllyCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error("A valid 9-digit Ally Code is required for the live guild roster.");
    error.status = 400;
    throw error;
  }
  return digits;
}

function validGuildRoster(body) {
  return body?.source === "live" && body?.guild && Array.isArray(body?.members);
}

function configFromEnv(env = process.env) {
  return Object.freeze({
    gatewayUrl: trimUrl(env.SWGOH_GATEWAY_URL),
    gatewayApiKey: String(env.SWGOH_GATEWAY_API_KEY || "").trim(),
    requestTimeoutMs: positiveNumber(env.SWGOH_GUILD_REQUEST_TIMEOUT_MS, 120_000),
    freshMs: positiveNumber(env.SWGOH_GUILD_CACHE_FRESH_SECONDS, 600) * 1000,
    staleMs: positiveNumber(env.SWGOH_GUILD_CACHE_STALE_SECONDS, 1800) * 1000,
    maxEntries: Math.max(1, Math.floor(positiveNumber(env.SWGOH_GUILD_CACHE_MAX_ENTRIES, 100))),
  });
}

function cacheKey(allyCode, includeActivity = false) {
  return `${allyCode}:${includeActivity ? "activity" : "roster"}`;
}

async function fetchGuildRoster(allyCode, config, fetchImpl, options = {}) {
  if (!config.gatewayUrl) {
    const error = new Error("SWGOH_GATEWAY_URL is not configured.");
    error.status = 503;
    throw error;
  }
  if (!config.gatewayApiKey) {
    const error = new Error("SWGOH_GATEWAY_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }

  const includeActivity = options.includeActivity === true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const suffix = includeActivity ? "?activity=1" : "";
    const response = await fetchImpl(
      `${config.gatewayUrl}/v1/guild/by-player/${encodeURIComponent(allyCode)}/roster${suffix}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-Key": config.gatewayApiKey,
          "User-Agent": "SWGOH-Command-Center (shared-guild-roster-service)",
        },
        redirect: "error",
        signal: controller.signal,
      },
    );

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }

    if (!response.ok) {
      const error = new Error(body?.error || `The live gateway returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    if (!validGuildRoster(body)) {
      const error = new Error("The live gateway returned an unexpected guild roster response.");
      error.status = 502;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export function createGuildRosterService(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const fetchImpl = options.fetch || fetch;
  const cache = options.cache || new LiveRosterCache({
    freshMs: config.freshMs,
    staleMs: config.staleMs,
    maxEntries: config.maxEntries,
    ...(typeof options.now === "function" ? { now: options.now } : {}),
  });

  const load = (allyCode, includeActivity) => fetchGuildRoster(allyCode, config, fetchImpl, { includeActivity });

  async function getGuildRoster(allyCode, options = {}) {
    const normalized = normalizeAllyCode(allyCode);
    const includeActivity = options.includeActivity === true;
    const key = cacheKey(normalized, includeActivity);
    if (options.forceRefresh) {
      const value = await cache.refresh(key, () => load(normalized, includeActivity));
      return Object.freeze({ value, cache: "refreshed", ageMs: 0, includeActivity });
    }
    const result = await cache.getOrLoad(key, () => load(normalized, includeActivity), {
      staleWhileRevalidate: options.staleWhileRevalidate !== false,
    });
    return Object.freeze({ ...result, includeActivity });
  }

  return Object.freeze({
    async getGuildRoster(allyCode, options = {}) {
      return getGuildRoster(allyCode, options);
    },
    async refreshGuildRoster(allyCode, options = {}) {
      return getGuildRoster(allyCode, {
        ...options,
        forceRefresh: true,
        staleWhileRevalidate: false,
      });
    },
    inspect(allyCode, options = {}) {
      const normalized = normalizeAllyCode(allyCode);
      return cache.inspect(cacheKey(normalized, options.includeActivity === true));
    },
    status() {
      return Object.freeze({
        mode: "process-local-coalesced-swr-lru",
        freshSeconds: Math.round(config.freshMs / 1000),
        staleSeconds: Math.round(config.staleMs / 1000),
        maxEntries: config.maxEntries,
        shared: false,
        sharedAcrossInstances: false,
        sharedBetweenWebAndDiscord: true,
        activityMode: "opt-in-separate-cache-key",
        coldRequestTimeoutSeconds: Math.round(config.requestTimeoutMs / 1000),
      });
    },
  });
}

// One process-wide instance is imported by both the HTTP API and Discord command path.
// Rich Guild activity is opt-in and kept on a cache key distinct from ordinary roster reads.
// This intentionally does not claim cross-instance/distributed cache sharing.
export const guildRosterService = createGuildRosterService(process.env);
