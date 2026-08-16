import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayerVerification, chooseChallenge } from '../player-verification.mjs';

const USER = '0f4c45c0-b8f6-4b22-aad7-56ad6390b010';
const PLAYER = '11111111-1111-4111-8111-111111111111';
const GUILD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function matches(row, query = {}) {
  for (const [key, raw] of Object.entries(query)) {
    if (['select', 'limit', 'order'].includes(key)) continue;
    const value = String(raw || '');
    if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
  }
  return true;
}

function storeFixture(seed = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  const calls = [];
  const ensure = (table) => (tables[table] ||= []);
  let challengeCounter = 0;
  return {
    tables,
    calls,
    status() { return { configured: true }; },
    async select(table, query = {}) {
      calls.push({ op: 'select', table, query: structuredClone(query) });
      return ensure(table).filter((row) => matches(row, query)).map(structuredClone);
    },
    async insert(table, rows) {
      calls.push({ op: 'insert', table, rows: structuredClone(rows) });
      const output = rows.map((input) => {
        const row = structuredClone(input);
        if (table === 'player_verification_challenges' && !row.id) row.id = `challenge-${++challengeCounter}`;
        ensure(table).push(row);
        return structuredClone(row);
      });
      return output;
    },
    async update(table, query, values) {
      calls.push({ op: 'update', table, query: structuredClone(query), values: structuredClone(values) });
      const changed = [];
      for (const row of ensure(table)) {
        if (!matches(row, query)) continue;
        Object.assign(row, structuredClone(values));
        changed.push(structuredClone(row));
      }
      return changed;
    },
  };
}

function baseSeed() {
  return {
    players: [{
      id: PLAYER,
      ally_code: '123456789',
      swgoh_player_id: 'swgoh-player-1',
      name: 'Alpha',
      current_guild_id: GUILD,
    }],
    user_player_links: [{
      user_id: USER,
      player_id: PLAYER,
      verification_status: 'pending',
      verification_method: 'manual',
      created_at: '2026-08-17T04:00:00Z',
    }],
    guild_user_memberships: [{
      guild_id: GUILD,
      user_id: USER,
      player_id: PLAYER,
      role: 'member',
      status: 'pending',
    }],
    player_verification_challenges: [],
  };
}

function profile(selectedPortrait = 'PORTRAIT_A') {
  return {
    source: 'live',
    player: {
      playerId: 'swgoh-player-1',
      allyCode: '123456789',
      name: 'Alpha',
      selectedTitleId: 'TITLE_A',
      selectedPortraitId: selectedPortrait,
    },
    unlocked: {
      titleIds: ['TITLE_A', 'TITLE_B'],
      portraitIds: ['PORTRAIT_A', 'PORTRAIT_B'],
    },
  };
}

function gatewayFetch(selectedPortraitRef, observed = []) {
  return async (url) => {
    observed.push(url);
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify(profile(selectedPortraitRef.value)); },
    };
  };
}

function service(store, selectedPortraitRef, observed = []) {
  return createPlayerVerification({
    SWGOH_GATEWAY_URL: 'https://gateway.example',
    SWGOH_GATEWAY_API_KEY: 'gateway-secret',
    PLAYER_VERIFICATION_TTL_SECONDS: '900',
  }, {
    session: { async currentUser() { return { id: USER, email: 'alpha@example.test' }; } },
    store,
    fetch: gatewayFetch(selectedPortraitRef, observed),
    now: () => new Date('2026-08-17T04:15:00Z'),
    randomInt: () => 0,
  });
}

test('challenge always chooses an unlocked cosmetic different from the selected value', () => {
  const challenge = chooseChallenge(profile('PORTRAIT_A'), () => 0);
  assert.deepEqual(challenge, {
    type: 'portrait',
    previousValue: 'PORTRAIT_A',
    targetValue: 'PORTRAIT_B',
  });
});

test('starting verification creates a user/player-scoped pending challenge only', async () => {
  const store = storeFixture(baseSeed());
  const selected = { value: 'PORTRAIT_A' };
  const result = await service(store, selected).start({ id: USER });

  assert.equal(result.challenge.status, 'pending');
  assert.equal(result.challenge.type, 'portrait');
  assert.equal(result.challenge.targetValue, 'PORTRAIT_B');
  assert.equal(store.tables.player_verification_challenges.length, 1);
  assert.equal(store.tables.player_verification_challenges[0].user_id, USER);
  assert.equal(store.tables.player_verification_challenges[0].player_id, PLAYER);
  assert.equal(store.tables.user_player_links[0].verification_status, 'pending');
  assert.equal(store.tables.guild_user_memberships[0].status, 'pending');
});

test('wrong live cosmetic selection increments attempts but grants no access', async () => {
  const seed = baseSeed();
  seed.player_verification_challenges.push({
    id: 'challenge-1',
    user_id: USER,
    player_id: PLAYER,
    challenge_type: 'portrait',
    previous_value: 'PORTRAIT_A',
    target_value: 'PORTRAIT_B',
    status: 'pending',
    attempt_count: 0,
    expires_at: '2026-08-17T04:30:00Z',
    created_at: '2026-08-17T04:10:00Z',
  });
  const store = storeFixture(seed);
  const selected = { value: 'PORTRAIT_A' };
  const urls = [];
  const result = await service(store, selected, urls).check({ id: USER });

  assert.equal(result.verified, false);
  assert.equal(store.tables.player_verification_challenges[0].attempt_count, 1);
  assert.equal(store.tables.user_player_links[0].verification_status, 'pending');
  assert.equal(store.tables.guild_user_memberships[0].status, 'pending');
  assert.match(urls[0], /verification-profile\?refresh=1$/);
  assert.equal(store.calls.some((call) => call.op === 'update' && call.table === 'user_player_links'), false);
});

test('correct forced live selection verifies only the signed user link and activates only its pending Guild membership', async () => {
  const seed = baseSeed();
  seed.player_verification_challenges.push({
    id: 'challenge-1',
    user_id: USER,
    player_id: PLAYER,
    challenge_type: 'portrait',
    previous_value: 'PORTRAIT_A',
    target_value: 'PORTRAIT_B',
    status: 'pending',
    attempt_count: 0,
    expires_at: '2026-08-17T04:30:00Z',
    created_at: '2026-08-17T04:10:00Z',
  });
  seed.user_player_links.push({
    user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    player_id: '22222222-2222-4222-8222-222222222222',
    verification_status: 'pending',
    verification_method: 'manual',
  });
  seed.guild_user_memberships.push({
    guild_id: GUILD,
    user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    player_id: '22222222-2222-4222-8222-222222222222',
    role: 'member',
    status: 'pending',
  });

  const store = storeFixture(seed);
  const selected = { value: 'PORTRAIT_B' };
  const result = await service(store, selected).check({ id: USER });

  assert.equal(result.verified, true);
  assert.equal(store.tables.user_player_links[0].verification_status, 'verified');
  assert.equal(store.tables.user_player_links[0].verification_method, 'cosmetic_challenge');
  assert.equal(store.tables.guild_user_memberships[0].status, 'active');
  assert.equal(store.tables.player_verification_challenges[0].status, 'verified');
  assert.equal(store.tables.user_player_links[1].verification_status, 'pending');
  assert.equal(store.tables.guild_user_memberships[1].status, 'pending');

  const sensitiveUpdates = store.calls.filter((call) => call.op === 'update' && ['user_player_links', 'guild_user_memberships'].includes(call.table));
  assert.ok(sensitiveUpdates.length >= 2);
  assert.ok(sensitiveUpdates.every((call) => call.query.user_id === `eq.${USER}`));
  assert.ok(sensitiveUpdates.every((call) => call.query.player_id === `eq.${PLAYER}`));
});
