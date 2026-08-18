import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildIntegrationReportService } from '../guild-integration-report-service.mjs';

const guildId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function storeFixture() {
  const data = {
    guild_discord_destinations: [
      { id: 'd1', destination_kind: 'channel', external_id: '111111111111111111', display_name: 'tb-orders', verified: true, updated_at: '2026-08-18T10:00:00Z' },
      { id: 'd2', destination_kind: 'channel', external_id: '222222222222222222', display_name: 'old-channel', verified: false, updated_at: '2026-08-17T10:00:00Z' },
    ],
    guild_operation_schedules: [
      { id: 's1', run_type: 'tb', name: 'ROTE Daily', status: 'active', stage: 'idle', next_run_at: '2026-08-19T00:00:00Z', last_run_at: '', last_error: '' },
      { id: 's2', run_type: 'tw', name: 'TW Defense', status: 'active', stage: 'syncing', next_run_at: '2026-08-20T00:00:00Z', last_run_at: '', last_error: 'Previous retry recorded' },
      { id: 's3', run_type: 'tb', name: 'Paused Test', status: 'paused', stage: 'idle', next_run_at: '2026-08-21T00:00:00Z', last_run_at: '', last_error: '' },
    ],
    guild_operations_delivery_receipts: [
      { id: 'r1', run_type: 'tb', delivery_kind: 'discord_channel', recipient_key: 'public', status: 'delivered', external_channel_id: '111111111111111111', http_status: 200, error_message: '', attempted_at: '2026-08-18T12:00:00Z', delivered_at: '2026-08-18T12:00:01Z' },
      { id: 'r2', run_type: 'tw', delivery_kind: 'dm', recipient_key: 'user-1', status: 'failed', external_channel_id: '', http_status: 403, error_message: 'DM blocked', attempted_at: '2026-08-18T11:00:00Z', delivered_at: '' },
    ],
    players: [
      { id: 'player-db-1', ally_code: '111222333', swgoh_player_id: 'player-live-1', name: 'Alpha', current_guild_id: guildId },
      { id: 'player-db-2', ally_code: '444555666', swgoh_player_id: 'player-live-2', name: 'Bravo', current_guild_id: guildId },
    ],
    guild_unit_donation_preferences: [
      { player_id: 'player-db-1', base_id: 'UNIT_A', preference: 'give', source: 'command-center-web', updated_at: '2026-08-18T12:30:00Z' },
    ],
    guild_operations_audit_log: [
      { id: 'a1', action: 'tb-run.publish', entity_type: 'guild_tb_assignment_run', entity_id: 'run-1', occurred_at: '2026-08-18T12:00:01Z' },
    ],
  };
  return {
    status: () => ({ configured: true }),
    async select(table) { return data[table] || []; },
  };
}

function operationsFixture() {
  return {
    async requireOfficer(userId, allyCode) {
      assert.equal(userId, 'user-1');
      assert.equal(allyCode, '732764286');
      return {
        role: 'officer',
        guild: {
          id: guildId,
          name: 'Ludus Venatus',
          member_count: 2,
          galactic_power: 600000000,
          last_synced_at: '2026-08-18T12:15:00Z',
        },
      };
    },
  };
}

function stateFixture() {
  return {
    status: () => ({ enabled: true, durable: true }),
    async readGuild(discordGuildId) {
      assert.equal(discordGuildId, '987654321098765432');
      return {
        commandChannelId: '111111111111111111',
        officerRoleIds: ['333333333333333333'],
        userLinks: {
          '700000000000000001': { playerId: 'player-live-1', swgohAllyCode: '111222333' },
          '700000000000000002': { playerId: 'player-live-2', swgohAllyCode: '444555666' },
        },
        memberPreferences: {
          '700000000000000001|UNIT_A': {
            playerId: 'player-live-1', swgohAllyCode: '111222333', baseId: 'UNIT_A', preference: 'keep', updatedAt: '2026-08-18T10:00:00Z',
          },
          '700000000000000001|UNIT_B': {
            playerId: 'player-live-1', swgohAllyCode: '111222333', baseId: 'UNIT_B', preference: 'give', updatedAt: '2026-08-18T10:10:00Z',
          },
          '700000000000000002|UNIT_C': {
            playerId: 'player-live-2', swgohAllyCode: '444555666', baseId: 'UNIT_C', preference: 'keep', updatedAt: '2026-08-18T10:20:00Z',
          },
        },
      };
    },
  };
}

test('integration report merges Discord and web preferences with canonical officer precedence', async () => {
  const service = createGuildIntegrationReportService({
    store: storeFixture(),
    operations: operationsFixture(),
    delivery: { async resolveBinding(id) { assert.equal(id, guildId); return { discordGuildId: '987654321098765432' }; } },
    stateStore: stateFixture(),
    env: { DISCORD_BOT_TOKEN: 'server-secret-never-returned', DISCORD_TB_DELIVERY_ENABLED: 'true' },
  });

  const result = await service.report('user-1', '732764286');
  assert.equal(result.source, 'guild-integration-intelligence-v1');
  assert.equal(result.discord.bound, true);
  assert.equal(result.discord.durableState, true);
  assert.equal(result.discord.botConfigured, true);
  assert.equal(result.discord.deliveryEnabled, true);
  assert.equal(result.discord.linkedMemberCount, 2);
  assert.equal(result.discord.unlinkedMemberCount, 0);
  assert.equal(result.destinations.verified, 1);
  assert.equal(result.schedules.active, 2);
  assert.equal(result.schedules.paused, 1);
  assert.equal(result.schedules.inFlight, 1);
  assert.equal(result.schedules.errors, 1);
  assert.equal(result.delivery.delivered, 1);
  assert.equal(result.delivery.failed, 1);

  assert.equal(result.donations.memberCount, 2);
  assert.equal(result.donations.overrideCount, 3);
  assert.equal(result.donations.giveCount, 2);
  assert.equal(result.donations.keepCount, 1);

  const alpha = result.donations.members.find((row) => row.name === 'Alpha');
  assert.equal(alpha.give, 2);
  assert.equal(alpha.keep, 0);
  const unitA = alpha.units.find((row) => row.baseId === 'UNIT_A');
  assert.equal(unitA.preference, 'give');
  assert.equal(unitA.source, 'command-center-web');
  assert.deepEqual(alpha.sources, ['command-center-web', 'discord-player']);

  assert.equal('botToken' in result.discord, false);
  assert.doesNotMatch(JSON.stringify(result), /server-secret-never-returned/);
});

test('integration report still returns canonical intelligence when durable Discord state is unavailable', async () => {
  const service = createGuildIntegrationReportService({
    store: storeFixture(),
    operations: operationsFixture(),
    delivery: { async resolveBinding() { throw new Error('should not run without durable state'); } },
    stateStore: { status: () => ({ enabled: false, durable: false }) },
    env: {},
  });

  const result = await service.report('user-1', '732764286');
  assert.equal(result.discord.bound, false);
  assert.equal(result.discord.durableState, false);
  assert.equal(result.discord.linkedMemberCount, 0);
  assert.equal(result.donations.overrideCount, 1);
  assert.equal(result.donations.giveCount, 1);
  assert.equal(result.donations.keepCount, 0);
});
