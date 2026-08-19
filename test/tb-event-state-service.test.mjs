import test from 'node:test';
import assert from 'node:assert/strict';
import { createTbEventStateService } from '../tb-event-state-service.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const GUILD_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function identityRows(table) {
  if (table === 'user_player_links') return [{ player_id: PLAYER_ID, is_primary: true, verification_status: 'verified', verified_at: '2026-08-19T00:00:00Z' }];
  if (table === 'players') return [{ id: PLAYER_ID, ally_code: '123456789', swgoh_player_id: 'GAMEPLAYER', name: 'Tester', current_guild_id: GUILD_ID, last_synced_at: '2026-08-19T00:00:00Z' }];
  if (table === 'guild_user_memberships') return [{ guild_id: GUILD_ID, user_id: USER_ID, player_id: PLAYER_ID, role: 'officer', status: 'active' }];
  return null;
}

function baseStore(overrides = {}) {
  return {
    async select(table, query) {
      const identity = identityRows(table);
      if (identity) return identity;
      if (overrides.select) return overrides.select(table, query);
      return [];
    },
    async insert(table, rows) {
      if (overrides.insert) return overrides.insert(table, rows);
      return rows;
    },
    async update(table, query, values) {
      if (overrides.update) return overrides.update(table, query, values);
      return [];
    },
    async upsert(table, rows) {
      if (overrides.upsert) return overrides.upsert(table, rows);
      return rows;
    },
    async delete() { return []; },
  };
}

const operations = {
  async requireOfficer(userId, allyCode) {
    assert.equal(userId, USER_ID);
    assert.equal(allyCode, '123456789');
    return { userId, guild: { id: GUILD_ID, name: 'Guild', last_synced_at: '2026-08-19T00:00:00Z' } };
  },
};

const canonical = { async getPlayerRoster() { return { fetchedAt: '2026-08-19T00:00:00Z', units: [], ships: [], player: { updatedAt: '2026-08-19T00:00:00Z' } }; } };

test('event snapshot fails closed when no active durable TB event exists', async () => {
  const service = createTbEventStateService({ store: baseStore(), operations, canonical });
  const result = await service.eventSnapshot(USER_ID);
  assert.equal(result.configured, false);
  assert.equal(result.event, null);
  assert.deepEqual(result.zones, []);
  assert.match(result.evidenceBoundary, /not being presented as live event state/i);
});

test('officer event creation stores explicit officer provenance', async () => {
  let inserted = null;
  const store = baseStore({
    insert: async (table, rows) => {
      assert.equal(table, 'guild_tb_events');
      inserted = rows[0];
      return [{ id: EVENT_ID, ...rows[0], created_at: '2026-08-19T04:00:00Z' }];
    },
  });
  const service = createTbEventStateService({ store, operations, canonical, now: () => new Date('2026-08-19T04:00:00Z') });
  const result = await service.saveEvent(USER_ID, { currentPhase: 'P2', status: 'active', startedAt: '2026-08-19T00:00:00Z' });
  assert.equal(inserted.guild_id, GUILD_ID);
  assert.equal(inserted.current_phase, 'P2');
  assert.equal(inserted.source_kind, 'officer');
  assert.equal(result.event.id, EVENT_ID);
  assert.match(result.evidenceBoundary, /verified Guild officer/i);
});

test('Today queue does not invent tasks when active event has no configured territory states', async () => {
  const store = baseStore({
    select: async (table) => {
      if (table === 'guild_tb_events') return [{ id: EVENT_ID, guild_id: GUILD_ID, tb_key: 'rote', current_phase: 'P2', status: 'active', source_kind: 'officer', updated_at: '2026-08-19T04:00:00Z' }];
      if (table === 'guild_tb_zone_states') return [];
      if (table === 'guild_tb_assignment_runs') return [];
      if (table === 'guild_tb_member_actions') return [];
      return [];
    },
  });
  const service = createTbEventStateService({ store, operations, canonical });
  const result = await service.today(USER_ID);
  assert.equal(result.configured, true);
  assert.deepEqual(result.tasks, []);
  assert.equal(result.summary.total, 0);
  assert.match(result.evidenceBoundary, /durable officer\/canonical event state/i);
});

test('zone state accepts explicit ROTE officer commands, preload cap and clamps star targets', async () => {
  let saved = null;
  const store = baseStore({
    select: async (table) => table === 'guild_tb_events'
      ? [{ id: EVENT_ID, guild_id: GUILD_ID, tb_key: 'rote', current_phase: 'P2', status: 'active', source_kind: 'officer' }]
      : [],
    upsert: async (table, rows) => {
      assert.equal(table, 'guild_tb_zone_states');
      saved = rows[0];
      return [{ id: '55555555-5555-4555-8555-555555555555', ...rows[0] }];
    },
  });
  const service = createTbEventStateService({ store, operations, canonical, now: () => new Date('2026-08-19T04:00:00Z') });
  const result = await service.saveZoneState(USER_ID, {
    eventId: EVENT_ID,
    phase: 'P2',
    planetId: 'geonosis',
    commandState: 'preload',
    currentTp: 120000000,
    preloadCapTp: 148124999,
    targetStars: 8,
    commandMessage: 'Preload only.',
  });
  assert.equal(saved.command_state, 'preload');
  assert.equal(saved.preload_cap_tp, 148124999);
  assert.equal(saved.target_stars, 3);
  assert.equal(result.zone.planetId, 'geonosis');
  assert.equal(result.zone.preloadCapTp, 148124999);
  assert.match(result.evidenceBoundary, /officer-entered/i);
});

test('zone state rejects a normal territory outside the active phase', async () => {
  const store = baseStore({
    select: async (table) => table === 'guild_tb_events'
      ? [{ id: EVENT_ID, guild_id: GUILD_ID, tb_key: 'rote', current_phase: 'P2', status: 'active', source_kind: 'officer' }]
      : [],
  });
  const service = createTbEventStateService({ store, operations, canonical });
  await assert.rejects(
    () => service.saveZoneState(USER_ID, { eventId: EVENT_ID, phase: 'P2', planetId: 'mustafar', commandState: 'hold' }),
    (error) => error?.code === 'TB_PLANET_PHASE_MISMATCH',
  );
});

test('bonus territory can be explicitly configured in the phase that unlocks it', async () => {
  let saved = null;
  const store = baseStore({
    select: async (table) => table === 'guild_tb_events'
      ? [{ id: EVENT_ID, guild_id: GUILD_ID, tb_key: 'rote', current_phase: 'P3', status: 'active', source_kind: 'officer' }]
      : [],
    upsert: async (_table, rows) => {
      saved = rows[0];
      return [{ id: '66666666-6666-4666-8666-666666666666', ...rows[0] }];
    },
  });
  const service = createTbEventStateService({ store, operations, canonical });
  const result = await service.saveZoneState(USER_ID, { eventId: EVENT_ID, phase: 'P3', planetId: 'zeffo', commandState: 'deploy' });
  assert.equal(saved.phase, 'P3');
  assert.equal(saved.planet_id, 'zeffo');
  assert.equal(result.planet.phase, 'Zeffo');
});
