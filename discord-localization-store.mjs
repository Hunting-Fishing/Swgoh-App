import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeDiscordLocale } from './discord-i18n.mjs';

const SCHEMA_VERSION = 1;
const FILE_NAME = 'discord-localization-v1.json';
const DEFAULT_MAX_BYTES = 512 * 1024;

const text = (value) => String(value ?? '').trim();
const snowflake = (value, label) => {
  const id = text(value);
  if (!/^\d{16,22}$/.test(id)) throw new Error(`${label} must be a valid Discord snowflake.`);
  return id;
};
function boolEnv(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1','true','yes','on'].includes(String(value).trim().toLowerCase());
}
function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
function isInside(basePath, targetPath) {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function configOf(env = process.env) {
  const explicitDir = text(env.SWGOH_STATE_DIR);
  const railwayMount = text(env.RAILWAY_VOLUME_MOUNT_PATH);
  const railwayMountValid = Boolean(railwayMount && path.isAbsolute(railwayMount));
  const candidate = explicitDir || (railwayMountValid ? path.join(railwayMount, 'swgoh-command-center') : '');
  const directory = candidate && path.isAbsolute(candidate) ? path.normalize(candidate) : '';
  const insideRailwayVolume = Boolean(directory && railwayMountValid && isInside(railwayMount, directory));
  const explicitlyConfirmedDurable = boolEnv(env.SWGOH_STATE_STORAGE_CONFIRMED_DURABLE, false);
  const durable = Boolean(directory && (insideRailwayVolume || explicitlyConfirmedDurable));
  let reason = 'durable-storage-not-configured';
  if (candidate && !directory) reason = 'state-directory-must-be-absolute';
  else if (directory && !durable) reason = 'state-directory-not-confirmed-durable';
  else if (durable) reason = 'ready';
  return Object.freeze({
    enabled: durable,
    durable,
    directory,
    file: directory ? path.join(directory, FILE_NAME) : '',
    source: explicitDir ? 'SWGOH_STATE_DIR' : railwayMountValid ? 'RAILWAY_VOLUME_MOUNT_PATH' : 'none',
    reason,
    maxBytes: positiveInteger(env.SWGOH_LOCALIZATION_MAX_BYTES, DEFAULT_MAX_BYTES),
  });
}

function fresh(now) {
  const stamp = now().toISOString();
  return { schemaVersion: SCHEMA_VERSION, createdAt: stamp, updatedAt: stamp, guilds: {}, audit: [] };
}
function defaultGuild(discordGuildId, stamp) {
  return { discordGuildId, locale: 'en', userLocales: {}, createdAt: stamp, updatedAt: stamp };
}
function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Discord localization state must be a JSON object.');
  if (Number(value.schemaVersion) !== SCHEMA_VERSION) throw new Error(`Unsupported Discord localization schema version: ${value.schemaVersion}.`);
  if (!value.guilds || typeof value.guilds !== 'object' || Array.isArray(value.guilds)) throw new Error('Discord localization Guild map is invalid.');
  if (!Array.isArray(value.audit)) throw new Error('Discord localization audit log is invalid.');
  return value;
}

export function createDiscordLocalizationStore(env = process.env, options = {}) {
  const config = configOf(env);
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const uuid = typeof options.randomUUID === 'function' ? options.randomUUID : randomUUID;
  let queue = Promise.resolve();

  function status() {
    return Object.freeze({
      enabled: config.enabled,
      durable: config.durable,
      mode: config.enabled ? 'atomic-json-volume' : 'disabled',
      source: config.source,
      reason: config.reason,
      schemaVersion: SCHEMA_VERSION,
      fileName: FILE_NAME,
      maxBytes: config.maxBytes,
    });
  }
  function requireEnabled() {
    if (config.enabled) return;
    const error = new Error(`Durable Discord localization state is disabled (${config.reason}).`);
    error.code = 'DISCORD_LOCALIZATION_STATE_DISABLED';
    throw error;
  }
  async function readUnlocked() {
    requireEnabled();
    try {
      const raw = await readFile(config.file, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > config.maxBytes) throw new Error('Discord localization state exceeds the configured size limit.');
      return validateState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === 'ENOENT') return fresh(now);
      if (error instanceof SyntaxError) throw new Error('Discord localization state contains invalid JSON.');
      throw error;
    }
  }
  async function writeUnlocked(state) {
    requireEnabled();
    const payload = `${JSON.stringify(validateState(state), null, 2)}\n`;
    if (Buffer.byteLength(payload, 'utf8') > config.maxBytes) throw new Error('Discord localization state write exceeds the configured size limit.');
    await mkdir(config.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(config.directory, `.discord-localization-${process.pid}-${uuid()}.tmp`);
    try {
      await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, config.file);
    } finally {
      await unlink(temporary).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
  }
  function exclusive(work) {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  }
  async function mutate({ discordGuildId, actorDiscordUserId = '', action, details = {} }, apply) {
    const guildId = snowflake(discordGuildId, 'Discord guild ID');
    const actorId = actorDiscordUserId ? snowflake(actorDiscordUserId, 'Discord actor user ID') : '';
    return exclusive(async () => {
      const state = structuredClone(await readUnlocked());
      const stamp = now().toISOString();
      if (!state.guilds[guildId]) state.guilds[guildId] = defaultGuild(guildId, stamp);
      const guild = state.guilds[guildId];
      const result = await apply(guild, state, stamp);
      guild.updatedAt = stamp;
      state.updatedAt = stamp;
      state.audit.push({ id: uuid(), timestamp: stamp, discordGuildId: guildId, actorDiscordUserId: actorId, action, details });
      if (state.audit.length > 1000) state.audit.splice(0, state.audit.length - 1000);
      await writeUnlocked(state);
      return structuredClone(result);
    });
  }

  return Object.freeze({
    status,
    async readState() { return structuredClone(await readUnlocked()); },
    async readGuild(discordGuildId) {
      const guildId = snowflake(discordGuildId, 'Discord guild ID');
      const state = await readUnlocked();
      return state.guilds[guildId] ? structuredClone(state.guilds[guildId]) : null;
    },
    async getGuildLocale(discordGuildId) {
      const guild = await this.readGuild(discordGuildId);
      return guild?.locale ? normalizeDiscordLocale(guild.locale) : '';
    },
    async getUserLocale(discordGuildId, discordUserId) {
      const guildId = snowflake(discordGuildId, 'Discord guild ID');
      const userId = snowflake(discordUserId, 'Discord user ID');
      const state = await readUnlocked();
      const locale = state.guilds[guildId]?.userLocales?.[userId];
      return locale ? normalizeDiscordLocale(locale) : '';
    },
    async setGuildLocale({ discordGuildId, locale, actorDiscordUserId = '' }) {
      const normalized = normalizeDiscordLocale(locale);
      return mutate({ discordGuildId, actorDiscordUserId, action: 'guild-locale-set', details: { locale: normalized } }, (guild) => {
        guild.locale = normalized;
        return { locale: normalized };
      });
    },
    async setUserLocale({ discordGuildId, discordUserId, locale, actorDiscordUserId = '' }) {
      const userId = snowflake(discordUserId, 'Discord user ID');
      const normalized = normalizeDiscordLocale(locale);
      return mutate({ discordGuildId, actorDiscordUserId, action: 'player-locale-set', details: { discordUserId: userId, locale: normalized } }, (guild) => {
        if (!guild.userLocales || typeof guild.userLocales !== 'object' || Array.isArray(guild.userLocales)) guild.userLocales = {};
        guild.userLocales[userId] = normalized;
        return { discordUserId: userId, locale: normalized };
      });
    },
    async clearUserLocale({ discordGuildId, discordUserId, actorDiscordUserId = '' }) {
      const userId = snowflake(discordUserId, 'Discord user ID');
      return mutate({ discordGuildId, actorDiscordUserId, action: 'player-locale-cleared', details: { discordUserId: userId } }, (guild) => {
        if (!guild.userLocales || typeof guild.userLocales !== 'object' || Array.isArray(guild.userLocales)) guild.userLocales = {};
        const previous = guild.userLocales[userId] || '';
        delete guild.userLocales[userId];
        return { discordUserId: userId, previousLocale: previous, cleared: true };
      });
    },
    async clearGuild({ discordGuildId, actorDiscordUserId = '' }) {
      const guildId = snowflake(discordGuildId, 'Discord guild ID');
      return mutate({ discordGuildId: guildId, actorDiscordUserId, action: 'guild-localization-cleared', details: {} }, (guild) => {
        const previous = { locale: guild.locale || 'en', userLocales: Object.keys(guild.userLocales || {}).length };
        guild.locale = 'en';
        guild.userLocales = {};
        return previous;
      });
    },
  });
}

export const discordLocalizationStore = createDiscordLocalizationStore(process.env);
