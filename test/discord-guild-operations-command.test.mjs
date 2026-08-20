import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDiscordGuildCommand } from '../discord-guild-operations-command.mjs';

const DISCORD_GUILD = '123456789012345678';
const CHANNEL = '223456789012345678';
const ACTOR = '323456789012345678';
const TARGET = '423456789012345678';
const GUILD_UUID = '284efcdb-01ef-4ae9-989a-ca6a94952df4';

function interaction(subcommand, options = [], extra = {}) {
  return {
    application_id: '523456789012345678',
    guild_id: DISCORD_GUILD,
    channel_id: CHANNEL,
    member: { user: { id: ACTOR } },
    data: { name: 'guild', options: [{ type: 1, name: subcommand, options }] },
    ...extra,
  };
}

function fixture({ discordMembers = [] } = {}) {
  const writes = [];
  const updates = [];
  const links = [];
  const guildState = {
    discordGuildId: DISCORD_GUILD,
    swgohAllyCode: '732764286',
    commandChannelId: CHANNEL,
    userLinks: {
      [ACTOR]: { discordUserId: ACTOR, swgohAllyCode: '732764286', playerId: 'swgoh-warm' },
    },
  };
  const roster = {
    fetchedAt: '2026-08-18T00:00:00Z',
    guild: { persistentId: GUILD_UUID, name: 'Ludus Venatus', galacticPower: 500000000 },
    members: [
      { persistentId: '11111111-1111-4111-8111-111111111111', playerId: 'swgoh-warm', allyCode: '732764286', name: 'Warm Bacon' },
      { persistentId: '22222222-2222-4222-8222-222222222222', playerId: 'swgoh-revan-1', allyCode: '111222333', name: 'Darth Revan' },
      { persistentId: '33333333-3333-4333-8333-333333333333', playerId: 'swgoh-revan-2', allyCode: '444555666', name: 'Darth Revan' },
    ],
  };
  const store = {
    status() { return { configured: true }; },
    async select(table, query = {}) {
      if (table === 'players' && String(query.ally_code || '').includes('732764286')) return [{ id: 'seed-player', ally_code: '732764286', current_guild_id: GUILD_UUID }];
      if (table === 'guilds') return [{ id: GUILD_UUID, name: 'Ludus Venatus', member_count: 3, galactic_power: 500000000, last_synced_at: '2026-08-18T00:00:00Z' }];
      if (table === 'guild_discord_destinations') return [];
      if (table === 'guild_member_operation_controls') return [];
      return [];
    },
    async upsert(table, rows) { writes.push({ table, row: rows[0] }); return [{ id: 'destination-1', ...rows[0] }]; },
    async update(table, filter, patch) { updates.push({ table, filter, patch }); return []; },
  };
  const stateStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() { return guildState; },
    async linkPlayer(input) { links.push(input); guildState.userLinks[input.discordUserId] = input; return input; },
  };
  const canonical = { async getGuildRosterByPlayer() { return roster; } };
  const fetch = async (url) => {
    if (String(url).includes('/guilds/') && String(url).includes('/members')) {
      return { ok: true, status: 200, async text() { return JSON.stringify(discordMembers); } };
    }
    return { ok: true, status: 200, async text() { return JSON.stringify({ id: CHANNEL, guild_id: DISCORD_GUILD, type: 0, name: 'rote-assignments' }); } };
  };
  return { store, stateStore, canonical, fetch, writes, updates, links, guildState, roster };
}

const config = { botToken: 'server-secret', redundancyTarget: 2 };

test('/guild verify-channel persists only a channel Discord confirms belongs to the bound server', async () => {
  const f = fixture();
  const result = await executeDiscordGuildCommand(interaction('verify-channel'), config, f);
  assert.match(result, /Channel Verified/);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].table, 'guild_discord_destinations');
  assert.equal(f.writes[0].row.external_id, CHANNEL);
  assert.equal(f.writes[0].row.verified, true);
  assert.equal(f.writes[0].row.metadata.discordGuildId, DISCORD_GUILD);
});

test('/guild verify-channel rejects a channel from another Discord server', async () => {
  const f = fixture();
  f.fetch = async () => ({ ok: true, status: 200, async text() { return JSON.stringify({ id: CHANNEL, guild_id: '999999999999999999', type: 0, name: 'wrong' }); } });
  await assert.rejects(executeDiscordGuildCommand(interaction('verify-channel'), config, f), /does not belong to this bound server/);
  assert.equal(f.writes.length, 0);
});

test('/guild register-mates previews exact unique names but never fuzzy or duplicate-name matches', async () => {
  const f = fixture({ discordMembers: [
    { nick: 'Darth Revan', user: { id: TARGET, username: 'revan', global_name: 'Darth Revan', bot: false } },
    { nick: 'Warm Baconn', user: { id: '623456789012345678', username: 'typo', global_name: 'Warm Baconn', bot: false } },
  ] });
  const result = await executeDiscordGuildCommand(interaction('register-mates', [{ type: 3, name: 'action', value: 'preview' }]), config, f);
  assert.match(result, /Guild roster: \*\*3\*\* · linked: \*\*1\*\* · unlinked: \*\*2\*\*/);
  assert.match(result, /Discord humans scanned: \*\*2\*\*/);
  assert.match(result, /available to match: \*\*2\*\*/);
  assert.match(result, /ambiguous: \*\*1\*\*/i);
  assert.match(result, /unmatched Discord: \*\*1\*\*/i);
  assert.match(result, /Guild mention-link coverage: \*\*1\/3 \(33%\)\*\*/);
  assert.equal(f.links.length, 0, 'preview must not mutate player links');
});

test('/guild register-mates explains linked-only Discord inventory instead of misleading 0/0/0', async () => {
  const f = fixture({ discordMembers: [
    { nick: 'Warm Bacon', user: { id: ACTOR, username: 'warmbacon', global_name: 'Warm Bacon', bot: false } },
    { nick: null, user: { id: '723456789012345678', username: 'some-bot', global_name: null, bot: true } },
  ] });
  const result = await executeDiscordGuildCommand(interaction('register-mates', [{ type: 3, name: 'action', value: 'preview' }]), config, f);
  assert.match(result, /Discord humans scanned: \*\*1\*\* · already linked here: \*\*1\*\* · available to match: \*\*0\*\* · bots skipped: \*\*1\*\*/);
  assert.match(result, /2 SWGOH Guild members remain unlinked/);
  assert.match(result, /\/tb link member:<Discord user> ally_code:<Ally Code>/);
  assert.match(result, /SWGOH members still unlinked/);
  assert.equal(f.links.length, 0);
});

test('/guild register-mates apply links only a single exact unique match', async () => {
  const f = fixture({ discordMembers: [
    { nick: 'New Pilot', user: { id: TARGET, username: 'newpilot', global_name: 'New Pilot', bot: false } },
  ] });
  f.roster.members.push({ persistentId: '44444444-4444-4444-8444-444444444444', playerId: 'swgoh-new', allyCode: '777888999', name: 'New Pilot' });
  const result = await executeDiscordGuildCommand(interaction('register-mates', [{ type: 3, name: 'action', value: 'apply' }]), config, f);
  assert.match(result, /applied: \*\*1\*\*/i);
  assert.match(result, /Guild roster: \*\*4\*\* · linked: \*\*2\*\* · unlinked: \*\*2\*\*/);
  assert.equal(f.links.length, 1);
  assert.equal(f.links[0].swgohAllyCode, '777888999');
});

test('/guild register-mates reports Server Members Intent requirement on Discord 403', async () => {
  const f = fixture();
  f.fetch = async (url) => {
    if (String(url).includes('/guilds/') && String(url).includes('/members')) {
      return { ok: false, status: 403, async text() { return JSON.stringify({ message: 'Missing Access', code: 50001 }); } };
    }
    return { ok: true, status: 200, async text() { return '{}'; } };
  };
  await assert.rejects(
    executeDiscordGuildCommand(interaction('register-mates', [{ type: 3, name: 'action', value: 'preview' }]), config, f),
    /SERVER MEMBERS INTENT/,
  );
});

test('/guild ignore persists a shared timed Operations exclusion and days=0 clears it', async () => {
  const f = fixture();
  const setResult = await executeDiscordGuildCommand(interaction('ignore', [{ type: 4, name: 'days', value: 3 }]), config, f);
  assert.match(setResult, /Timed Ignore Set/);
  const setWrite = f.writes.at(-1);
  assert.equal(setWrite.table, 'guild_member_operation_controls');
  assert.equal(setWrite.row.player_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(setWrite.row.available, true);
  assert.ok(Date.parse(setWrite.row.ignored_until) > Date.now());

  const clearResult = await executeDiscordGuildCommand(interaction('ignore', [{ type: 4, name: 'days', value: 0 }]), config, f);
  assert.match(clearResult, /Ignore Cleared/);
  assert.equal(f.writes.at(-1).row.ignored_until, null);
});

test('/guild platoon-report uses the mission-safe live planner and formats shortages', async () => {
  const f = fixture();
  f.live = {
    async buildPlan() {
      return {
        guild: { guild: { name: 'Ludus Venatus' } },
        plan: { assignments: [{ phase: 'P1' }], unfilled: [{ phase: 'P2', name: 'Probe Droid', squadId: 'Op 3' }] },
        safety: { summary: { protectedUnits: 12 } },
        planningControls: { preferenceCount: 4, unavailableMemberCount: 2, hardReservationCount: 1 },
      };
    },
  };
  const result = await executeDiscordGuildCommand(interaction('platoon-report'), config, f);
  assert.match(result, /Platoon Report/);
  assert.match(result, /Unfilled: \*\*1\*\*/);
  assert.match(result, /Probe Droid/);
  assert.match(result, /Mission protections and hard reserves remain authoritative/);
});
