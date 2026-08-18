import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalGuildTbSnapshot,
  buildPersonalTbFarmPlan,
} from '../tb-farm-plan-action.mjs';

const allyCode = '732764286';
const member = Object.freeze({
  id: 'game-player-1',
  playerId: 'game-player-1',
  persistentId: '11111111-1111-4111-8111-111111111111',
  allyCode,
  name: 'Warm Bacon',
  galacticPower: 12_000_000,
  rosterAvailable: true,
  characterCount: 2,
  shipCount: 0,
});

function guildBaseline(complete = true) {
  return Object.freeze({
    source: 'canonical',
    fetchedAt: '2026-08-19T00:00:00Z',
    guild: Object.freeze({ id: 'guild-game-id', persistentId: 'guild-db-id', name: 'Ludus Venatus', memberCount: 1 }),
    hydration: Object.freeze({ requested: 1, hydrated: complete ? 1 : 0, failed: complete ? 0 : 1, complete }),
    members: Object.freeze([member]),
    summary: Object.freeze({ totalMembers: 1, hydratedMembers: complete ? 1 : 0 }),
  });
}

const rawUnitRows = Object.freeze([
  Object.freeze({ player_id:member.persistentId,base_id:'AAYLASECURA',unit_name:'Aayla Secura',combat_type:1,rarity:7,level:85,gear_level:13,relic_tier:2,galactic_power:25_000,zeta_count:1,omicron_count:0,metadata:{speed:250} }),
  Object.freeze({ player_id:member.persistentId,base_id:'PLOKOON',unit_name:'Plo Koon',combat_type:1,rarity:7,level:85,gear_level:13,relic_tier:3,galactic_power:24_000,zeta_count:0,omicron_count:0,metadata:{speed:240} }),
]);

const catalog = Object.freeze([
  Object.freeze({ baseId: 'AAYLASECURA', name: 'Aayla Secura', unitType: 'Character', alignment: 'Light Side', categories: ['Jedi','Galactic Republic'], factions: ['Jedi','Galactic Republic'] }),
  Object.freeze({ baseId: 'PLOKOON', name: 'Plo Koon', unitType: 'Character', alignment: 'Light Side', categories: ['Jedi','Galactic Republic'], factions: ['Jedi','Galactic Republic'] }),
]);

function hydratedPlayerUnits() {
  return rawUnitRows.map((row) => ({
    baseId: row.base_id,
    name: row.unit_name,
    unitType: 'Character',
    stars: row.rarity,
    gear: row.gear_level,
    relic: row.relic_tier,
    power: row.galactic_power,
    factions: catalog.find((unit) => unit.baseId === row.base_id)?.factions || [],
    categories: catalog.find((unit) => unit.baseId === row.base_id)?.categories || [],
  }));
}

function hydratedGuild() {
  return {
    ...guildBaseline(true),
    members: Object.freeze([{ ...member, units: Object.freeze(hydratedPlayerUnits()) }]),
  };
}

test('canonical TB snapshot uses one batched Guild-unit read plus canonical static definitions without Discord', async () => {
  const calls = [];
  const canonical = {
    async getGuildRosterByPlayer(code) { calls.push(['guild', code]); return guildBaseline(true); },
    async getGameUnitCatalog() { calls.push(['catalog']); return catalog; },
    async _selectPaged(table, query, options) {
      calls.push(['units', table, query.player_id, options.maxRows]);
      assert.equal(table, 'player_units_current');
      assert.match(query.player_id, /^in\.\(/);
      return rawUnitRows;
    },
  };
  const result = await buildCanonicalGuildTbSnapshot(canonical, allyCode);
  assert.equal(result.guildSnapshot.members.length, 1);
  assert.equal(result.guildSnapshot.members[0].rosterAvailable, true);
  assert.equal(result.guildSnapshot.members[0].units.length, 2);
  assert.equal(result.guildSnapshot.members[0].units[0].categories.includes('Jedi'), true);
  assert.equal(result.catalog.length, 2);
  assert.deepEqual(calls.map((row) => row[0]), ['guild','catalog','units']);
  assert.equal(calls.filter((row) => row[0] === 'units').length, 1, 'Guild unit hydration must stay batched rather than one player call per member');
});

test('personal TB action refuses an incomplete Guild hydration rather than understating redundancy', async () => {
  const canonical = {
    async getGuildRosterByPlayer() { return guildBaseline(false); },
    async getGameUnitCatalog() { return catalog; },
    async _selectPaged() { throw new Error('must not read units after incomplete Guild gate'); },
  };
  await assert.rejects(
    buildCanonicalGuildTbSnapshot(canonical, allyCode),
    (error) => error?.code === 'GUILD_ROSTER_NOT_FULLY_HYDRATED' && error?.status === 409,
  );
});

test('personal TB action refuses a truncated member unit result', async () => {
  const canonical = {
    async getGuildRosterByPlayer() { return guildBaseline(true); },
    async getGameUnitCatalog() { return catalog; },
    async _selectPaged() { return rawUnitRows.slice(0, 1); },
  };
  await assert.rejects(
    buildCanonicalGuildTbSnapshot(canonical, allyCode),
    (error) => error?.code === 'GUILD_MEMBER_ROSTER_INCOMPLETE' && error?.status === 503,
  );
});

test('personal TB plan is player-scoped, bounded, explainable and does not invent a universal score', () => {
  const result = buildPersonalTbFarmPlan(hydratedGuild(), catalog, allyCode, {
    priorityMode: 'journey-overlap',
    maxRecommendations: 5,
  });
  assert.equal(result.action, 'tb-farm-plan');
  assert.equal(result.player.allyCode, allyCode);
  assert.equal(result.input.priorityMode, 'journey-overlap');
  assert.ok(result.recommendations.length <= 5);
  assert.equal(result.summary.recommendationsReturned, result.recommendations.length);
  assert.match(result.evidence.journey, /prerequisite relationship/i);
  assert.match(result.evidence.ranking, /No opaque universal farm score/i);
  for (const row of result.recommendations) {
    assert.equal(typeof row.tb.missionImpact, 'number');
    assert.equal(Array.isArray(row.journey.targets), true);
    assert.equal('compositeScore' in row, false);
  }
});

test('MY GOALS mode promotes a farm that advances the player tracked Journey target', () => {
  const result = buildPersonalTbFarmPlan(hydratedGuild(), catalog, allyCode, {
    priorityMode: 'my-goals',
    trackedGoalIds: ['JOURNEY_JEDIMASTERKENOBI'],
    maxRecommendations: 10,
  });
  assert.equal(result.personalization.trackedGoalCount, 1);
  assert.equal(result.personalization.fallbackUsed, false);
  assert.equal(result.summary.priorityMode, 'my-goals');
  const aayla = result.recommendations.find((row) => row.baseId === 'AAYLASECURA');
  assert.ok(aayla, 'Aayla should appear in the personal ROTE farm queue fixture');
  assert.equal(aayla.personal.matchesTrackedGoal, true);
  assert.ok(aayla.personal.targets.some((target) => target.eventId === 'JOURNEY_JEDIMASTERKENOBI'));
  const unrelated = result.recommendations.find((row) => row.baseId === 'PLOKOON');
  if (unrelated) assert.ok(aayla.rank < unrelated.rank, 'tracked JMK overlap should rank before unrelated Journey overlap');
});

test('MY GOALS ranking exposes direct tracked prerequisite completion ahead of partial tracked progress when both exist', () => {
  const result = buildPersonalTbFarmPlan(hydratedGuild(), catalog, allyCode, {
    priorityMode: 'my-goals',
    trackedGoalIds: ['JOURNEY_JEDIMASTERKENOBI','JOURNEY_GLAHSOKATANO'],
    maxRecommendations: 10,
  });
  const tracked = result.recommendations.filter((row) => row.personal.matchesTrackedGoal);
  assert.ok(tracked.length > 0);
  for (const row of tracked) {
    assert.equal(row.personal.trackedOverlapCount, row.personal.targets.length);
    assert.equal('compositeScore' in row.personal, false);
  }
  const firstDirect = tracked.findIndex((row) => row.personal.trackedDirectCount > 0);
  const firstPartial = tracked.findIndex((row) => row.personal.trackedDirectCount === 0 && row.personal.trackedPartialCount > 0);
  if (firstDirect >= 0 && firstPartial >= 0) assert.ok(firstDirect < firstPartial);
});

test('MY GOALS mode transparently falls back to Guild impact when no durable goals exist', () => {
  const result = buildPersonalTbFarmPlan(hydratedGuild(), catalog, allyCode, {
    priorityMode: 'my-goals',
    trackedGoalIds: [],
    maxRecommendations: 5,
  });
  assert.equal(result.personalization.trackedGoalCount, 0);
  assert.equal(result.personalization.fallbackUsed, true);
  assert.equal(result.personalization.requestedPriorityMode, 'my-goals');
  assert.equal(result.personalization.effectivePriorityMode, 'guild-impact');
  assert.equal(result.summary.priorityMode, 'guild-impact');
  assert.match(result.evidence.personalization, /falls back to Guild TB impact/i);
});
