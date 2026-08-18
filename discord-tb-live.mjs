import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discordStateStore } from "./discord-state-store.mjs";
import { discordHardReservationStore } from "./discord-hard-reservation-store.mjs";
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

function normalizedAllyCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function normalizedSnowflake(value) {
  const text = String(value || "").trim();
  return /^\d{16,22}$/.test(text) ? text : "";
}

function normalizedBaseId(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9_:-]{2,80}$/.test(text) ? text : "";
}

function normalizedPreference(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "give" || text === "keep" ? text : "";
}

function normalizedPhase(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^P[1-6]$/.test(text) ? text : "";
}

function normalizedMemberId(row = {}) {
  return String(row?.memberId || row?.playerId || row?.swgohAllyCode || "").trim();
}

export async function resolveDiscordGuildAllyCode({ allyCode, interaction = {}, stateStore = discordStateStore } = {}) {
  const fallback = normalizedAllyCode(allyCode);
  const discordGuildId = normalizedSnowflake(interaction?.guild_id);
  const canReadDurableState = Boolean(
    discordGuildId
    && typeof stateStore?.status === "function"
    && typeof stateStore?.readGuild === "function",
  );

  if (!canReadDurableState) {
    if (!fallback) throw new Error("No valid SWGOH guild Ally Code is available for this Discord request.");
    return Object.freeze({ allyCode: fallback, source: "explicit-fallback", discordGuildId: discordGuildId || "" });
  }

  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) {
    if (!fallback) throw new Error("Durable Discord guild state is unavailable and no fallback Ally Code is configured.");
    return Object.freeze({ allyCode: fallback, source: "explicit-fallback", discordGuildId });
  }

  let guild;
  try {
    guild = await stateStore.readGuild(discordGuildId);
  } catch (error) {
    const wrapped = new Error("Durable Discord guild binding could not be read; refusing to use a possibly stale fallback guild.");
    wrapped.code = "DISCORD_GUILD_BINDING_READ_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }

  const durableAllyCode = normalizedAllyCode(guild?.swgohAllyCode);
  if (durableAllyCode) {
    return Object.freeze({ allyCode: durableAllyCode, source: "durable-guild-binding", discordGuildId });
  }
  if (!fallback) throw new Error("This Discord server has no durable SWGOH guild binding and no fallback Ally Code is configured.");
  return Object.freeze({ allyCode: fallback, source: "explicit-fallback", discordGuildId });
}

async function readDiscordPlanningControls(binding, stateStore, reservationStore) {
  const discordGuildId = normalizedSnowflake(binding?.discordGuildId);
  const canRead = Boolean(
    discordGuildId
    && typeof stateStore?.status === "function"
    && typeof stateStore?.readGuild === "function",
  );
  const empty = Object.freeze({
    preferences: Object.freeze([]),
    ignoredMembers: Object.freeze([]),
    reservations: Object.freeze([]),
  });
  if (!canRead) return empty;

  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) return empty;

  let guild;
  try {
    guild = await stateStore.readGuild(discordGuildId);
  } catch (error) {
    const wrapped = new Error("Durable Discord planning controls could not be read; refusing to build a plan without persisted member controls.");
    wrapped.code = "DISCORD_PLANNING_CONTROLS_READ_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }

  const preferences = Object.values(guild?.memberPreferences && typeof guild.memberPreferences === "object" ? guild.memberPreferences : {})
    .map((row) => ({
      memberId: normalizedMemberId(row),
      baseId: normalizedBaseId(row?.baseId),
      preference: normalizedPreference(row?.preference),
    }))
    .filter((row) => row.memberId && row.baseId && row.preference);

  const ignoredMembers = Object.values(guild?.memberAvailability && typeof guild.memberAvailability === "object" ? guild.memberAvailability : {})
    .filter((row) => String(row?.availability || "").toLowerCase() === "unavailable")
    .map((row) => normalizedMemberId(row))
    .filter(Boolean);

  let reservations = [];
  const reservationStatus = typeof reservationStore?.status === "function" ? reservationStore.status() : null;
  if (reservationStatus?.enabled || reservationStatus?.durable) {
    if (!reservationStatus?.enabled || !reservationStatus?.durable || typeof reservationStore?.readGuild !== "function") {
      throw new Error("Durable Discord hard-reservation state is configured but unavailable; refusing to build a plan without hard reserves.");
    }
    let hardState;
    try {
      hardState = await reservationStore.readGuild(discordGuildId);
    } catch (error) {
      const wrapped = new Error("Durable Discord hard reservations could not be read; refusing to build a plan without officer safety controls.");
      wrapped.code = "DISCORD_HARD_RESERVATIONS_READ_FAILED";
      wrapped.cause = error;
      throw wrapped;
    }
    const links = guild?.userLinks && typeof guild.userLinks === "object" ? guild.userLinks : {};
    reservations = Object.values(hardState?.reservations && typeof hardState.reservations === "object" ? hardState.reservations : {})
      .filter((row) => row?.reserved === true)
      .map((row) => {
        const discordUserId = normalizedSnowflake(row?.discordUserId);
        const link = discordUserId ? links[discordUserId] : null;
        const linkedMemberId = normalizedMemberId(link);
        return {
          discordUserId,
          memberId: normalizedMemberId(row),
          linkedMemberId,
          phase: normalizedPhase(row?.phase),
          baseId: normalizedBaseId(row?.baseId),
        };
      })
      .filter((row) => row.discordUserId && row.memberId && row.linkedMemberId === row.memberId && row.phase && row.baseId)
      .map((row) => ({ memberId: row.memberId, phase: row.phase, baseId: row.baseId }));
  }

  return Object.freeze({
    preferences: Object.freeze(preferences.map((row) => Object.freeze(row))),
    ignoredMembers: Object.freeze([...new Set(ignoredMembers)]),
    reservations: Object.freeze(reservations.map((row) => Object.freeze(row))),
  });
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

async function buildPlanningSnapshot({ allyCode, redundancyTarget, guildBindingSource, preferences = [], ignoredMembers = [], reservations = [] }, config, fetchImpl, sharedGuildService) {
  const [guildCacheResult, operations, catalog] = await Promise.all([
    sharedGuildService.getGuildRoster(allyCode, { staleWhileRevalidate: false }),
    loadOperations(config, fetchImpl),
    loadCatalog(),
  ]);
  const guildResult = normalizeGuildResult(guildCacheResult);
  const safety = buildGuildRoteOperationSafety(guildResult.guild, catalog, { redundancyTarget });
  const plan = planGuildRoteSafeAssignments(guildResult.guild, operations, {
    protections: safety.protections,
    preferences,
    ignoredMembers,
    reservations,
  });
  return Object.freeze({
    guild: guildResult.guild,
    cache: guildResult.cache,
    guildAgeMs: guildResult.ageMs,
    guildBindingSource,
    planningControls: Object.freeze({
      preferenceCount: preferences.length,
      unavailableMemberCount: ignoredMembers.length,
      hardReservationCount: reservations.length,
    }),
    operations,
    safety,
    plan,
  });
}

export function createDiscordTbLiveServices(env = process.env, options = {}) {
  const config = createConfig(env);
  const fetchImpl = options.fetch || fetch;
  const sharedGuildService = selectGuildRosterService(env, options, fetchImpl);
  const stateStore = options.stateStore || discordStateStore;
  const reservationStore = options.reservationStore || discordHardReservationStore;

  async function resolveRequestGuild(args = {}) {
    return resolveDiscordGuildAllyCode({
      allyCode: args.allyCode,
      interaction: args.interaction,
      stateStore,
    });
  }

  async function resolvePlanningRequest(args = {}) {
    const binding = await resolveRequestGuild(args);
    const controls = await readDiscordPlanningControls(binding, stateStore, reservationStore);
    return { binding, controls };
  }

  return Object.freeze({
    fetch: fetchImpl,
    async syncGuild(args = {}) {
      const binding = await resolveRequestGuild(args);
      const result = normalizeGuildResult(await sharedGuildService.refreshGuildRoster(binding.allyCode));
      return Object.freeze({ ...result, guildBindingSource: binding.source });
    },
    async buildPlan(args = {}) {
      const { binding, controls } = await resolvePlanningRequest(args);
      return buildPlanningSnapshot({
        allyCode: binding.allyCode,
        redundancyTarget: args.redundancyTarget ?? 2,
        guildBindingSource: binding.source,
        preferences: controls.preferences,
        ignoredMembers: controls.ignoredMembers,
        reservations: controls.reservations,
      }, config, fetchImpl, sharedGuildService);
    },
    async buildPhaseCommand(args = {}) {
      const { binding, controls } = await resolvePlanningRequest(args);
      const snapshot = await buildPlanningSnapshot({
        allyCode: binding.allyCode,
        redundancyTarget: args.redundancyTarget ?? 2,
        guildBindingSource: binding.source,
        preferences: controls.preferences,
        ignoredMembers: controls.ignoredMembers,
        reservations: controls.reservations,
      }, config, fetchImpl, sharedGuildService);
      const phaseCommand = buildGuildTbPhaseCommand({
        guildSnapshot: snapshot.guild,
        coverage: snapshot.safety.coverage,
        safePlan: snapshot.plan,
        safety: snapshot.safety,
        phase: args.phase || "P1",
      });
      return Object.freeze({ ...snapshot, phaseCommand });
    },
  });
}
