import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = 1;
const DEFAULT_MAX_STATE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_PLAN_VERSIONS = 100;

function clean(value) {
  return String(value || "").trim();
}

function boolEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function snowflake(value, label) {
  const text = clean(value);
  if (!/^\d{16,22}$/.test(text)) throw new Error(`${label} must be a valid Discord snowflake.`);
  return text;
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) throw new Error("SWGOH Ally Code must contain exactly 9 digits.");
  return digits;
}

function baseId(value) {
  const text = clean(value).toUpperCase();
  if (!/^[A-Z0-9_:-]{2,80}$/.test(text)) throw new Error("SWGOH unit Base ID is invalid.");
  return text;
}

function donationPreference(value) {
  const text = clean(value).toLowerCase();
  if (!new Set(["give", "default", "keep"]).has(text)) throw new Error("Donation preference must be GIVE, DEFAULT, or KEEP.");
  return text;
}

function phase(value) {
  const text = clean(value).toUpperCase();
  if (!/^P[1-6]$/.test(text)) throw new Error("ROTE phase must be P1 through P6.");
  return text;
}

function normalizeRoleIds(roleIds, { allowUndefined = false } = {}) {
  if (roleIds == null && allowUndefined) return null;
  const normalized = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((value) => snowflake(value, "Discord officer role ID")))].sort();
  if (normalized.length > 25) throw new Error("At most 25 Discord officer role IDs may be configured per guild.");
  return normalized;
}

function rejectEveryoneRole(discordGuildId, roleIds) {
  if (!Array.isArray(roleIds)) return;
  if (roleIds.includes(discordGuildId)) throw new Error("The Discord @everyone role cannot be configured as an officer role.");
}

function isInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stateConfig(env = process.env) {
  const explicitDir = clean(env.SWGOH_STATE_DIR);
  const railwayMount = clean(env.RAILWAY_VOLUME_MOUNT_PATH);
  const railwayMountValid = Boolean(railwayMount && path.isAbsolute(railwayMount));
  const candidate = explicitDir || (railwayMountValid ? path.join(railwayMount, "swgoh-command-center") : "");
  const directory = candidate && path.isAbsolute(candidate) ? path.normalize(candidate) : "";
  const insideRailwayVolume = Boolean(directory && railwayMountValid && isInside(railwayMount, directory));
  const explicitlyConfirmedDurable = boolEnv(env.SWGOH_STATE_STORAGE_CONFIRMED_DURABLE, false);
  const durable = Boolean(directory && (insideRailwayVolume || explicitlyConfirmedDurable));
  const enabled = durable;

  let reason = "durable-storage-not-configured";
  if (candidate && !directory) reason = "state-directory-must-be-absolute";
  else if (directory && !durable) reason = "state-directory-not-confirmed-durable";
  else if (durable) reason = "ready";

  return Object.freeze({
    enabled,
    durable,
    directory,
    source: explicitDir ? "SWGOH_STATE_DIR" : railwayMountValid ? "RAILWAY_VOLUME_MOUNT_PATH" : "none",
    reason,
    maxStateBytes: positiveInteger(env.SWGOH_STATE_MAX_BYTES, DEFAULT_MAX_STATE_BYTES),
    maxPlanVersions: positiveInteger(env.SWGOH_STATE_MAX_PLAN_VERSIONS, DEFAULT_MAX_PLAN_VERSIONS),
  });
}

function freshState(now = () => new Date()) {
  const timestamp = now().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    guilds: {},
    audit: [],
  };
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Discord state file must contain a JSON object.");
  if (Number(value.schemaVersion) !== SCHEMA_VERSION) throw new Error(`Unsupported Discord state schema version: ${value.schemaVersion}.`);
  if (!value.guilds || typeof value.guilds !== "object" || Array.isArray(value.guilds)) throw new Error("Discord state guild map is invalid.");
  if (!Array.isArray(value.audit)) throw new Error("Discord state audit log is invalid.");
  return value;
}

function normalizeDetails(value) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return { value: String(value) };
  return structuredClone(value);
}

function defaultGuild(discordGuildId, now) {
  return {
    discordGuildId,
    swgohAllyCode: "",
    commandChannelId: "",
    officerRoleIds: [],
    userLinks: {},
    memberPreferences: {},
    planVersions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function ensureMemberPreferences(guild) {
  if (!guild.memberPreferences || typeof guild.memberPreferences !== "object" || Array.isArray(guild.memberPreferences)) guild.memberPreferences = {};
  return guild.memberPreferences;
}

function clearPreferencesForDiscordUser(guild, discordUserId) {
  const preferences = ensureMemberPreferences(guild);
  for (const [key, row] of Object.entries(preferences)) {
    if (row?.discordUserId === discordUserId) delete preferences[key];
  }
}

export function createDiscordStateStore(env = process.env, options = {}) {
  const config = stateConfig(env);
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const uuid = typeof options.randomUUID === "function" ? options.randomUUID : randomUUID;
  const stateFile = config.directory ? path.join(config.directory, "discord-state-v1.json") : "";
  let queue = Promise.resolve();

  function status() {
    return Object.freeze({
      enabled: config.enabled,
      durable: config.durable,
      mode: config.enabled ? "atomic-json-volume" : "disabled",
      source: config.source,
      reason: config.reason,
      schemaVersion: SCHEMA_VERSION,
      maxStateBytes: config.maxStateBytes,
      maxPlanVersions: config.maxPlanVersions,
    });
  }

  function requireEnabled() {
    if (config.enabled) return;
    const error = new Error(`Durable Discord state is disabled (${config.reason}).`);
    error.code = "DISCORD_STATE_DISABLED";
    throw error;
  }

  async function readUnlocked() {
    requireEnabled();
    try {
      const raw = await readFile(stateFile, "utf8");
      if (Buffer.byteLength(raw, "utf8") > config.maxStateBytes) throw new Error("Discord state file exceeds the configured size limit.");
      return validateState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === "ENOENT") return freshState(now);
      if (error instanceof SyntaxError) throw new Error("Discord state file contains invalid JSON.");
      throw error;
    }
  }

  async function writeUnlocked(state) {
    requireEnabled();
    const validated = validateState(state);
    const payload = `${JSON.stringify(validated, null, 2)}\n`;
    if (Buffer.byteLength(payload, "utf8") > config.maxStateBytes) throw new Error("Discord state write exceeds the configured size limit.");
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(config.directory, `.discord-state-${process.pid}-${uuid()}.tmp`);
    try {
      await writeFile(temporary, payload, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, stateFile);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
  }

  function exclusive(work) {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  }

  async function mutate({ discordGuildId, actorDiscordUserId = "", action, details = {} }, apply) {
    return exclusive(async () => {
      const state = structuredClone(await readUnlocked());
      const timestamp = now().toISOString();
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const actorId = actorDiscordUserId ? snowflake(actorDiscordUserId, "Discord actor user ID") : "";
      if (!state.guilds[guildId]) state.guilds[guildId] = defaultGuild(guildId, timestamp);
      const guild = state.guilds[guildId];
      const result = await apply(guild, state, timestamp);
      guild.updatedAt = timestamp;
      state.updatedAt = timestamp;
      state.audit.push({
        id: uuid(),
        timestamp,
        discordGuildId: guildId,
        actorDiscordUserId: actorId,
        action: clean(action) || "state-update",
        details: normalizeDetails(details),
      });
      await writeUnlocked(state);
      return structuredClone(result ?? guild);
    });
  }

  return Object.freeze({
    status,
    async readState() {
      return structuredClone(await readUnlocked());
    },
    async readGuild(discordGuildId) {
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const state = await readUnlocked();
      return state.guilds[guildId] ? structuredClone(state.guilds[guildId]) : null;
    },
    async bootstrapGuild({ discordGuildId, swgohAllyCode, commandChannelId = "", officerRoleIds, actorDiscordUserId = "" }) {
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const normalizedAllyCode = allyCode(swgohAllyCode);
      const normalizedChannelId = commandChannelId ? snowflake(commandChannelId, "Discord command channel ID") : "";
      const normalizedRoleIds = normalizeRoleIds(officerRoleIds, { allowUndefined: true });
      rejectEveryoneRole(guildId, normalizedRoleIds);
      return mutate({
        discordGuildId: guildId,
        actorDiscordUserId,
        action: "guild-bootstrap-updated",
        details: {
          swgohAllyCode: normalizedAllyCode,
          commandChannelId: normalizedChannelId || null,
          officerRoleIds: normalizedRoleIds,
        },
      }, (guild) => {
        guild.swgohAllyCode = normalizedAllyCode;
        guild.commandChannelId = normalizedChannelId;
        if (normalizedRoleIds !== null) guild.officerRoleIds = normalizedRoleIds;
        return guild;
      });
    },
    async upsertGuildConnection({ discordGuildId, swgohAllyCode, commandChannelId = "", actorDiscordUserId = "" }) {
      const normalizedAllyCode = allyCode(swgohAllyCode);
      const normalizedChannelId = commandChannelId ? snowflake(commandChannelId, "Discord command channel ID") : "";
      return mutate({
        discordGuildId,
        actorDiscordUserId,
        action: "guild-connection-upserted",
        details: { swgohAllyCode: normalizedAllyCode, commandChannelId: normalizedChannelId || null },
      }, (guild) => {
        guild.swgohAllyCode = normalizedAllyCode;
        guild.commandChannelId = normalizedChannelId;
        return guild;
      });
    },
    async setOfficerRoleIds({ discordGuildId, roleIds = [], actorDiscordUserId = "" }) {
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const normalized = normalizeRoleIds(roleIds);
      rejectEveryoneRole(guildId, normalized);
      return mutate({
        discordGuildId: guildId,
        actorDiscordUserId,
        action: "officer-roles-updated",
        details: { roleIds: normalized },
      }, (guild) => {
        guild.officerRoleIds = normalized;
        return guild;
      });
    },
    async linkPlayer({ discordGuildId, discordUserId, swgohAllyCode, playerId = "", actorDiscordUserId = "" }) {
      const userId = snowflake(discordUserId, "Discord user ID");
      const normalizedAllyCode = allyCode(swgohAllyCode);
      return mutate({
        discordGuildId,
        actorDiscordUserId,
        action: "player-linked",
        details: { discordUserId: userId, swgohAllyCode: normalizedAllyCode },
      }, (guild, _state, timestamp) => {
        for (const linked of Object.values(guild.userLinks || {})) {
          if (linked?.discordUserId !== userId && linked?.swgohAllyCode === normalizedAllyCode) {
            const error = new Error("That SWGOH Ally Code is already linked to another Discord user in this server.");
            error.code = "ALLY_CODE_ALREADY_LINKED";
            throw error;
          }
        }
        const previous = guild.userLinks[userId];
        if (previous?.swgohAllyCode && previous.swgohAllyCode !== normalizedAllyCode) clearPreferencesForDiscordUser(guild, userId);
        guild.userLinks[userId] = {
          discordUserId: userId,
          swgohAllyCode: normalizedAllyCode,
          playerId: clean(playerId),
          linkedAt: previous?.linkedAt || timestamp,
          updatedAt: timestamp,
        };
        return guild.userLinks[userId];
      });
    },
    async unlinkPlayer({ discordGuildId, discordUserId, actorDiscordUserId = "" }) {
      const userId = snowflake(discordUserId, "Discord user ID");
      return mutate({
        discordGuildId,
        actorDiscordUserId,
        action: "player-unlinked",
        details: { discordUserId: userId },
      }, (guild) => {
        const previous = guild.userLinks?.[userId];
        if (!previous) {
          const error = new Error("That Discord user does not have a player link in this server.");
          error.code = "PLAYER_LINK_NOT_FOUND";
          throw error;
        }
        clearPreferencesForDiscordUser(guild, userId);
        delete guild.userLinks[userId];
        return previous;
      });
    },
    async setDonationPreference({ discordGuildId, discordUserId, unitBaseId, preference, actorDiscordUserId = "" }) {
      const userId = snowflake(discordUserId, "Discord user ID");
      const normalizedBaseId = baseId(unitBaseId);
      const normalizedPreference = donationPreference(preference);
      return mutate({
        discordGuildId,
        actorDiscordUserId,
        action: normalizedPreference === "default" ? "donation-preference-cleared" : "donation-preference-updated",
        details: { discordUserId: userId, baseId: normalizedBaseId, preference: normalizedPreference },
      }, (guild, _state, timestamp) => {
        const link = guild.userLinks?.[userId];
        if (!link) {
          const error = new Error("That Discord user must have a durable SWGOH player link before donation preferences can be changed.");
          error.code = "PLAYER_LINK_NOT_FOUND";
          throw error;
        }
        const preferences = ensureMemberPreferences(guild);
        const key = `${userId}|${normalizedBaseId}`;
        if (normalizedPreference === "default") {
          const previous = preferences[key] || null;
          delete preferences[key];
          return {
            discordUserId: userId,
            memberId: clean(link.playerId) || link.swgohAllyCode,
            playerId: clean(link.playerId),
            swgohAllyCode: link.swgohAllyCode,
            baseId: normalizedBaseId,
            preference: "default",
            cleared: true,
            previous,
          };
        }
        const row = {
          discordUserId: userId,
          memberId: clean(link.playerId) || link.swgohAllyCode,
          playerId: clean(link.playerId),
          swgohAllyCode: link.swgohAllyCode,
          baseId: normalizedBaseId,
          preference: normalizedPreference,
          updatedAt: timestamp,
        };
        preferences[key] = row;
        return row;
      });
    },
    async savePlanVersion({ discordGuildId, rotePhase, versionId = "", summary = {}, actorDiscordUserId = "" }) {
      const normalizedPhase = phase(rotePhase);
      const normalizedVersionId = clean(versionId) || uuid();
      return mutate({
        discordGuildId,
        actorDiscordUserId,
        action: "plan-version-saved",
        details: { phase: normalizedPhase, versionId: normalizedVersionId },
      }, (guild, _state, timestamp) => {
        const row = {
          versionId: normalizedVersionId,
          phase: normalizedPhase,
          createdAt: timestamp,
          summary: normalizeDetails(summary),
        };
        guild.planVersions.push(row);
        if (guild.planVersions.length > config.maxPlanVersions) {
          guild.planVersions.splice(0, guild.planVersions.length - config.maxPlanVersions);
        }
        return row;
      });
    },
  });
}

export const discordStateStore = createDiscordStateStore(process.env);
