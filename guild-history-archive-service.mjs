import { supabaseCoreStore } from './supabase-core-store.mjs';

const SECTIONS = Object.freeze(new Set([
  'meta','dict','guildSnapshots','playerMonthly','membershipPeriods','returns',
  'trackedUnitMilestones','tickets','raids','rote','reva',
]));

function clean(value) { return String(value ?? '').trim(); }
function normalizeAllyCode(value) {
  const allyCode = clean(value).replace(/\D/g, '');
  if (!/^\d{9}$/.test(allyCode)) {
    const error = new Error('A valid 9-digit Ally Code is required for Guild history.');
    error.status = 400;
    error.code = 'INVALID_ALLY_CODE';
    throw error;
  }
  return allyCode;
}
function rpcObject(value, key) {
  if (value && !Array.isArray(value) && typeof value === 'object') return value;
  if (Array.isArray(value) && value.length === 1) {
    const row = value[0];
    if (row && typeof row === 'object') return key && row[key] !== undefined ? row[key] : row;
  }
  return value ?? null;
}
function unavailable(message) {
  const error = new Error(message);
  error.status = 404;
  error.code = 'GUILD_HISTORY_ARCHIVE_NOT_FOUND';
  throw error;
}

export function createGuildHistoryArchiveService(options = {}) {
  const store = options.store || supabaseCoreStore;

  function status() {
    const persistence = store.status?.() || {};
    return Object.freeze({
      configured: Boolean(persistence.configured),
      mode: persistence.configured ? 'supabase-versioned-guild-history-archive' : 'disabled',
      sections: Object.freeze([...SECTIONS]),
    });
  }

  function ensureConfigured() {
    if (store.status?.().configured === false) {
      const error = new Error('Guild history persistence is not configured.');
      error.status = 503;
      error.code = 'PERSISTENCE_NOT_CONFIGURED';
      throw error;
    }
  }

  async function getCoverage(allyCodeInput) {
    ensureConfigured();
    const allyCode = normalizeAllyCode(allyCodeInput);
    const raw = await store.rpc('read_guild_history_coverage', { p_ally_code: allyCode });
    const body = rpcObject(raw, 'read_guild_history_coverage');
    if (!body?.available) unavailable('No persisted historical Guild archive exists for that Ally Code yet.');
    return Object.freeze(body);
  }

  async function getSection(allyCodeInput, sectionInput) {
    ensureConfigured();
    const allyCode = normalizeAllyCode(allyCodeInput);
    const section = clean(sectionInput);
    if (!SECTIONS.has(section)) {
      const error = new Error(`Unsupported Guild history section: ${section || '(blank)'}.`);
      error.status = 400;
      error.code = 'INVALID_GUILD_HISTORY_SECTION';
      throw error;
    }
    const raw = await store.rpc('read_guild_history_section', { p_ally_code: allyCode, p_section: section });
    const body = rpcObject(raw, 'read_guild_history_section');
    if (body === null || body === undefined) unavailable('No persisted historical Guild archive exists for that Ally Code yet.');
    return Object.freeze({ source: 'historical-guild-archive', allyCode, section, data: body });
  }

  return Object.freeze({ status, getCoverage, getSection });
}

export const guildHistoryArchiveService = createGuildHistoryArchiveService();
