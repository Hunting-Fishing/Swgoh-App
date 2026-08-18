import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDiscordGuildCommand } from '../discord-guild-operations-command.mjs';

const DISCORD_GUILD = '123456789012345678';
const ACTOR = '223456789012345678';
const GUILD_UUID = '284efcdb-01ef-4ae9-989a-ca6a94952df4';
const PLAYER_UUID = '11111111-1111-4111-8111-111111111111';

function interaction() {
  return {
    guild_id: DISCORD_GUILD,
    member: { user: { id: ACTOR } },
    data: { name: 'guild', options: [{ type: 1, name: 'donation-report', options: [] }] },
  };
}

test('/guild donation-report merges canonical and Discord GIVE/KEEP rows without double counting member/unit pairs', async () => {
  const guildState = {
    swgohAllyCode: '732764286',
    userLinks: {
      [ACTOR]: { discordUserId: ACTOR, swgohAllyCode: '732764286', playerId: 'swgoh-warm' },
    },
    memberPreferences: {
      [`${ACTOR}|UNIT_A`]: { discordUserId: ACTOR, swgohAllyCode: '732764286', baseId: 'UNIT_A', preference: 'give' },
      [`${ACTOR}|UNIT_B`]: { discordUserId: ACTOR, swgohAllyCode: '732764286', baseId: 'UNIT_B', preference: 'keep' },
    },
  };
  const stateStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() { return guildState; },
  };
  const store = {
    async select(table, query = {}) {
      if (table === 'players') return [{ id: PLAYER_UUID, ally_code: '732764286', current_guild_id: GUILD_UUID }];
      if (table === 'guilds') return [{ id: GUILD_UUID, name: 'Ludus Venatus', member_count: 1, galactic_power: 10000000, last_synced_at: '2026-08-18T00:00:00Z' }];
      if (table === 'guild_unit_donation_preferences') {
        return [{ player_id: PLAYER_UUID, base_id: 'UNIT_A', preference: 'give', source: 'command-center-web' }];
      }
      return [];
    },
  };
  const canonical = {
    async getGuildRosterByPlayer() {
      return {
        guild: { name: 'Ludus Venatus' },
        members: [{ persistentId: PLAYER_UUID, playerId: 'swgoh-warm', allyCode: '732764286', name: 'Warm Bacon' }],
      };
    },
  };
  const result = await executeDiscordGuildCommand(interaction(), { botToken: 'secret' }, { store, stateStore, canonical });
  assert.match(result, /Donation Preferences/);
  assert.match(result, /Members with preferences: \*\*1\*\*/);
  assert.match(result, /GIVE: \*\*1\*\*/);
  assert.match(result, /KEEP: \*\*1\*\*/);
  assert.match(result, /Unit overrides: \*\*2\*\*/);
  assert.match(result, /Warm Bacon/);
});
