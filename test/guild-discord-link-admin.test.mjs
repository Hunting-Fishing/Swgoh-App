import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildDiscordLinkAdminService } from '../guild-discord-link-admin-service.mjs';

const guildId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const discordGuildId = '987654321098765432';
const user1 = '700000000000000001';
const user2 = '700000000000000002';
const user3 = '700000000000000003';

function discordResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } };
}
function operationsFixture() {
  return {
    async requireOfficer(userId, allyCode) {
      assert.equal(userId, 'web-officer');
      assert.equal(allyCode, '732764286');
      return { userId, code: allyCode, role: 'officer', guild: { id: guildId, name: 'Ludus Venatus' } };
    },
  };
}

function serviceFixture(overrides = {}) {
  const writes = { links: [], unlinks: [], audits: [] };
  const auditInsertFails = overrides.auditInsertFails === true;
  const players = [
    { id: 'db-alpha', ally_code: '111222333', swgoh_player_id: 'live-alpha', name: 'Alpha', current_guild_id: guildId },
    { id: 'db-bravo', ally_code: '444555666', swgoh_player_id: 'live-bravo', name: 'Bravo', current_guild_id: guildId },
  ];
  const state = {
    commandChannelId: '123456789012345678',
    userLinks: {
      [user1]: { discordUserId: user1, swgohAllyCode: '111222333', playerId: 'live-alpha', linkedAt: '2026-08-17T00:00:00Z', updatedAt: '2026-08-17T00:00:00Z' },
      [user2]: { discordUserId: user2, swgohAllyCode: '999888777', playerId: 'former-player', linkedAt: '2026-08-17T00:00:00Z', updatedAt: '2026-08-17T00:00:00Z' },
      [user3]: { discordUserId: user3, swgohAllyCode: '444555666', playerId: 'live-bravo', linkedAt: '2026-08-17T00:00:00Z', updatedAt: '2026-08-17T00:00:00Z' },
    },
  };
  const store = {
    async select(table, query = {}) {
      if (table === 'players') {
        if (String(query.ally_code || '').startsWith('eq.')) {
          const code = String(query.ally_code).slice(3);
          return players.filter((row) => row.ally_code === code && String(query.current_guild_id || '') === `eq.${guildId}`);
        }
        return players;
      }
      if (table === 'guild_members_current') {
        const target = String(query.player_id || '').replace(/^eq\./, '');
        if (!target) return players.map((row) => ({ player_id: row.id }));
        return players.some((row) => row.id === target) ? [{ player_id: target }] : [];
      }
      return [];
    },
    async insert(table, rows) {
      if (table === 'guild_operations_audit_log') {
        if (auditInsertFails) throw new Error('secondary audit unavailable');
        writes.audits.push(...rows);
      }
      return rows;
    },
  };
  const stateStore = {
    status: () => ({ enabled: true, durable: true }),
    async readGuild(id) { assert.equal(id, discordGuildId); return structuredClone(state); },
    async linkPlayer(input) {
      writes.links.push(input);
      const row = { discordUserId: input.discordUserId, swgohAllyCode: input.swgohAllyCode, playerId: input.playerId, linkedAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' };
      state.userLinks[input.discordUserId] = row;
      return row;
    },
    async unlinkPlayer(input) {
      writes.unlinks.push(input);
      const previous = state.userLinks[input.discordUserId];
      delete state.userLinks[input.discordUserId];
      return previous;
    },
  };
  const defaultFetch = async (url) => {
    const target = String(url);
    if (target.includes(`/guilds/${discordGuildId}/members?`)) {
      return discordResponse([
        { nick: 'Alpha Discord', user: { id: user1, username: 'alpha', bot: false } },
      ]);
    }
    if (target.endsWith(`/guilds/${discordGuildId}/members/${user2}`)) {
      return discordResponse({ nick: 'Manual Member', user: { id: user2, username: 'manual', bot: false } });
    }
    throw new Error(`Unexpected fetch ${target}`);
  };
  return {
    writes,
    service: createGuildDiscordLinkAdminService({
      store,
      operations: operationsFixture(),
      delivery: { async resolveBinding(id) { assert.equal(id, guildId); return { discordGuildId }; } },
      stateStore,
      env: { DISCORD_BOT_TOKEN: 'server-secret' },
      fetch: defaultFetch,
      now: () => new Date('2026-08-18T13:00:00Z'),
      ...overrides,
      store,
    }),
  };
}

test('link inventory marks former SWGOH and former Discord members stale without guessing when checks succeed', async () => {
  const { service } = serviceFixture();
  const result = await service.list('web-officer', '732764286');
  assert.equal(result.discordMembershipChecked, true);
  assert.equal(result.total, 3);
  assert.equal(result.current, 1);
  assert.equal(result.stale, 2);
  assert.equal(result.swgohMissing, 1);
  assert.equal(result.discordMissing, 2);
  assert.equal(result.unlinkedCurrentMembers, 0);
  const alpha = result.links.find((row) => row.discordUserId === user1);
  assert.equal(alpha.stale, false);
  assert.equal(alpha.discordDisplayName, 'Alpha Discord');
  const former = result.links.find((row) => row.discordUserId === user2);
  assert.equal(former.currentGuildMember, false);
  assert.match(former.staleReasons.join(' '), /no longer a current Guild member/);
  const bravo = result.links.find((row) => row.discordUserId === user3);
  assert.equal(bravo.currentGuildMember, true);
  assert.equal(bravo.discordMemberPresent, false);
});

test('manual link requires both a current canonical Guild player and current Discord server membership', async () => {
  const { service, writes } = serviceFixture();
  const result = await service.link('web-officer', '732764286', { discordUserId: user2, swgohAllyCode: '444555666' });
  assert.equal(result.currentGuildMember, true);
  assert.equal(result.discordMemberPresent, true);
  assert.equal(result.swgohAllyCode, '444555666');
  assert.equal(result.playerName, 'Bravo');
  assert.equal(result.auditRecorded, true);
  assert.equal(result.durableAuditRecorded, true);
  assert.equal(writes.links.length, 1);
  assert.equal(writes.links[0].playerId, 'live-bravo');
  assert.equal(writes.links[0].actorDiscordUserId, '');
  assert.equal(writes.audits.at(-1).actor_user_id, 'web-officer');
  assert.equal(writes.audits.at(-1).action, 'discord-player-link.manual');
});

test('manual link refuses an Ally Code outside the current canonical Guild before Discord mutation', async () => {
  let fetchCalls = 0;
  const { service, writes } = serviceFixture({ fetch: async () => { fetchCalls += 1; return discordResponse({}); } });
  await assert.rejects(
    service.link('web-officer', '732764286', { discordUserId: user2, swgohAllyCode: '999888777' }),
    (error) => error?.code === 'PLAYER_NOT_CURRENT_GUILD_MEMBER',
  );
  assert.equal(fetchCalls, 0);
  assert.equal(writes.links.length, 0);
});

test('manual link refuses a Discord account that is not in the bound server', async () => {
  const { service, writes } = serviceFixture({ fetch: async () => discordResponse({ message: 'Unknown Member' }, 404) });
  await assert.rejects(
    service.link('web-officer', '732764286', { discordUserId: user2, swgohAllyCode: '444555666' }),
    (error) => error?.code === 'DISCORD_MEMBER_NOT_FOUND',
  );
  assert.equal(writes.links.length, 0);
});

test('manual unlink uses durable unlink semantics and records the web officer audit without deleting Guild history', async () => {
  const { service, writes } = serviceFixture();
  const result = await service.unlink('web-officer', '732764286', { discordUserId: user1 });
  assert.equal(result.removed, true);
  assert.equal(result.swgohAllyCode, '111222333');
  assert.equal(result.auditRecorded, true);
  assert.equal(result.durableAuditRecorded, true);
  assert.equal(writes.unlinks.length, 1);
  assert.equal(writes.audits.at(-1).action, 'discord-player-link.manual-unlink');
  assert.equal(writes.audits.at(-1).entity_type, 'discord_player_link');
});

test('secondary Supabase audit failure never reports a completed durable link as failed', async () => {
  const { service, writes } = serviceFixture({ auditInsertFails: true });
  const result = await service.link('web-officer', '732764286', { discordUserId: user2, swgohAllyCode: '444555666' });
  assert.equal(writes.links.length, 1, 'durable state mutation completed');
  assert.equal(result.currentGuildMember, true);
  assert.equal(result.auditRecorded, false);
  assert.equal(result.durableAuditRecorded, true);
});

test('link inventory does not falsely mark Discord presence stale when bot membership lookup is unavailable', async () => {
  const { service } = serviceFixture({ env: {} });
  const result = await service.list('web-officer', '732764286');
  assert.equal(result.discordMembershipChecked, false);
  const alpha = result.links.find((row) => row.discordUserId === user1);
  assert.equal(alpha.discordMemberPresent, null);
  assert.equal(alpha.stale, false);
  const bravo = result.links.find((row) => row.discordUserId === user3);
  assert.equal(bravo.discordMemberPresent, null);
  assert.equal(bravo.stale, false);
});
