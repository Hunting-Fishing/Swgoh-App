import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbMissionAttemptHistoryService } from '../tb-mission-attempt-history-service.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_ID = '22222222-2222-4222-8222-222222222222';
const GUILD_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';

function eq(queryValue) {
  return String(queryValue || '').startsWith('eq.') ? String(queryValue).slice(3) : null;
}

function fakeStore() {
  const attempts = [];
  let inserts = 0;
  const tables = {
    user_player_links: [{ user_id: USER_ID, player_id: PLAYER_ID, is_primary: true, verification_status: 'verified', verified_at: '2026-08-20T00:00:00.000Z' }],
    players: [{ id: PLAYER_ID, ally_code: '123456789', swgoh_player_id: 'swgoh-player-1', name: 'WarmBacon', current_guild_id: GUILD_ID }],
    guild_user_memberships: [{ guild_id: GUILD_ID, user_id: USER_ID, player_id: PLAYER_ID, role: 'member', status: 'active' }],
    guild_tb_events: [{ id: EVENT_ID, guild_id: GUILD_ID, tb_key: 'rote', current_phase: 'P2', status: 'active', started_at: '2026-08-19T00:00:00.000Z', ends_at: '2026-08-25T00:00:00.000Z', updated_at: '2026-08-20T00:00:00.000Z' }],
    guild_tb_mission_attempts: attempts,
  };

  function matches(row, query = {}) {
    for (const [key, value] of Object.entries(query)) {
      if (['select','order','limit'].includes(key)) continue;
      const expected = eq(value);
      if (expected !== null && String(row?.[key] ?? '') !== expected) return false;
    }
    return true;
  }

  return {
    attempts,
    get inserts() { return inserts; },
    status() { return { configured: true }; },
    async select(table, query = {}) {
      const rows = (tables[table] || []).filter((row) => matches(row, query));
      return rows.slice(0, Number(query.limit || rows.length));
    },
    async insert(table, rows) {
      assert.equal(table, 'guild_tb_mission_attempts');
      inserts += 1;
      const row = {
        ...rows[0],
        id: `55555555-5555-4555-8555-${String(inserts).padStart(12, '0')}`,
        created_at: '2026-08-20T01:55:00.000Z',
      };
      attempts.push(row);
      return [row];
    },
  };
}

function battleInput(overrides = {}) {
  return {
    id: 'attempt-felucia-hondo-001',
    eventId: EVENT_ID,
    phase: 'P2',
    planetId: 'felucia',
    missionId: 'felucia-hondo',
    allyCode: '123456789',
    result: '2_of_2',
    wavesCompleted: 2,
    wavesTotal: 2,
    reportedAt: '2026-08-20T01:45:00.000Z',
    team: [{
      slot: 0,
      baseId: 'HONDO',
      level: 85,
      stars: 7,
      gear: 13,
      relic: 6,
      zetaCount: 2,
      omicronCount: 1,
      speed: 320,
      health: 110000,
      abilities: [{ id: 'unique01', name: 'I Smell Profit!', tier: 8, hasZeta: true, hasOmicron: false }],
    }],
    strategicAbilitySnapshot: { id: 'ability-1', active: true },
    operationStateSnapshot: { complete: 4, required: 6 },
    ...overrides,
  };
}

test('records an append-only normalized Guild attempt with progression and provenance snapshots', async () => {
  const store = fakeStore();
  const service = createTbMissionAttemptHistoryService({ store, now: () => new Date('2026-08-20T01:55:00.000Z') });

  const result = await service.record(USER_ID, battleInput());

  assert.equal(result.saved, true);
  assert.equal(result.alreadyRecorded, false);
  assert.equal(store.inserts, 1);
  assert.equal(store.attempts[0].guild_id, GUILD_ID);
  assert.equal(store.attempts[0].event_id, EVENT_ID);
  assert.equal(store.attempts[0].player_id, PLAYER_ID);
  assert.equal(store.attempts[0].ally_code, '123456789');
  assert.equal(store.attempts[0].outcome, 'complete');
  assert.equal(store.attempts[0].squad_signature, 'HONDO');
  assert.equal(store.attempts[0].team_snapshot[0].relic, 6);
  assert.equal(store.attempts[0].team_snapshot[0].stats.speed, 320);
  assert.equal(store.attempts[0].report_source, 'member_web');
  assert.equal(store.attempts[0].metadata.evidenceClass, 'GUILD_DATA');
  assert.equal(store.attempts[0].metadata.predictiveProbability, null);
  assert.match(store.attempts[0].attempt_key, /^[0-9a-f]{64}$/);
  assert.match(store.attempts[0].evidence_fingerprint, /^[0-9a-f]{64}$/);
});

test('retries with the same logical attempt ID and evidence are idempotent', async () => {
  const store = fakeStore();
  const service = createTbMissionAttemptHistoryService({ store });
  const input = battleInput();

  const first = await service.record(USER_ID, input);
  const second = await service.record(USER_ID, input);

  assert.equal(first.alreadyRecorded, false);
  assert.equal(second.alreadyRecorded, true);
  assert.equal(first.attempt.attemptKey, second.attempt.attemptKey);
  assert.equal(store.inserts, 1);
  assert.equal(store.attempts.length, 1);
});

test('same attempt ID with changed evidence fails closed instead of rewriting history', async () => {
  const store = fakeStore();
  const service = createTbMissionAttemptHistoryService({ store });
  await service.record(USER_ID, battleInput());

  await assert.rejects(
    () => service.record(USER_ID, battleInput({ result: '0_of_2', wavesCompleted: 0 })),
    (error) => error?.status === 409 && error?.code === 'TB_ATTEMPT_EVIDENCE_CONFLICT',
  );
  assert.equal(store.inserts, 1);
  assert.equal(store.attempts[0].outcome, 'complete');
});

test('combat-result evidence requires an exact squad snapshot while skipped/unknown can remain squadless', async () => {
  const store = fakeStore();
  const service = createTbMissionAttemptHistoryService({ store });

  await assert.rejects(
    () => service.record(USER_ID, battleInput({ id: 'attempt-no-team-failed', result: 'failed', team: [] })),
    (error) => error?.status === 409 && error?.code === 'TB_ATTEMPT_SQUAD_REQUIRED',
  );

  const skipped = await service.record(USER_ID, battleInput({ id: 'attempt-skipped-001', result: 'skipped', team: [], wavesCompleted: null, wavesTotal: null }));
  assert.equal(skipped.attempt.outcome, 'skipped');
  assert.equal(skipped.attempt.team.length, 0);
});

test('member evidence cannot be attributed to another Ally Code', async () => {
  const store = fakeStore();
  const service = createTbMissionAttemptHistoryService({ store });
  await assert.rejects(
    () => service.record(USER_ID, battleInput({ allyCode: '987654321' })),
    (error) => error?.status === 403 && error?.code === 'TB_ATTEMPT_PLAYER_MISMATCH',
  );
  assert.equal(store.inserts, 0);
});

test('Guild history reads stay scoped to the verified current Guild and preserve observed-evidence language', async () => {
  const store = fakeStore();
  const service = createTbMissionAttemptHistoryService({ store });
  await service.record(USER_ID, battleInput());

  const history = await service.list(USER_ID, { eventId: EVENT_ID, phase: 'P2', missionId: 'felucia-hondo' });

  assert.equal(history.guildId, GUILD_ID);
  assert.equal(history.attempts.length, 1);
  assert.equal(history.attempts[0].missionId, 'felucia-hondo');
  assert.equal(history.attempts[0].outcome, 'complete');
  assert.equal(history.attempts[0].metadata.predictiveProbability, null);
  assert.match(history.evidenceBoundary, /observed evidence only/i);
});
