import { LiveRosterCache } from './live-roster-cache.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

function clean(value) {
  return String(value || '').trim();
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeAllyCode(value) {
  const digits = clean(value).replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error('A valid 9-digit Ally Code is required for the persisted guild roster.');
    error.status = 400;
    error.code = 'INVALID_ALLY_CODE';
    throw error;
  }
  return digits;
}

function persistedBody(payload) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object') return payload;
  if (Array.isArray(payload) && payload.length === 1) {
    const row = payload[0];
    if (row && typeof row === 'object') {
      if (row.read_persisted_guild_roster && typeof row.read_persisted_guild_roster === 'object') return row.read_persisted_guild_roster;
      return row;
    }
  }
  return null;
}

function validate(body) {
  return body?.source === 'persisted'
    && body?.guild?.id
    && Array.isArray(body?.members)
    && body?.hydration;
}

function notFound() {
  const error = new Error('No canonical persisted Guild roster is available for that Ally Code yet.');
  error.status = 404;
  error.code = 'PERSISTED_GUILD_NOT_FOUND';
  return error;
}

function sourceAgeMs(body, now = Date.now()) {
  const explicit = Number(body?.persistence?.ageSeconds);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit * 1000;
  const syncedAt = Date.parse(body?.persistence?.lastSyncedAt || body?.fetchedAt || '');
  return Number.isFinite(syncedAt) ? Math.max(0, now - syncedAt) : 0;
}

export function createPersistedGuildRosterService(env = process.env, options = {}) {
  const store = options.store || supabaseCoreStore;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const freshMs = positiveNumber(env.SWGOH_PERSISTED_GUILD_CACHE_FRESH_SECONDS, 60) * 1000;
  const staleMs = positiveNumber(env.SWGOH_PERSISTED_GUILD_CACHE_STALE_SECONDS, 300) * 1000;
  const maxEntries = Math.max(1, Math.floor(positiveNumber(env.SWGOH_PERSISTED_GUILD_CACHE_MAX_ENTRIES, 100)));
  const cache = options.cache || new LiveRosterCache({ freshMs, staleMs, maxEntries, now });

  async function load(allyCode) {
    if (!store.status().configured) {
      const error = new Error('Supabase persistence is not configured.');
      error.status = 503;
      error.code = 'PERSISTENCE_NOT_CONFIGURED';
      throw error;
    }
    const payload = await store.rpc('read_persisted_guild_roster', { p_ally_code: allyCode });
    const body = persistedBody(payload);
    if (!body) throw notFound();
    if (!validate(body)) {
      const error = new Error('The persisted Guild roster returned an unexpected response.');
      error.status = 502;
      error.code = 'PERSISTED_GUILD_INVALID';
      throw error;
    }
    return body;
  }

  async function getGuildRoster(allyCode, options = {}) {
    const normalized = normalizeAllyCode(allyCode);
    if (options.forceRefresh) {
      const value = await cache.refresh(normalized, () => load(normalized));
      return Object.freeze({ value, cache: 'refreshed', ageMs: sourceAgeMs(value, now()) });
    }
    const result = await cache.getOrLoad(normalized, () => load(normalized), {
      staleWhileRevalidate: options.staleWhileRevalidate !== false,
    });
    return Object.freeze({ ...result, ageMs: sourceAgeMs(result.value, now()) });
  }

  return Object.freeze({
    getGuildRoster,
    refreshGuildRoster(allyCode) {
      return getGuildRoster(allyCode, { forceRefresh: true, staleWhileRevalidate: false });
    },
    status() {
      const persistence = store.status();
      return Object.freeze({
        configured: Boolean(persistence?.configured),
        mode: persistence?.configured ? 'supabase-canonical-persisted-first' : 'disabled',
        freshSeconds: Math.round(freshMs / 1000),
        staleSeconds: Math.round(staleMs / 1000),
        maxEntries,
        sharedAcrossWebInstances: true,
        unitShape: 'compact-progression-v1',
      });
    },
  });
}

export const persistedGuildRosterService = createPersistedGuildRosterService(process.env);
