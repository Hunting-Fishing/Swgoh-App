import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildDiscordAdminService } from '../guild-discord-admin-service.mjs';

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
  };
}

function fixture(overrides = {}) {
  const writes = [];
  const links = [];
  const operations = {
    async requireOfficer(userId, code) {
      return { userId, code, guild: { id: 'guild-1' }, membership: { player_id: 'player-actor' } };
    },
  };
  const delivery = {
    async resolveBinding() { return { discordGuildId: '123456789012345678', guildState: {} }; },
  };
  const stateStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() { return { userLinks: {} }; },
    async linkPlayer(input) { links.push(input); return input; },
  };
  const canonical = {
    async getGuildRosterByPlayer() {
      return {
        members: [
          { name: 'Warm Bacon', allyCode: '732764286', playerId: 'p-warm' },
          { name: 'Darth Revan', allyCode: '111222333', playerId: 'p-revan' },
          { name: 'Darth Revan', allyCode: '444555666', playerId: 'p-revan-2' },
        ],
      };
    },
  };
  const store = {
    status() { return { configured: true }; },
    async select(table) {
      if (table === 'guild_members_current') return [{ player_id: 'p-warm' }, { player_id: 'p-revan' }, { player_id: 'p-revan-2' }];
      if (table === 'guild_discord_destinations') return [];
      return [];
    },
    async upsert(_table, rows) { writes.push(...rows); return rows; },
    async update() { return []; },
  };
  return {
    writes,
    links,
    service: createGuildDiscordAdminService({
      store,
      operations,
      delivery,
      stateStore,
      canonical,
      env: { DISCORD_BOT_TOKEN: 'server-secret-token' },
      ...overrides,
    }),
  };
}

test('verified delivery channel must belong to the Discord Guild bound to the SWGOH Guild', async () => {
  const { service, writes } = fixture({
    fetch: async () => response({ id: '999999999999999999', guild_id: '999999999999999998', type: 0, name: 'wrong-server' }),
  });
  await assert.rejects(
    service.verifyChannel('user-1', '732764286', '999999999999999999'),
    (error) => error?.code === 'CHANNEL_GUILD_MISMATCH',
  );
  assert.equal(writes.length, 0);
});

test('verified delivery channel is persisted only after Discord confirms bound-Guild ownership', async () => {
  const { service, writes } = fixture({
    fetch: async () => response({ id: '999999999999999999', guild_id: '123456789012345678', type: 0, name: 'rote-assignments' }),
  });
  const result = await service.verifyChannel('user-1', '732764286', '999999999999999999');
  assert.equal(result.verified, true);
  assert.equal(result.displayName, 'rote-assignments');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].external_id, '999999999999999999');
  assert.equal(writes[0].metadata.verification, 'discord-api-channel-ownership');
});

test('Guild-mate matcher auto-eligibility requires one exact normalized roster-name match', async () => {
  const discordMembers = [
    { nick: 'Warm-Bacon', user: { id: '200000000000000001', username: 'warm', global_name: 'Warm Bacon', bot: false } },
    { nick: 'Darth Revan', user: { id: '200000000000000002', username: 'revan', global_name: 'Darth Revan', bot: false } },
    { nick: 'Warm Baconn', user: { id: '200000000000000003', username: 'typo', global_name: 'Warm Baconn', bot: false } },
  ];
  const { service, links } = fixture({ fetch: async () => response(discordMembers) });
  const preview = await service.matchGuildmates('user-1', '732764286', { apply: false });
  assert.equal(preview.exact.length, 1);
  assert.equal(preview.exact[0].allyCode, '732764286');
  assert.equal(preview.ambiguous.length, 1, 'duplicate exact SWGOH names must remain ambiguous');
  assert.equal(preview.unmatchedCount, 1, 'near/fuzzy name must not qualify');
  assert.equal(links.length, 0, 'preview must never mutate links');
});

test('apply mode links only the exact unique preview matches', async () => {
  const discordMembers = [
    { nick: 'Warm Bacon', user: { id: '200000000000000001', username: 'warm', global_name: 'Warm Bacon', bot: false } },
    { nick: 'Warm Baconn', user: { id: '200000000000000003', username: 'typo', global_name: 'Warm Baconn', bot: false } },
  ];
  const { service, links } = fixture({ fetch: async () => response(discordMembers) });
  const result = await service.matchGuildmates('user-1', '732764286', { apply: true });
  assert.equal(result.applied.length, 1);
  assert.equal(links.length, 1);
  assert.equal(links[0].swgohAllyCode, '732764286');
  assert.equal(links[0].discordUserId, '200000000000000001');
});
