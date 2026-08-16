import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityFingerprint,
  assertIntegrity,
  createGuildPersistence,
  normalizedMember,
  timestampFromGameValue,
} from '../guild-persistence.mjs';

const USER = '0f4c45c0-b8f6-4b22-aad7-56ad6390b010';
const PLAYER_UUID = '11111111-1111-4111-8111-111111111111';
const GUILD_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function matches(row, query = {}) {
  for (const [key, raw] of Object.entries(query)) {
    if (['select', 'limit', 'order'].includes(key)) continue;
    const value = String(raw || '');
    if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
  }
  return true;
}

function memoryStore(overrides = {}) {
  const tables = {
    user_player_links: [{ user_id: USER, player_id: PLAYER_UUID, verification_status: 'verified', verification_method: 'cosmetic_challenge', verified_at: '2026-08-17T04:20:00Z' }],
    players: [{ id: PLAYER_UUID, ally_code: '123456789', swgoh_player_id: 'swgoh-player-a', name: 'Alpha', current_guild_id: GUILD_UUID }],
    guild_user_memberships: [{ guild_id: GUILD_UUID, user_id: USER, player_id: PLAYER_UUID, role: 'member', status: 'active', joined_at: '2026-08-17T04:20:00Z' }],
    guilds: [{ id: GUILD_UUID, swgoh_guild_id: 'swgoh-guild-a', name: 'Alpha Guild', last_synced_at: null }],
    guild_sync_runs: [],
    ...overrides,
  };
  const calls = [];
  return {
    tables,
    calls,
    status() { return { configured: true }; },
    async select(table, query = {}) {
      calls.push({ op: 'select', table, query: structuredClone(query) });
      return (tables[table] || []).filter((row) => matches(row, query)).map(structuredClone);
    },
    async rpc(name, args) {
      calls.push({ op: 'rpc', name, args: structuredClone(args) });
      return { ok: true, syncRunId: 'sync-1', guildId: GUILD_UUID, membersStored: args.p_payload.members.length, unitsStored: args.p_payload.members.reduce((sum, member) => sum + member.units.length, 0), activitySnapshotId: 1, capturedAt: args.p_payload.capturedAt };
    },
  };
}

function richMember({ playerId, allyCode, name, baseId, power = 30000 }) {
  return {
    playerId,
    allyCode,
    name,
    level: 85,
    memberLevel: 2,
    guildXp: 10,
    galacticPower: power,
    squadPower: 120000,
    lastActivityTime: '1770000000',
    guildJoinTime: '1700000000',
    lifetimeSeasonScore: '12345',
    leagueId: 'KYBER',
    memberContribution: [{ type: 2, currentValue: '600', lifetimeValue: '9999' }],
    seasonStatus: [{ seasonId: 'S1' }],
    rosterAvailable: true,
    characterGalacticPower: power,
    shipGalacticPower: 0,
    units: [{
      id: `${playerId}-unit`,
      baseId,
      definitionId: `${baseId}:SEVEN_STAR`,
      combatType: 1,
      unitType: 'Character',
      stars: 7,
      level: 85,
      gear: 13,
      relic: 7,
      power,
      speed: 300,
      skills: [{ id: `${baseId}_BASIC`, tier: 7 }],
      equipment: [{ equipmentId: 'E1', slot: 0 }],
      equippedStatMods: [{ id: 'mod-1', level: 15 }],
      purchasedAbilityIds: [`${baseId}_ULTIMATE`],
      calculatedStats: { health: 100000 },
    }],
  };
}

function richGuild({ guildId = 'swgoh-guild-a', hydrationComplete = true, calculationComplete = true } = {}) {
  const members = [
    richMember({ playerId: 'swgoh-player-a', allyCode: '123456789', name: 'Alpha', baseId: 'UNIT_A' }),
    richMember({ playerId: 'swgoh-player-b', allyCode: '987654321', name: 'Bravo', baseId: 'UNIT_B', power: 28000 }),
  ];
  return {
    source: 'live',
    rosterDetail: 'rich',
    guild: { id: guildId, name: 'Alpha Guild', memberCount: 2, galacticPower: 58000, memberMax: 50 },
    members,
    hydration: { requested: 2, hydrated: hydrationComplete ? 2 : 1, failed: hydrationComplete ? 0 : 1, complete: hydrationComplete },
    calculation: { source: 'SWGOH Stats', configured: true, requested: 2, calculated: calculationComplete ? 2 : 1, failed: calculationComplete ? 0 : 1, complete: calculationComplete },
    activity: {
      nextChallengesRefresh: '1770003600',
      raidLaunchConfig: [{ raidId: 'order66' }],
      guildEventTracker: [{ definitionId: 't05D', completedStars: 30 }],
      recentRaidResult: [{ raidId: 'order66', endTime: '1770000000' }],
      recentTerritoryWarResult: [{ endTime: '1769990000', score: '100' }],
      territoryBattleResult: [{ instanceId: 'tb-1', starCount: 30 }],
    },
    fetchedAt: '2026-08-17T04:30:00Z',
  };
}

function persistence(store, body) {
  return createGuildPersistence({
    session: { async currentUser() { return { id: USER, email: 'alpha@example.test' }; } },
    store,
    guildService: { async refreshGuildRoster(ally, options) { return { value: body, cache: 'refreshed', ageMs: 0, ally, options }; } },
    now: () => new Date('2026-08-17T04:30:00Z'),
  });
}

test('game timestamps normalize seconds, milliseconds and ISO strings', () => {
  assert.equal(timestampFromGameValue('1770000000'), new Date(1770000000 * 1000).toISOString());
  assert.equal(timestampFromGameValue(String(1770000000 * 1000)), new Date(1770000000 * 1000).toISOString());
  assert.equal(timestampFromGameValue('2026-08-17T04:30:00Z'), '2026-08-17T04:30:00.000Z');
  assert.equal(timestampFromGameValue(''), null);
});

test('normalized member retains rich progression in unit metadata', () => {
  const member = normalizedMember(richGuild().members[0]);
  assert.equal(member.allyCode, '123456789');
  assert.equal(member.swgohPlayerId, 'swgoh-player-a');
  assert.equal(member.units[0].galacticPower, 30000);
  assert.equal(member.units[0].metadata.speed, 300);
  assert.deepEqual(member.units[0].metadata.skills, [{ id: 'UNIT_A_BASIC', tier: 7 }]);
  assert.deepEqual(member.units[0].metadata.equippedStatMods, [{ id: 'mod-1', level: 15 }]);
  assert.deepEqual(member.units[0].metadata.purchasedAbilityIds, ['UNIT_A_ULTIMATE']);
  assert.equal(member.playerMetadata.raidTicketContributionTypePendingVerification, true);
  assert.equal(member.raidTicketsCurrent, null, 'unverified contribution types must not be mislabeled as Raid Tickets');
});

test('successful sync resolves tenant from verified user and sends one transactional RPC payload', async () => {
  const store = memoryStore();
  const service = persistence(store, richGuild());
  const result = await service.sync({ id: USER });

  assert.equal(result.ok, true);
  assert.equal(result.membersStored, 2);
  assert.equal(result.unitsStored, 2);
  const rpc = store.calls.find((call) => call.op === 'rpc');
  assert.ok(rpc);
  assert.equal(rpc.name, 'ingest_verified_user_guild_sync');
  assert.equal(rpc.args.p_payload.requesterUserId, USER);
  assert.equal(rpc.args.p_payload.lookupAllyCode, '123456789');
  assert.equal(rpc.args.p_payload.guild.swgohGuildId, 'swgoh-guild-a');
  assert.equal(rpc.args.p_payload.hydration.complete, true);
  assert.equal(rpc.args.p_payload.calculation.complete, true);
  assert.equal(rpc.args.p_payload.members.length, 2);
  assert.equal(rpc.args.p_payload.activity.recentRaidResult.length, 1);
  assert.match(rpc.args.p_payload.activityFingerprint, /^[a-f0-9]{64}$/);

  const privateReads = store.calls.filter((call) => call.op === 'select' && ['user_player_links', 'guild_user_memberships'].includes(call.table));
  assert.ok(privateReads.every((call) => call.query.user_id === `eq.${USER}`));
});

test('fresh live Guild mismatch is rejected before the RPC', async () => {
  const store = memoryStore();
  const service = persistence(store, richGuild({ guildId: 'different-guild' }));
  await assert.rejects(
    () => service.sync({ id: USER }),
    (error) => error?.status === 409 && error?.code === 'GUILD_SYNC_TENANT_MISMATCH',
  );
  assert.equal(store.calls.some((call) => call.op === 'rpc'), false);
});

test('incomplete hydration is rejected before permanent persistence', async () => {
  const store = memoryStore();
  const service = persistence(store, richGuild({ hydrationComplete: false }));
  await assert.rejects(
    () => service.sync({ id: USER }),
    (error) => error?.code === 'GUILD_SYNC_HYDRATION_INCOMPLETE',
  );
  assert.equal(store.calls.some((call) => call.op === 'rpc'), false);
});

test('incomplete GP/stat calculation is rejected before permanent persistence', async () => {
  const store = memoryStore();
  const service = persistence(store, richGuild({ calculationComplete: false }));
  await assert.rejects(
    () => service.sync({ id: USER }),
    (error) => error?.code === 'GUILD_SYNC_CALCULATION_INCOMPLETE',
  );
  assert.equal(store.calls.some((call) => call.op === 'rpc'), false);
});

test('activity fingerprint changes when member contribution history changes', () => {
  const body = richGuild();
  const members = body.members.map(normalizedMember);
  const one = activityFingerprint(body.activity, members);
  const changed = structuredClone(members);
  changed[0] = { ...changed[0], memberContribution: [{ type: 2, currentValue: '601' }] };
  const two = activityFingerprint(body.activity, changed);
  assert.notEqual(one, two);
});
