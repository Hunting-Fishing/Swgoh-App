import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildRosterService } from '../guild-roster-service.mjs';

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function liveSnapshot(name = 'Live Guild') {
  return {
    source: 'live',
    guild: { id: 'guild-1', name, galacticPower: 100 },
    members: [{ playerId: 'p1', allyCode: '123456789', name: 'Officer', rosterAvailable: true, units: [] }],
  };
}

function persistedSnapshot() {
  return {
    source: 'persisted',
    fetchedAt: '2026-08-18T00:00:00.000Z',
    guild: { id: 'guild-1', name: 'Persisted Guild', galacticPower: 100 },
    hydration: { requested: 1, hydrated: 1, failed: 0, complete: true },
    members: [{ playerId: 'p1', allyCode: '123456789', name: 'Officer', rosterAvailable: true, units: [] }],
  };
}

test('ordinary Guild reads prefer canonical persistence without touching Comlink', async () => {
  let liveFetches = 0;
  let persistedReads = 0;
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: 'https://gateway.test',
    SWGOH_GATEWAY_API_KEY: 'secret',
  }, {
    fetch: async () => { liveFetches += 1; return response(liveSnapshot()); },
    persistedService: {
      status: () => ({ configured: true }),
      getGuildRoster: async () => { persistedReads += 1; return { value: persistedSnapshot(), cache: 'fresh', ageMs: 60_000 }; },
    },
  });

  const result = await service.getGuildRoster('123456789');
  assert.equal(result.value.source, 'persisted');
  assert.equal(result.transport, 'supabase-persisted');
  assert.equal(persistedReads, 1);
  assert.equal(liveFetches, 0);
});

test('explicit refresh bypasses persistence and forces a live Guild fetch', async () => {
  let liveFetches = 0;
  let persistedReads = 0;
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: 'https://gateway.test', SWGOH_GATEWAY_API_KEY: 'secret',
  }, {
    fetch: async () => { liveFetches += 1; return response(liveSnapshot('Refreshed Live Guild')); },
    persistedService: {
      status: () => ({ configured: true }),
      getGuildRoster: async () => { persistedReads += 1; return { value: persistedSnapshot(), cache: 'fresh', ageMs: 0 }; },
    },
  });

  const result = await service.getGuildRoster('123456789', { forceRefresh: true });
  assert.equal(result.value.source, 'live');
  assert.equal(result.value.guild.name, 'Refreshed Live Guild');
  assert.equal(result.transport, 'comlink-live');
  assert.equal(liveFetches, 1);
  assert.equal(persistedReads, 0);
});

test('activity-rich Guild reads remain live and preserve the activity gateway contract', async () => {
  const urls = [];
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: 'https://gateway.test', SWGOH_GATEWAY_API_KEY: 'secret',
  }, {
    fetch: async (url) => { urls.push(url); return response(liveSnapshot('Activity Guild')); },
    persistedService: {
      status: () => ({ configured: true }),
      getGuildRoster: async () => { throw new Error('should not read persisted activity'); },
    },
  });

  const result = await service.getGuildRoster('123456789', { includeActivity: true, staleWhileRevalidate: false });
  assert.equal(result.value.source, 'live');
  assert.equal(urls[0], 'https://gateway.test/v1/guild/by-player/123456789/roster?activity=1');
});

test('persistence failures fail open to the live Guild gateway', async () => {
  let liveFetches = 0;
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: 'https://gateway.test', SWGOH_GATEWAY_API_KEY: 'secret',
  }, {
    fetch: async () => { liveFetches += 1; return response(liveSnapshot('Fallback Guild')); },
    persistedService: {
      status: () => ({ configured: true }),
      getGuildRoster: async () => { throw Object.assign(new Error('temporary persistence failure'), { status: 503 }); },
    },
  });

  const result = await service.getGuildRoster('123456789');
  assert.equal(result.value.guild.name, 'Fallback Guild');
  assert.equal(result.transport, 'comlink-live');
  assert.equal(liveFetches, 1);
});
