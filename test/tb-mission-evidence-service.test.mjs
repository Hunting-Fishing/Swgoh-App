import test from 'node:test';
import assert from 'node:assert/strict';
import { createTbMissionEvidenceService } from '../tb-mission-evidence-service.mjs';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_PLAYER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const GUILD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ATTEMPT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function identity() {
  return {
    userId: USER_ID,
    allyCode: '123456789',
    player: { id: PLAYER_ID, name: 'Warm Bacon' },
    guildId: GUILD_ID,
  };
}

function eventSnapshot(overrides = {}) {
  return {
    configured: true,
    event: { id: EVENT_ID, currentPhase: 'P2', status: 'active' },
    zones: [],
    ...overrides,
  };
}

function attempt(overrides = {}) {
  return {
    id: ATTEMPT_ID,
    guild_id: GUILD_ID,
    event_id: EVENT_ID,
    phase: 'P2',
    planet_id: 'bracca',
    mission_id: 'bracca-zeffo-unlock',
    player_id: PLAYER_ID,
    ally_code: '123456789',
    result_code: '2/2',
    team_snapshot: {},
    note: '',
    source_kind: 'member_report',
    revision: 1,
    is_current: true,
    correction_reason: '',
    reported_at: '2026-08-19T12:00:00.000Z',
    ...overrides,
  };
}

const officerOperations = {
  async requireOfficer(userId, allyCode) {
    assert.equal(userId, USER_ID);
    assert.equal(allyCode, '123456789');
    return { guild: { id: GUILD_ID, name: 'Test Guild' } };
  },
};

function events(snapshot = eventSnapshot()) {
  return {
    async verifiedIdentity(userId) { assert.equal(userId, USER_ID); return identity(); },
    async eventSnapshot(userId) { assert.equal(userId, USER_ID); return snapshot; },
  };
}

test('evidence keeps Community, Guild and You as separate layers', async () => {
  const rows = [
    attempt(),
    attempt({ id: '11111111-1111-4111-8111-111111111111', event_id: '22222222-2222-4222-8222-222222222222', player_id: OTHER_PLAYER_ID, ally_code: '987654321', result_code: '1/2', reported_at: '2026-07-01T12:00:00.000Z' }),
    attempt({ id: '33333333-3333-4333-8333-333333333333', event_id: '44444444-4444-4444-8444-444444444444', player_id: OTHER_PLAYER_ID, ally_code: '987654321', result_code: 'skipped', reported_at: '2026-06-01T12:00:00.000Z' }),
  ];
  const service = createTbMissionEvidenceService({
    events: events(),
    operations: officerOperations,
    store: {
      async select(table) {
        if (table === 'guild_tb_mission_attempts') return rows;
        if (table === 'players') return [{ id: PLAYER_ID, name: 'Warm Bacon', ally_code: '123456789' }, { id: OTHER_PLAYER_ID, name: 'Guild Mate', ally_code: '987654321' }];
        return [];
      },
    },
  });
  const result = await service.evidence(USER_ID, { missionIds: ['bracca-zeffo-unlock'] });
  assert.equal(result.officer, true);
  assert.equal(result.missions.length, 1);
  const mission = result.missions[0];
  assert.ok(Array.isArray(mission.community.sourceIds));
  assert.match(mission.community.evidenceBoundary, /No community win-rate claim/i);
  assert.equal(mission.guild.reports, 3);
  assert.equal(mission.guild.attempts, 2);
  assert.equal(mission.guild.counts['2/2'], 1);
  assert.equal(mission.guild.counts['1/2'], 1);
  assert.equal(mission.guild.counts.skipped, 1);
  assert.match(mission.guild.evidenceBoundary, /not a universal win probability/i);
  assert.equal(mission.you.reports, 1);
  assert.equal(mission.you.currentEventReport.resultCode, '2/2');
  assert.equal(mission.canReport, false);
  assert.equal(mission.officerCurrentEventReports[0].playerName, 'Warm Bacon');
});

test('active-phase member can report when no current event report exists', async () => {
  const service = createTbMissionEvidenceService({
    events: events(),
    operations: { async requireOfficer() { const error = new Error('Officer required'); error.status = 403; error.code = 'OFFICER_REQUIRED'; throw error; } },
    store: { async select() { return []; } },
  });
  const result = await service.evidence(USER_ID, { missionIds: ['bracca-zeffo-unlock'] });
  assert.equal(result.officer, false);
  assert.equal(result.missions[0].canReport, true);
  assert.deepEqual(result.missions[0].officerCurrentEventReports, []);
});

test('member report uses verified identity and active canonical mission phase', async () => {
  let rpcName = '';
  let rpcArgs = null;
  const service = createTbMissionEvidenceService({
    events: events(),
    operations: officerOperations,
    store: {
      async rpc(name, args) {
        rpcName = name;
        rpcArgs = args;
        return { id: ATTEMPT_ID, revision: 1, reportedAt: '2026-08-19T13:00:00.000Z' };
      },
    },
  });
  const saved = await service.report(USER_ID, {
    missionId: 'bracca-zeffo-unlock',
    resultCode: '1/2',
    note: 'Used JKL; lost wave 2.',
    teamSnapshot: { squadName: 'JKL', members: [{ baseId: 'JEDIKNIGHTLUKE', relic: 8, speed: 245 }] },
  });
  assert.equal(rpcName, 'record_guild_tb_mission_attempt');
  assert.equal(rpcArgs.p_guild_id, GUILD_ID);
  assert.equal(rpcArgs.p_event_id, EVENT_ID);
  assert.equal(rpcArgs.p_phase, 'P2');
  assert.equal(rpcArgs.p_planet_id, 'bracca');
  assert.equal(rpcArgs.p_mission_id, 'bracca-zeffo-unlock');
  assert.equal(rpcArgs.p_player_id, PLAYER_ID);
  assert.equal(rpcArgs.p_ally_code, '123456789');
  assert.equal(rpcArgs.p_result_code, '1/2');
  assert.equal(rpcArgs.p_allow_correction, false);
  assert.equal(rpcArgs.p_team_snapshot.members[0].baseId, 'JEDIKNIGHTLUKE');
  assert.equal(saved.attempt.resultCode, '1/2');
  assert.match(saved.evidenceBoundary, /member report, not canonical game telemetry/i);
});

test('member cannot report a canonical mission from a different active phase', async () => {
  let rpcCalled = false;
  const service = createTbMissionEvidenceService({
    events: events(),
    operations: officerOperations,
    store: { async rpc() { rpcCalled = true; return {}; } },
  });
  await assert.rejects(
    () => service.report(USER_ID, { missionId: 'corellia-jabba', resultCode: '2/2' }),
    (error) => error.status === 409 && error.code === 'TB_MISSION_NOT_ACTIVE_PHASE',
  );
  assert.equal(rpcCalled, false);
});

test('duplicate current report becomes an explicit correction-required conflict', async () => {
  const service = createTbMissionEvidenceService({
    events: events(),
    operations: officerOperations,
    store: { async rpc() { throw new Error('TB_ATTEMPT_ALREADY_REPORTED'); } },
  });
  await assert.rejects(
    () => service.report(USER_ID, { missionId: 'bracca-zeffo-unlock', resultCode: '2/2' }),
    (error) => error.status === 409 && error.code === 'TB_ATTEMPT_ALREADY_REPORTED',
  );
});

test('officer correction preserves exact current attempt identity and creates next revision through RPC', async () => {
  let rpcArgs = null;
  const service = createTbMissionEvidenceService({
    events: events(),
    operations: officerOperations,
    store: {
      async select(table) {
        if (table === 'guild_tb_mission_attempts') return [attempt({ result_code: '0/2', note: 'Wrong tap.' })];
        return [];
      },
      async rpc(name, args) {
        assert.equal(name, 'record_guild_tb_mission_attempt');
        rpcArgs = args;
        return { id: '12121212-1212-4121-8121-121212121212', revision: 2, supersedesAttemptId: ATTEMPT_ID, reportedAt: '2026-08-19T13:10:00.000Z' };
      },
    },
  });
  const result = await service.correct(USER_ID, ATTEMPT_ID, { resultCode: '2/2', correctionReason: 'Member selected the wrong result.' });
  assert.equal(rpcArgs.p_allow_correction, true);
  assert.equal(rpcArgs.p_expected_current_attempt_id, ATTEMPT_ID);
  assert.equal(rpcArgs.p_source_kind, 'officer_correction');
  assert.equal(rpcArgs.p_player_id, PLAYER_ID);
  assert.equal(rpcArgs.p_result_code, '2/2');
  assert.equal(result.attempt.revision, 2);
  assert.equal(result.attempt.supersedesAttemptId, ATTEMPT_ID);
  assert.match(result.evidenceBoundary, /prior report remains preserved/i);
});

test('unknown mission IDs fail closed rather than becoming free-text evidence keys', async () => {
  const service = createTbMissionEvidenceService({ events: events(), operations: officerOperations, store: { async select() { return []; } } });
  await assert.rejects(
    () => service.evidence(USER_ID, { missionIds: ['not-a-real-rote-mission'] }),
    (error) => error.status === 400 && error.code === 'TB_MISSION_UNKNOWN',
  );
});
