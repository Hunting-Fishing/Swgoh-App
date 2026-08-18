import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = 1;
const FILE_NAME = "discord-hard-reservations-v1.json";
const DEFAULT_MAX_BYTES = 1024 * 1024;

function clean(value) {
  return String(value ?? "").trim();
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

function phase(value) {
  const text = clean(value).toUpperCase();
  if (!/^P[1-6]$/.test(text)) throw new Error("ROTE phase must be P1 through P6.");
  return text;
}

function isInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function configOf(env = process.env) {
  const explicitDir = clean(env.SWGOH_STATE_DIR);
  const railwayMount = clean(env.RAILWAY_VOLUME_MOUNT_PATH);
  const railwayMountValid = Boolean(railwayMount && path.isAbsolute(railwayMount));
  const candidate = explicitDir || (railwayMountValid ? path.join(railwayMount, "swgoh-command-center") : "");
  const directory = candidate && path.isAbsolute(candidate) ? path.normalize(candidate) : "";
  const insideRailwayVolume = Boolean(directory && railwayMountValid && isInside(railwayMount, directory));
  const explicitlyConfirmedDurable = boolEnv(env.SWGOH_STATE_STORAGE_CONFIRMED_DURABLE, false);
  const durable = Boolean(directory && (insideRailwayVolume || explicitlyConfirmedDurable));
  let reason = "durable-storage-not-configured";
  if (candidate && !directory) reason = "state-directory-must-be-absolute";
  else if (directory && !durable) reason = "state-directory-not-confirmed-durable";
  else if (durable) reason = "ready";
  return Object.freeze({
    enabled: durable,
    durable,
    directory,
    file: directory ? path.join(directory, FILE_NAME) : "",
    source: explicitDir ? "SWGOH_STATE_DIR" : railwayMountValid ? "RAILWAY_VOLUME_MOUNT_PATH" : "none",
    reason,
    maxBytes: positiveInteger(env.SWGOH_HARD_RESERVATION_MAX_BYTES, DEFAULT_MAX_BYTES),
  });
}

function freshState(now = () => new Date()) {
  const stamp = now().toISOString();
  return { schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, guilds: {}, audit: [] };
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Discord hard-reservation state must be a JSON object.");
  if (Number(value.schemaVersion) !== SCHEMA_VERSION) throw new Error(`Unsupported hard-reservation state schema version: ${value.schemaVersion}.`);
  if (!value.guilds || typeof value.guilds !== "object" || Array.isArray(value.guilds)) throw new Error("Discord hard-reservation Guild map is invalid.");
  if (!Array.isArray(value.audit)) throw new Error("Discord hard-reservation audit log is invalid.");
  return value;
}

function defaultGuild(discordGuildId, timestamp) {
  return { discordGuildId, reservations: {}, createdAt: timestamp, updatedAt: timestamp };
}

function keyOf(discordUserId, rotePhase, unitBaseId) {
  return `${discordUserId}|${rotePhase}|${unitBaseId}`;
}

export function createDiscordHardReservationStore(env = process.env, options = {}) {
  const config = configOf(env);
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const uuid = typeof options.randomUUID === "function" ? options.randomUUID : randomUUID;
  let queue = Promise.resolve();

  function status() {
    return Object.freeze({
      enabled: config.enabled,
      durable: config.durable,
      mode: config.enabled ? "atomic-json-volume" : "disabled",
      source: config.source,
      reason: config.reason,
      schemaVersion: SCHEMA_VERSION,
      fileName: FILE_NAME,
      maxBytes: config.maxBytes,
    });
  }

  function requireEnabled() {
    if (config.enabled) return;
    const error = new Error(`Durable Discord hard-reservation state is disabled (${config.reason}).`);
    error.code = "DISCORD_HARD_RESERVATION_STATE_DISABLED";
    throw error;
  }

  async function readUnlocked() {
    requireEnabled();
    try {
      const raw = await readFile(config.file, "utf8");
      if (Buffer.byteLength(raw, "utf8") > config.maxBytes) throw new Error("Discord hard-reservation state exceeds the configured size limit.");
      return validateState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === "ENOENT") return freshState(now);
      if (error instanceof SyntaxError) throw new Error("Discord hard-reservation state contains invalid JSON.");
      throw error;
    }
  }

  async function writeUnlocked(state) {
    requireEnabled();
    const payload = `${JSON.stringify(validateState(state), null, 2)}\n`;
    if (Buffer.byteLength(payload, "utf8") > config.maxBytes) throw new Error("Discord hard-reservation state write exceeds the configured size limit.");
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(config.directory, `.discord-hard-reservations-${process.pid}-${uuid()}.tmp`);
    try {
      await writeFile(temporary, payload, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, config.file);
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

  return Object.freeze({
    status,
    async readGuild(discordGuildId) {
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const state = await readUnlocked();
      return state.guilds[guildId] ? structuredClone(state.guilds[guildId]) : null;
    },
    async clearGuild({ discordGuildId, actorDiscordUserId = "" }) {
      requireEnabled();
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const actorId = actorDiscordUserId ? snowflake(actorDiscordUserId, "Discord actor user ID") : "";
      return exclusive(async () => {
        const state = structuredClone(await readUnlocked());
        const timestamp = now().toISOString();
        const guild = state.guilds[guildId];
        const cleared = guild?.reservations && typeof guild.reservations === "object" && !Array.isArray(guild.reservations)
          ? Object.keys(guild.reservations).length
          : 0;
        if (guild) {
          guild.reservations = {};
          guild.updatedAt = timestamp;
        }
        state.updatedAt = timestamp;
        state.audit.push({
          id: uuid(),
          timestamp,
          discordGuildId: guildId,
          actorDiscordUserId: actorId,
          action: "rote-hard-reservations-cleared-for-guild-unbind",
          details: { cleared },
        });
        await writeUnlocked(state);
        return Object.freeze({ discordGuildId: guildId, cleared });
      });
    },
    async setReservation({
      discordGuildId,
      discordUserId,
      swgohAllyCode,
      playerId = "",
      unitBaseId,
      unitName = "",
      rotePhase,
      reserved = true,
      actorDiscordUserId = "",
    }) {
      requireEnabled();
      const guildId = snowflake(discordGuildId, "Discord guild ID");
      const userId = snowflake(discordUserId, "Discord user ID");
      const actorId = actorDiscordUserId ? snowflake(actorDiscordUserId, "Discord actor user ID") : "";
      const normalizedAllyCode = allyCode(swgohAllyCode);
      const normalizedBaseId = baseId(unitBaseId);
      const normalizedPhase = phase(rotePhase);
      return exclusive(async () => {
        const state = structuredClone(await readUnlocked());
        const timestamp = now().toISOString();
        if (!state.guilds[guildId]) state.guilds[guildId] = defaultGuild(guildId, timestamp);
        const guild = state.guilds[guildId];
        if (!guild.reservations || typeof guild.reservations !== "object" || Array.isArray(guild.reservations)) guild.reservations = {};
        const key = keyOf(userId, normalizedPhase, normalizedBaseId);
        const previous = guild.reservations[key] || null;
        let result;
        if (reserved) {
          result = {
            discordUserId: userId,
            memberId: clean(playerId) || normalizedAllyCode,
            playerId: clean(playerId),
            swgohAllyCode: normalizedAllyCode,
            phase: normalizedPhase,
            baseId: normalizedBaseId,
            unitName: clean(unitName) || normalizedBaseId,
            reserved: true,
            updatedAt: timestamp,
          };
          guild.reservations[key] = result;
        } else {
          delete guild.reservations[key];
          result = {
            discordUserId: userId,
            memberId: clean(playerId) || normalizedAllyCode,
            playerId: clean(playerId),
            swgohAllyCode: normalizedAllyCode,
            phase: normalizedPhase,
            baseId: normalizedBaseId,
            reserved: false,
            cleared: true,
            previous,
          };
        }
        guild.updatedAt = timestamp;
        state.updatedAt = timestamp;
        state.audit.push({
          id: uuid(),
          timestamp,
          discordGuildId: guildId,
          actorDiscordUserId: actorId,
          action: reserved ? "rote-hard-reservation-set" : "rote-hard-reservation-cleared",
          details: { discordUserId: userId, phase: normalizedPhase, baseId: normalizedBaseId },
        });
        await writeUnlocked(state);
        return structuredClone(result);
      });
    },
  });
}

export const discordHardReservationStore = createDiscordHardReservationStore(process.env);
