import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDiscordPlayerLifecycleCommand } from '../discord-player-lifecycle-command.mjs';

const GUILD = '123456789012345678';
const USER = '223456789012345678';
const PLAYER_UUID = '11111111-1111-4111-8111-111111111111';
const GUILD_UUID = '284efcdb-01ef-4ae9-989a-ca6a94952df4';

function interaction(subcommand, options = []) {
  return {
    guild_id: GUILD,
    member: { user: { id: USER } },
    data: { name: 'tb', options: [{ type: 1, name: subcommand, options }] },
  };
}

function fixture({ linked = true, seedGuildId = GUILD_UUID } = {}) {
  const writes = [];
  const unlinks = [];
  const guildState = {
    swgohAllyCode: '732764286',
    userLinks: linked ? { [USER]: { discordUserId: USER, swgohAllyCode: '732764286', playerId: 'swgoh-warm' } } : {},
  };
  const stateStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() { return guildState; },
    async unlinkPlayer(input) { unlinks.push(input); const previous = guildState.userLinks[USER]; delete guildState.userLinks[USER]; return previous; },
  };
  let selectCount = 0;
  const store = {
    async select(table) {
      if (table !== 'players') return [];
      selectCount += 1;
      if (selectCount === 1) return [{ id: PLAYER_UUID, ally_code: '732764286', swgoh_player_id: 'swgoh-warm', name: 'Warm Bacon', current_guild_id: GUILD_UUID }];
      return [{ id: PLAYER_UUID, current_guild_id: seedGuildId }];
    },
    async upsert(table, rows) { writes.push({ table, row: rows[0] }); return rows; },
  };
  return { stateStore, store, writes, unlinks };
}

test('/tb ignore writes only the invoking linked player to shared Guild Operations controls', async () => {
  const f = fixture();
  const result = await executeDiscordPlayerLifecycleCommand(interaction('ignore', [
    { type: 4, name: 'days', value: 2 },
    { type: 3, name: 'reason', value: 'Vacation' },
  ]), f);
  assert.match(result, /Your Timed Ignore/);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].table, 'guild_member_operation_controls');
  assert.equal(f.writes[0].row.guild_id, GUILD_UUID);
  assert.equal(f.writes[0].row.player_id, PLAYER_UUID);
  assert.equal(f.writes[0].row.available, true);
  assert.equal(f.writes[0].row.source, 'discord-player-self-service');
  assert.ok(Date.parse(f.writes[0].row.ignored_until) > Date.now());
});

test('/tb ignore days=0 clears only the invoking player timed ignore', async () => {
  const f = fixture();
  const result = await executeDiscordPlayerLifecycleCommand(interaction('ignore', [{ type: 4, name: 'days', value: 0 }]), f);
  assert.match(result, /Your Ignore Cleared/);
  assert.equal(f.writes[0].row.ignored_until, null);
  assert.equal(f.writes[0].row.ignore_reason, null);
});

test('/tb unregister removes only the invoking Discord player link', async () => {
  const f = fixture();
  const result = await executeDiscordPlayerLifecycleCommand(interaction('unregister'), f);
  assert.match(result, /Player Unregistered/);
  assert.equal(f.unlinks.length, 1);
  assert.equal(f.unlinks[0].discordGuildId, GUILD);
  assert.equal(f.unlinks[0].discordUserId, USER);
  assert.equal(f.unlinks[0].actorDiscordUserId, USER);
});

test('self-service lifecycle rejects Discord users without a durable player link', async () => {
  const f = fixture({ linked: false });
  await assert.rejects(executeDiscordPlayerLifecycleCommand(interaction('ignore', [{ type: 4, name: 'days', value: 1 }]), f), /not linked to a SWGOH player/);
  assert.equal(f.writes.length, 0);
});

test('self-service lifecycle rejects a player that no longer belongs to the bound Guild', async () => {
  const f = fixture({ seedGuildId: '99999999-9999-4999-8999-999999999999' });
  await assert.rejects(executeDiscordPlayerLifecycleCommand(interaction('unregister'), f), /no longer in the SWGOH Guild bound to this Discord server/);
  assert.equal(f.unlinks.length, 0);
});
