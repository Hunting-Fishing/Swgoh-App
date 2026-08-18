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

function playerRoster() {
  return Object.freeze({
    fetchedAt: '2026-08-19T00:00:00Z',
    player: Object.freeze({ allyCode, name: 'Warm Bacon' }),
    units: Object.freeze([
      Object.freeze({ baseId: 'AAYLASECURA', name: 'Aayla Secura', unitType: 'Character', stars: 7, gear: 13, relic: 2, power: 25_000, factions: ['Jedi','Galactic Republic'], tags: ['Jedi','Galactic Republic'] }),
      Object.freeze({ baseId: 'PLOKOON', name: 'Plo Koon', unitType: 'Character', stars: 7, gear: 13, relic: 3, power: 24_000, factions: ['Jedi','Galactic Republic'], tags: ['Jedi','Galactic Republic'] }),
    ]),
    ships: Object.freeze([]),
  });
}

const catalog = Object.freeze([
  Object.freeze({ baseId: 'AAYLASECURA', name: 'Aayla Secura', unitType: 'Character', alignment: 'Light Side', categories: ['Jedi','Galactic Republic'], factions: ['Jedi','Galactic Republic'] }),
  Object.freeze({ baseId: 'PLOKOON', name: 'Plo Koon', unitType: 'Character', alignment: 'Light Side', categories: ['Jedi','Galactic Republic'], factions: ['Jedi','Galactic Republic'] }),
]);

test('canonical TB snapshot hydrates current Guild member rosters and static unit definitions without Discord', async () => {
  const calls = [];
  const canonical = {
    async getGuildRosterByPlayer(code) { calls.push(['guild', code]); return guildBaseline(true); },
    async getPlayerRoster(code) { calls.push(['player', code]); return playerRoster(); },
    async getGameUnitCatalog() { calls.push(['catalog']); return catalog; },
  };
  const result = await buildCanonicalGuildTbSnapshot(canonical, allyCode, { concurrency: 2 });
  assert.equal(result.guildSnapshot.members.length, 1);
  assert.equal(result.guildSnapshot.members[0].rosterAvailable, true);
  assert.equal(result.guildSnapshot.members[0].units.length, 2);
  assert.equal(result.guildSnapshot.members[0].units[0].categories.includes('Jedi'), true);
  assert.equal(result.catalog.length, 2);
  assert.deepEqual(calls.map((row) => row[0]), ['guild','player','catalog']);
});

test('personal TB action refuses an incomplete Guild hydration rather than understating redundancy', async () => {
  const canonical = {
    async getGuildRosterByPlayer() { return guildBaseline(false); },
    async getPlayerRoster() { throw new Error('must not hydrate after incomplete Guild gate'); },
    async getGameUnitCatalog() { return catalog; },
  };
  await assert.rejects(
    buildCanonicalGuildTbSnapshot(canonical, allyCode),
    (error) => error?.code === 'GUILD_ROSTER_NOT_FULLY_HYDRATED' && error?.status === 409,
  );
});

test('personal TB plan is player-scoped, bounded, explainable and does not invent a universal score', () => {
  const hydratedGuild = {
    ...guildBaseline(true),
    members: Object.freeze([{ ...member, units: Object.freeze([...playerRoster().units]) }]),
  };
  const result = buildPersonalTbFarmPlan(hydratedGuild, catalog, allyCode, {
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
