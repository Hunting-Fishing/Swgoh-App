import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGuildRosterService, guildRosterService } from "./guild-roster-service.mjs";
import { aggregateRoteOperations } from "./rote-operations.mjs";
import { buildGuildRoteOperationSafety } from "./public/guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments } from "./public/guild-rote-safe-planner.js";
import { buildGuildTbPhaseCommand } from "./public/guild-tb-phase-command-model.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const roteCache = { value: null, expiresAt: 0, promise: null };
const catalogCache = { value: null, promise: null };

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  const requestTimeoutMs = positiveNumber(env.SWGOH_REQUEST_TIMEOUT_MS, 35_000);
  const roteOperationsUrl = String(env.SWGOH_ROTE_OPERATIONS_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main/swgoh_rote_operations.json").trim();
  const roteCacheMs = positiveNumber(env.SWGOH_ROTE_CACHE_SECONDS, 21_600) * 1000;
  return { requestTimeoutMs, roteOperationsUrl, roteCacheMs };
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

function selectGuildRosterService(env, options, fetchImpl) {
  if (options.guildRosterService) return options.guildRosterService;
  // Production server and Discord imports share this exact process-wide service.
  // Custom env/fetch instances used by tests remain isolated and deterministic.
  if (env === process.env && !options.fetch) return guildRosterService;
  return createGuildRosterService(env, { fetch: fetchImpl, ...(typeof options.now === "function" ? { now: options.now } : {}) });
}

function normalizeGuildResult(result) {
  return Object.freeze({
    guild: result?.value,
    cache: String(result?.cache || "unknown"),
    ageMs: Number(result?.ageMs || 0),
  });
}

async function buildPlanningSnapshot({ allyCode, redundancyTarget }, config, fetchImpl, sharedGuildService) {
  const [guildCacheResult, operations, catalog] = await Promise.all([
    sharedGuildService.getGuildRoster(allyCode, { staleWhileRevalidate: false }),
    loadOperations(config, fetchImpl),
    loadCatalog(),
  ]);
  const guildResult = normalizeGuildResult(guildCacheResult);
  const safety = buildGuildRoteOperationSafety(guildResult.guild, catalog, { redundancyTarget });
  const plan = planGuildRoteSafeAssignments(guildResult.guild, operations, {
    protections: safety.protections,
  });
  return Object.freeze({
    guild: guildResult.guild,
    cache: guildResult.cache,
    guildAgeMs: guildResult.ageMs,
    operations,
    safety,
    plan,
  });
}

export function createDiscordTbLiveServices(env = process.env, options = {}) {
  const config = createConfig(env);
  const fetchImpl = options.fetch || fetch;
  const sharedGuildService = selectGuildRosterService(env, options, fetchImpl);

  return Object.freeze({
    fetch: fetchImpl,
    async syncGuild({ allyCode }) {
      return normalizeGuildResult(await sharedGuildService.refreshGuildRoster(allyCode));
    },
    async buildPlan({ allyCode, redundancyTarget = 2 }) {
      return buildPlanningSnapshot({ allyCode, redundancyTarget }, config, fetchImpl, sharedGuildService);
    },
    async buildPhaseCommand({ allyCode, redundancyTarget = 2, phase = "P1" }) {
      const snapshot = await buildPlanningSnapshot({ allyCode, redundancyTarget }, config, fetchImpl, sharedGuildService);
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
