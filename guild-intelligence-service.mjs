import { supabaseCoreStore } from './supabase-core-store.mjs';

function clean(value) {
  return String(value || '').trim();
}

function normalizeAllyCode(value) {
  const digits = clean(value).replace(/\D/g, '');
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error('A valid 9-digit Ally Code is required for Guild Intelligence.');
    error.status = 400;
    error.code = 'INVALID_ALLY_CODE';
    throw error;
  }
  return digits;
}

function rpcBody(payload) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object') return payload;
  if (Array.isArray(payload) && payload.length === 1) {
    const row = payload[0];
    if (row && typeof row === 'object') {
      if (row.read_guild_intelligence_status && typeof row.read_guild_intelligence_status === 'object') return row.read_guild_intelligence_status;
      return row;
    }
  }
  return null;
}

export function createGuildIntelligenceService(options = {}) {
  const store = options.store || supabaseCoreStore;

  function status() {
    const persistence = store.status?.() || {};
    return Object.freeze({
      configured: Boolean(persistence.configured),
      mode: persistence.configured ? 'supabase-daily-guild-intelligence' : 'disabled',
      dailyPageRegistry: 29,
      midnightScheduling: 'guild-local-timezone',
    });
  }

  async function getByPlayer(allyCode) {
    const code = normalizeAllyCode(allyCode);
    if (!store.status?.().configured) {
      const error = new Error('Guild Intelligence persistence is not configured.');
      error.status = 503;
      error.code = 'PERSISTENCE_NOT_CONFIGURED';
      throw error;
    }
    const payload = await store.rpc('read_guild_intelligence_status', { p_ally_code: code });
    const body = rpcBody(payload);
    if (!body?.guild?.id) {
      const error = new Error('No persisted Guild Intelligence record is available for that Ally Code.');
      error.status = 404;
      error.code = 'GUILD_INTELLIGENCE_NOT_FOUND';
      throw error;
    }
    const pages = Array.isArray(body.pages) ? body.pages : [];
    const counts = pages.reduce((acc, page) => {
      const key = clean(page.captureStatus || 'not-captured');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.freeze({
      ...body,
      summary: Object.freeze({
        totalPages: pages.length,
        captured: Number(counts.captured || 0),
        partial: Number(counts.partial || 0),
        sourcePending: Number(counts.source_pending || 0),
        notApplicable: Number(counts.not_applicable || 0),
        failed: Number(counts.failed || 0),
        returnedTotal: Number(body.returnedTotal || 0),
      }),
    });
  }

  return Object.freeze({ status, getByPlayer });
}

export const guildIntelligenceService = createGuildIntelligenceService();
