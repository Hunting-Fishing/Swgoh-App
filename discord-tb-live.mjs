import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateRoteOperations } from "./rote-operations.mjs";
import { buildGuildRoteOperationSafety } from "./public/guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments } from "./public/guild-rote-safe-planner.js";
import { buildGuildTbPhaseCommand } from "./public/guild-tb-phase-command-model.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const guildCache = new Map();
const roteCache = { value: null, expiresAt: 0, promise: null };
const catalogCache = { value: null, promise: null };

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function validGuildRoster(body) {
  return body?.source === "live" && body?.guild && Array.isArray(body?.members);
}

async function fetchJson(url, options = {}, timeoutMs = 35_000, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: "error" });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = new Error(body?.error || `Upstream request returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    if (body == null) throw new Error("Upstream request returned invalid JSON.");
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCatalog() {
  if (catalogCache.value) return catalogCache.value;
  if (catalogCache.promise) return catalogCache.promise;
  catalogCache.promise = readFile(path.join(root, "data", "catalog.json"), "utf8")
    .then((text) => JSON.parse(text))
    .then((body) => {
      if (!Array.isArray(body?.units) || !body.units.length) throw new Error("Static SWGOH unit catalog is unavailable.");
      catalogCache.value = body.units;
      return body.units;
    })
    .finally(() => {
      catalogCache.promise = null;
    });
  return catalogCache.promise;
}

function createConfig(env) {
  const gatewayUrl = trimUrl(env.SWGOH_GATEWAY_URL);
  const gatewayApiKey = String(env.SWGOH_GATEWAY_API_KEY || "").trim();
  const requestTimeoutMs = positiveNumber(env.SWGOH_REQUEST_TIMEOUT_MS, 35_000);
  const guildRequestTimeoutMs = positiveNumber(env.SWGOH_GUILD_REQUEST_TIMEOUT_MS, 120_000);
  const guildCacheMs = positiveNumber(env.SWGOH_GUILD_CACHE_FRESH_SECONDS, 600) * 1000;
  const roteOperationsUrl = String(env.SWGOH_ROTE_OPERATIONS_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json").trim();
  const roteCacheMs = positiveNumber(env.SWGOH_ROTE_CACHE_SECONDS, 21_600) * 1000;
  return { gatewayUrl, gatewayApiKey, requestTimeoutMs, guildRequestTimeoutMs, guildCacheMs, roteOperationsUrl, roteCacheMs };
}

async function loadGuild(allyCode, config, fetchImpl, force = false) {
  if (!config.gatewayUrl) throw new Error("SWGOH_GATEWAY_URL is not configured.");
  if (!config.gatewayApiKey) throw new Error("SWGOH_GATEWAY_API_KEY is not configured.");

  const key = String(allyCode);
  const cached = guildCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return { guild: cached.value, cache: "fresh" };
  }

  const body = await fetchJson(
    `${config.gatewayUrl}/v1/guild/by-player/${encodeURIComponent(key)}/roster`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": config.gatewayApiKey,
        "User-Agent": "SWGOH-Command-Center (discord-tb-live)",
      },
    },
    config.guildRequestTimeoutMs,
    fetchImpl,
  );

  if (!validGuildRoster(body)) throw new Error("The live gateway returned an unexpected guild roster response.");
  guildCache.set(key, { value: body, expiresAt: Date.now() + config.guildCacheMs });
  return { guild: body, cache: force ? "refreshed" : cached ? "expired-refreshed" : "miss" };
}

async function loadOperations(config, fetchImpl) {
  if (roteCache.value && roteCache.expiresAt > Date.now()) return roteCache.value;
  if (roteCache.promise) return roteCache.promise;

  roteCache.promise = fetchJson(
    config.roteOperationsUrl,
    {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "SWGOH-Command-Center (discord-tb-live)" },
    },
    Math.min(config.requestTimeoutMs, 20_000),
    fetchImpl,
  ).then((payload) => {
    const value = aggregateRoteOperations(payload);
    roteCache.value = value;
    roteCache.expiresAt = Date.now() + config.roteCacheMs;
    return value;
  }).finally(() => {
    roteCache.promise = null;
  });

  return roteCache.promise;
}

async function buildPlanningSnapshot({ allyCode, redundancyTarget }, config, fetchImpl) {
  const [guildResult, operations, catalog] = await Promise.all([
    loadGuild(allyCode, config, fetchImpl, false),
    loadOperations(config, fetchImpl),
    loadCatalog(),
  ]);
  const safety = buildGuildRoteOperationSafety(guildResult.guild, catalog, { redundancyTarget });
  const plan = planGuildRoteSafeAssignments(guildResult.guild, operations, {
    protections: safety.protections,
  });
  return Object.freeze({
    guild: guildResult.guild,
    cache: guildResult.cache,
    operations,
    safety,
    plan,
  });
}

export function createDiscordTbLiveServices(env = process.env, options = {}) {
  const config = createConfig(env);
  const fetchImpl = options.fetch || fetch;

  return Object.freeze({
    fetch: fetchImpl,
    async syncGuild({ allyCode }) {
      return loadGuild(allyCode, config, fetchImpl, true);
    },
    async buildPlan({ allyCode, redundancyTarget = 2 }) {
      return buildPlanningSnapshot({ allyCode, redundancyTarget }, config, fetchImpl);
    },
    async buildPhaseCommand({ allyCode, redundancyTarget = 2, phase = "P1" }) {
      const snapshot = await buildPlanningSnapshot({ allyCode, redundancyTarget }, config, fetchImpl);
      const phaseCommand = buildGuildTbPhaseCommand({
        guildSnapshot: snapshot.guild,
        coverage: snapshot.safety.coverage,
        safePlan: snapshot.plan,
        safety: snapshot.safety,
        phase,
      });
      return Object.freeze({ ...snapshot, phaseCommand });
    },
  });
}
