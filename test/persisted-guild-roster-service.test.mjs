import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistedGuildRosterService } from '../persisted-guild-roster-service.mjs';

function snapshot() {
  return {
    source: 'persisted',
    fetchedAt: '2026-08-18T00:00:00.000Z',
    guild: { id: 'guild-live-id', name: 'Ludus Venatus', galacticPower: 600_000_000, memberCount: 50 },
    hydration: { requested: 50, hydrated: 50, failed: 0, complete: true },
    members: [{
      playerId: 'player-1', allyCode: '123456789', name: 'Member', galacticPower: 12_000_000,
      rosterAvailable: true,
      units: [{ baseId: 'JEDIMASTERKENOBI', stars: 7, gear: 13, relic: 9, power: 55_000 }],
    }],
    membershipHistory: [],
    persistence: { ageSeconds: 120, unitShape: 'compact-progression-v1' },
  };
}

test('persisted Guild service reads the canonical RPC and caches compatible snapshots', async () => {
  let calls = 0;
  const store = {
    status: () => ({ configured: true }),
    rpc: async (name, args) => {
      calls += 1;
      assert.equal(name, 'read_persisted_guild_roster');
      assert.deepEqual(args, { p_ally_code: '123456789' });
      return snapshot();
    },
  };
  const service = createPersistedGuildRosterService({
    SWGOH_PERSISTED_GUILD_CACHE_FRESH_SECONDS: '60',
    SWGOH_PERSISTED_GUILD_CACHE_STALE_SECONDS: '300',
  }, { store, now: () => Date.parse('2026-08-18T00:02:00.000Z') });

  const first = await service.getGuildRoster('123-456-789');
  const second = await service.getGuildRoster('123456789');

  assert.equal(first.value.source, 'persisted');
  assert.equal(first.value.hydration.complete, true);
  assert.equal(first.ageMs, 120_000);
  assert.equal(second.value.guild.name, 'Ludus Venatus');
  assert.equal(calls, 1);
});

test('persisted Guild service distinguishes a missing canonical snapshot from invalid input', async () => {
  const service = createPersistedGuildRosterService({}, {
    store: { status: () => ({ configured: true }), rpc: async () => null },
  });
  await assert.rejects(
    () => service.getGuildRoster('123456789'),
    (error) => error?.status === 404 && error?.code === 'PERSISTED_GUILD_NOT_FOUND',
  );
  await assert.rejects(() => service.getGuildRoster('123'), /valid 9-digit Ally Code/);
});

test('persisted Guild service reports shared canonical mode without exposing credentials', () => {
  const service = createPersistedGuildRosterService({}, {
    store: { status: () => ({ configured: true }), rpc: async () => snapshot() },
  });
  const status = service.status();
  assert.equal(status.configured, true);
  assert.equal(status.sharedAcrossWebInstances, true);
  assert.equal(status.unitShape, 'compact-progression-v1');
  assert.equal(JSON.stringify(status).includes('serviceRole'), false);
});
