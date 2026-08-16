import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuildRosterService } from '../guild-roster-service.mjs';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function guildBody({ activity = false } = {}) {
  return {
    source: 'live',
    guild: { id: 'guild-1', name: 'Test Guild' },
    members: [{ playerId: 'p1', allyCode: '123456789', rosterAvailable: true, units: [] }],
    ...(activity ? {
      activity: {
        nextChallengesRefresh: '1770000000',
        recentRaidResult: [{ raidId: 'order66' }],
        recentTerritoryWarResult: [{ endTime: '1769980000' }],
        guildEventTracker: [{ definitionId: 't05D', completedStars: 30 }],
      },
    } : {}),
  };
}

const env = {
  SWGOH_GATEWAY_URL: 'https://gateway.example',
  SWGOH_GATEWAY_API_KEY: 'gateway-secret',
  SWGOH_GUILD_REQUEST_TIMEOUT_MS: '5000',
  SWGOH_GUILD_CACHE_FRESH_SECONDS: '600',
  SWGOH_GUILD_CACHE_STALE_SECONDS: '1800',
  SWGOH_GUILD_CACHE_MAX_ENTRIES: '100',
};

test('ordinary Guild reads do not request rich activity', async () => {
  const urls = [];
  const service = createGuildRosterService(env, {
    fetch: async (url) => {
      urls.push(url);
      return response(guildBody());
    },
  });

  const result = await service.getGuildRoster('123-456-789');
  assert.equal(result.includeActivity, false);
  assert.equal(urls.length, 1);
  assert.equal(urls[0], 'https://gateway.example/v1/guild/by-player/123456789/roster');
  assert.equal(result.value.activity, undefined);
});

test('analytics reads explicitly request activity=1', async () => {
  const urls = [];
  const service = createGuildRosterService(env, {
    fetch: async (url) => {
      urls.push(url);
      return response(guildBody({ activity: url.includes('activity=1') }));
    },
  });

  const result = await service.getGuildRoster('123456789', { includeActivity: true });
  assert.equal(result.includeActivity, true);
  assert.equal(urls[0], 'https://gateway.example/v1/guild/by-player/123456789/roster?activity=1');
  assert.equal(result.value.activity.nextChallengesRefresh, '1770000000');
  assert.equal(result.value.activity.recentRaidResult.length, 1);
});

test('ordinary and rich snapshots never share the same cache entry', async () => {
  const urls = [];
  const service = createGuildRosterService(env, {
    fetch: async (url) => {
      urls.push(url);
      return response(guildBody({ activity: url.includes('activity=1') }));
    },
  });

  const normal = await service.getGuildRoster('123456789');
  const rich = await service.getGuildRoster('123456789', { includeActivity: true });
  const normalAgain = await service.getGuildRoster('123456789');
  const richAgain = await service.getGuildRoster('123456789', { includeActivity: true });

  assert.equal(urls.length, 2, 'one normal load and one rich load should populate separate cache entries');
  assert.equal(normal.value.activity, undefined);
  assert.equal(normalAgain.value.activity, undefined);
  assert.ok(rich.value.activity);
  assert.ok(richAgain.value.activity);
  assert.notEqual(normal.value, rich.value);
});

test('forced rich refresh refreshes only the rich cache key', async () => {
  let normalLoads = 0;
  let richLoads = 0;
  const service = createGuildRosterService(env, {
    fetch: async (url) => {
      if (url.includes('activity=1')) richLoads += 1;
      else normalLoads += 1;
      return response(guildBody({ activity: url.includes('activity=1') }));
    },
  });

  await service.getGuildRoster('123456789');
  await service.getGuildRoster('123456789', { includeActivity: true });
  await service.refreshGuildRoster('123456789', { includeActivity: true });
  await service.getGuildRoster('123456789');

  assert.equal(normalLoads, 1);
  assert.equal(richLoads, 2);
});

test('status documents activity as opt-in rather than globally enabled', () => {
  const service = createGuildRosterService(env, { fetch: async () => response(guildBody()) });
  assert.equal(service.status().activityMode, 'opt-in-separate-cache-key');
});
