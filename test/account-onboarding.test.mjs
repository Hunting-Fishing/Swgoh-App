import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountOnboarding } from '../account-onboarding.mjs';

const USER_A = '0f4c45c0-b8f6-4b22-aad7-56ad6390b010';
const USER_B = 'b487b586-cd7f-47de-8317-f37706152010';
const PLAYER_A = '11111111-1111-4111-8111-111111111111';
const PLAYER_B = '22222222-2222-4222-8222-222222222222';
const GUILD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function matches(row, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (['select', 'limit', 'order'].includes(key)) continue;
    const text = String(value || '');
    if (text.startsWith('eq.') && String(row[key]) !== text.slice(3)) return false;
    if (text.startsWith('neq.') && String(row[key]) === text.slice(4)) return false;
  }
  return true;
}

function createMemoryStore(seed = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  const calls = [];
  const ensure = (table) => (tables[table] ||= []);
  const conflictKeys = {
    guilds: ['swgoh_guild_id'],
    players: ['ally_code'],
    user_player_links: ['user_id', 'player_id'],
    guild_user_memberships: ['guild_id', 'user_id'],
  };

  return {
    calls,
    tables,
    status() { return { configured: true }; },
    async select(table, query = {}) {
      calls.push({ op: 'select', table, query });
      return ensure(table).filter((row) => matches(row, query)).map((row) => structuredClone(row));
    },
    async upsert(table, rows, options = {}) {
      calls.push({ op: 'upsert', table, rows: structuredClone(rows), options });
      const target = ensure(table);
      const keys = options.onConflict ? options.onConflict.split(',') : (conflictKeys[table] || []);
      const output = [];
      for (const input of rows) {
        const row = structuredClone(input);
        let existing = keys.length ? target.find((candidate) => keys.every((key) => String(candidate[key]) === String(row[key]))) : null;
        if (existing) Object.assign(existing, row);
        else {
          if (!row.id && table === 'guilds') row.id = GUILD_ID;
          if (!row.id && table === 'players') row.id = PLAYER_A;
          target.push(row);
          existing = row;
        }
        output.push(structuredClone(existing));
      }
      return options.returning === false ? null : output;
    },
  };
}

function liveGuild(ally = '123456789') {
  return {
    source: 'live',
    guild: { id: 'swgoh-guild-1', name: 'Test Guild', memberCount: 2, galacticPower: 20000000 },
    members: [
      {
        playerId: 'swgoh-player-a',
        allyCode: ally,
        name: 'Alpha',
        rosterAvailable: true,
        units: [
          { baseId: 'UNIT_A', unitType: 'Character', power: 20000 },
          { baseId: 'SHIP_A', unitType: 'Ship', power: 30000 },
        ],
      },
      {
        playerId: 'swgoh-player-b',
        allyCode: '987654321',
        name: 'Bravo',
        rosterAvailable: true,
        units: [{ baseId: 'UNIT_B', unitType: 'Character', power: 15000 }],
      },
    ],
  };
}

function service({ userId = USER_A, store, guildBody = liveGuild() } = {}) {
  return createAccountOnboarding({
    session: { async currentUser() { return { id: userId, email: `${userId}@example.test` }; } },
    store,
    guildService: { async getGuildRoster() { return { value: guildBody, cache: 'fresh', ageMs: 0 }; } },
    now: () => new Date('2026-08-17T04:00:00Z'),
  });
}

test('pending link stores only canonical identity plus pending user/guild relationship', async () => {
  const store = createMemoryStore();
  const onboarding = service({ store });
  const result = await onboarding.requestPlayerLink({ id: USER_A }, '123456789');

  assert.equal(result.status, 'pending');
  assert.equal(store.tables.guilds.length, 1);
  assert.equal(store.tables.players.length, 1);
  assert.equal(store.tables.user_player_links.length, 1);
  assert.equal(store.tables.user_player_links[0].user_id, USER_A);
  assert.equal(store.tables.user_player_links[0].verification_status, 'pending');
  assert.equal(store.tables.guild_user_memberships[0].status, 'pending');
  assert.equal(store.tables.guild_user_memberships[0].user_id, USER_A);
  assert.equal(store.calls.some((call) => call.table === 'player_units_current'), false);
  assert.equal(store.calls.some((call) => call.table === 'guild_members_current'), false);
  assert.equal(store.calls.some((call) => call.table === 'guild_snapshots'), false);
});

test('account status filters every private relationship by the signed-in user id', async () => {
  const store = createMemoryStore({
    players: [
      { id: PLAYER_A, ally_code: '123456789', name: 'Alpha' },
      { id: PLAYER_B, ally_code: '987654321', name: 'Bravo' },
    ],
    guilds: [{ id: GUILD_ID, swgoh_guild_id: 'swgoh-guild-1', name: 'Test Guild' }],
    user_player_links: [
      { user_id: USER_A, player_id: PLAYER_A, verification_status: 'pending', created_at: '2026-08-17T04:00:00Z' },
      { user_id: USER_B, player_id: PLAYER_B, verification_status: 'verified', created_at: '2026-08-17T04:00:00Z' },
    ],
    guild_user_memberships: [
      { guild_id: GUILD_ID, user_id: USER_A, player_id: PLAYER_A, role: 'member', status: 'pending', created_at: '2026-08-17T04:00:00Z' },
      { guild_id: GUILD_ID, user_id: USER_B, player_id: PLAYER_B, role: 'officer', status: 'active', created_at: '2026-08-17T04:00:00Z' },
    ],
  });

  const status = await service({ store }).userStatus(store, USER_A);
  assert.equal(status.playerLinks.length, 1);
  assert.equal(status.playerLinks[0].player_id, PLAYER_A);
  assert.equal(status.guildMemberships.length, 1);
  assert.equal(status.guildMemberships[0].player_id, PLAYER_A);
  assert.equal(JSON.stringify(status).includes(PLAYER_B), false);
  assert.equal(JSON.stringify(status).includes('officer'), false);

  const privateQueries = store.calls.filter((call) => ['user_player_links', 'guild_user_memberships'].includes(call.table));
  assert.ok(privateQueries.length >= 2);
  assert.ok(privateQueries.every((call) => call.query.user_id === `eq.${USER_A}`));
});

test('a player already verified to another user cannot be claimed', async () => {
  const store = createMemoryStore({
    user_player_links: [{ user_id: USER_B, player_id: PLAYER_A, verification_status: 'verified' }],
  });
  const onboarding = service({ store });

  await assert.rejects(
    () => onboarding.requestPlayerLink({ id: USER_A }, '123456789'),
    (error) => error?.status === 409 && error?.code === 'PLAYER_ALREADY_VERIFIED',
  );

  const newLink = store.tables.user_player_links.find((row) => row.user_id === USER_A);
  assert.equal(newLink, undefined);
});

test('one Command Center account cannot open multiple simultaneous primary player claims', async () => {
  const store = createMemoryStore({
    user_player_links: [{ user_id: USER_A, player_id: PLAYER_B, verification_status: 'pending' }],
  });
  const onboarding = service({ store });
  await assert.rejects(
    () => onboarding.requestPlayerLink({ id: USER_A }, '123456789'),
    (error) => error?.status === 409 && error?.code === 'USER_ALREADY_HAS_PLAYER_LINK',
  );
});
