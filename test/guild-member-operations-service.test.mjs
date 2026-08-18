import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildMemberOperationsService } from '../guild-member-operations-service.mjs';

const guildId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const playerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const otherPlayerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function operations() {
  return {
    async requireOfficer(userId, code) {
      assert.equal(userId, 'officer-user');
      assert.equal(code, '732764286');
      return { userId, code, role: 'officer', guild: { id: guildId, name: 'Ludus Venatus', last_synced_at: '2026-08-18T13:00:00Z' } };
    },
  };
}
function storeFixture() {
  const tables = {
    players: [
      { id: playerId, ally_code: '111222333', swgoh_player_id: 'game-alpha', name: 'Alpha', level: 85, galactic_power: 12000000, character_power: 7000000, ship_power: 5000000, current_guild_id: guildId, last_synced_at: '2026-08-18T12:59:00Z' },
      { id: otherPlayerId, ally_code: '444555666', swgoh_player_id: 'game-bravo', name: 'Bravo', level: 85, galactic_power: 9000000, character_power: 5500000, ship_power: 3500000, current_guild_id: guildId, last_synced_at: '2026-08-18T12:58:00Z' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ally_code: '777888999', swgoh_player_id: 'former', name: 'Former', current_guild_id: null },
    ],
    guild_members_current: [
      { guild_id: guildId, player_id: playerId, member_name: 'Alpha', member_galactic_power: 12000000, member_character_power: 7000000, member_ship_power: 5000000, last_synced_at: '2026-08-18T12:59:00Z' },
      { guild_id: guildId, player_id: otherPlayerId, member_name: 'Bravo', member_galactic_power: 9000000, member_character_power: 5500000, member_ship_power: 3500000, last_synced_at: '2026-08-18T12:58:00Z' },
    ],
    guild_member_operation_controls: [
      { guild_id: guildId, player_id: playerId, available: true, ignored_until: '2099-01-01T00:00:00Z', ignore_reason: 'Vacation', source: 'command-center-web', updated_at: '2026-08-18T12:30:00Z' },
    ],
    guild_unit_donation_preferences: [
      { guild_id: guildId, player_id: playerId, base_id: 'UNIT_A', preference: 'give', source: 'command-center-web', updated_at: '2026-08-18T12:31:00Z' },
      { guild_id: guildId, player_id: playerId, base_id: 'UNIT_B', preference: 'keep', source: 'discord-player', updated_at: '2026-08-18T12:32:00Z' },
    ],
    guild_tb_assignment_runs: [
      { id: 'tb-run-new', guild_id: guildId, status: 'preview', created_at: '2026-08-18T12:50:00Z', published_at: null, assignments: [
        { phase: 'P2', squadId: 'op-2', baseId: 'UNIT_A', name: 'Unit A', member: { playerId: 'game-alpha', allyCode: '111222333', name: 'Alpha' }, safety: { help: false, preference: 'give' }, locked: true },
        { phase: 'P2', squadId: 'op-2', baseId: 'UNIT_X', name: 'Unit X', member: { playerId: 'game-bravo', allyCode: '444555666', name: 'Bravo' } },
      ] },
      { id: 'tb-run-old', guild_id: guildId, status: 'published', created_at: '2026-08-17T12:50:00Z', published_at: '2026-08-17T13:00:00Z', assignments: [] },
    ],
    guild_tw_defense_runs: [
      { id: 'tw-run-new', guild_id: guildId, status: 'published', created_at: '2026-08-18T12:40:00Z', published_at: '2026-08-18T12:45:00Z', assignments: [
        { priority: 1, zoneName: 'Front Wall', teamName: 'Leia', member: { allyCode: '111222333', name: 'Alpha' } },
      ] },
    ],
    guild_operation_schedules: [
      { id: 'schedule-active', guild_id: guildId, run_type: 'tb', name: 'ROTE Nightly', status: 'active', stage: 'idle', next_run_at: '2026-08-19T00:00:00Z', last_run_at: '', last_error: '', auto_publish: true },
      { id: 'schedule-paused', guild_id: guildId, run_type: 'tw', name: 'TW Paused', status: 'paused', stage: 'idle', next_run_at: '2026-08-20T00:00:00Z', last_run_at: '', last_error: '', auto_publish: false },
    ],
    guild_operations_audit_log: [
      { id: 1, guild_id: guildId, action: 'member-control.update', entity_type: 'guild_member_operation_controls', entity_id: playerId, metadata: {}, occurred_at: '2026-08-18T12:30:00Z' },
      { id: 2, guild_id: guildId, action: 'donation-preference.update', entity_type: 'guild_unit_donation_preferences', entity_id: `${playerId}:UNIT_A`, metadata: {}, occurred_at: '2026-08-18T12:31:00Z' },
      { id: 3, guild_id: guildId, action: 'unrelated', entity_type: 'other', entity_id: otherPlayerId, metadata: {}, occurred_at: '2026-08-18T12:32:00Z' },
    ],
  };
  const matches = (row, query = {}) => Object.entries(query).every(([key, value]) => {
    if (['select','order','limit'].includes(key)) return true;
    if (String(value).startsWith('eq.')) return String(row[key] ?? '') === String(value).slice(3);
    return true;
  });
  return {
    async select(table, query = {}) {
      let rows = (tables[table] || []).filter((row) => matches(row, query));
      if (String(query.order || '').includes('created_at.desc')) rows = rows.slice().sort((a,b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
      if (String(query.order || '').includes('next_run_at.asc')) rows = rows.slice().sort((a,b) => Date.parse(a.next_run_at || 0) - Date.parse(b.next_run_at || 0));
      if (String(query.order || '').includes('occurred_at.desc')) rows = rows.slice().sort((a,b) => Date.parse(b.occurred_at || 0) - Date.parse(a.occurred_at || 0));
      if (String(query.order || '').includes('name.asc')) rows = rows.slice().sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
      return rows.slice(0, Number(query.limit || rows.length));
    },
  };
}
function stateStore() {
  return {
    status: () => ({ enabled: true, durable: true }),
    async readGuild(discordGuildId) {
      assert.equal(discordGuildId, '987654321098765432');
      return { userLinks: { '700000000000000001': { swgohAllyCode: '111222333', playerId: 'game-alpha', linkedAt: '2026-08-17T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' } } };
    },
  };
}

test('directory contains only exact current canonical Guild members', async () => {
  const service = createGuildMemberOperationsService({ store: storeFixture(), operations: operations() });
  const result = await service.directory('officer-user', '732764286');
  assert.equal(result.members.length, 2);
  assert.deepEqual(result.members.map((row) => row.name), ['Alpha', 'Bravo']);
  assert.equal(result.members.some((row) => row.name === 'Former'), false);
});

test('member drawer aggregates controls, preferences, durable link, reserves, persisted assignments and future planner runs without conflating them', async () => {
  const service = createGuildMemberOperationsService({
    store: storeFixture(),
    operations: operations(),
    delivery: { async resolveBinding(id) { assert.equal(id, guildId); return { discordGuildId: '987654321098765432' }; } },
    stateStore: stateStore(),
    listHardReservations: async ({ discordGuildId, discordUserId }) => {
      assert.equal(discordGuildId, '987654321098765432');
      assert.equal(discordUserId, '700000000000000001');
      return { rows: [{ phase: 'P3', baseId: 'UNIT_KEEP', unitName: 'Reserved Unit', updatedAt: '2026-08-18T12:00:00Z' }] };
    },
  });
  const result = await service.member('officer-user', '732764286', playerId);
  assert.equal(result.player.name, 'Alpha');
  assert.equal(result.player.galacticPower, 12000000);
  assert.equal(result.control.activelyExcluded, true);
  assert.equal(result.donations.length, 2);
  assert.equal(result.discord.linked, true);
  assert.equal(result.discord.discordUserId, '700000000000000001');
  assert.equal(result.hardReservations.available, true);
  assert.equal(result.hardReservations.rows[0].baseId, 'UNIT_KEEP');
  assert.equal(result.assignments.tb.runId, 'tb-run-new');
  assert.equal(result.assignments.tb.assignments.length, 1);
  assert.equal(result.assignments.tb.assignments[0].baseId, 'UNIT_A');
  assert.equal(result.assignments.tw.assignments.length, 1);
  assert.equal(result.assignments.tw.assignments[0].teamName, 'Leia');
  assert.equal(result.upcomingPlannerRuns.length, 1, 'paused schedule is not an upcoming active planner run');
  assert.equal(result.upcomingPlannerRuns[0].name, 'ROTE Nightly');
  assert.match(result.semantics.upcomingPlannerRuns, /not guaranteed member assignments/i);
  assert.deepEqual(result.recentAudit.map((row) => row.action), ['donation-preference.update','member-control.update']);
});

test('hard reservation storage failure degrades only the hard-reserve section', async () => {
  const service = createGuildMemberOperationsService({
    store: storeFixture(), operations: operations(),
    delivery: { async resolveBinding() { return { discordGuildId: '987654321098765432' }; } },
    stateStore: stateStore(),
    listHardReservations: async () => { const error = new Error('volume temporarily unavailable'); error.code = 'RESERVE_STORE_DOWN'; throw error; },
  });
  const result = await service.member('officer-user', '732764286', playerId);
  assert.equal(result.hardReservations.available, false);
  assert.equal(result.hardReservations.reason, 'RESERVE_STORE_DOWN');
  assert.equal(result.assignments.tb.assignments.length, 1);
  assert.equal(result.donations.length, 2);
});

test('member detail rejects a player that is not in the current canonical Guild membership projection', async () => {
  const service = createGuildMemberOperationsService({ store: storeFixture(), operations: operations() });
  await assert.rejects(
    service.member('officer-user', '732764286', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    (error) => error?.code === 'PLAYER_NOT_CURRENT_GUILD_MEMBER',
  );
});
