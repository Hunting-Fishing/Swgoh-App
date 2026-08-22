import test from 'node:test';
import assert from 'node:assert/strict';
import { currentRelicSuitability, formatRelicDelta, relicSuitabilityForAllocation, teamAverageRelic } from '../public/gac-relic-suitability-model.js';

const ownRoster = { units:[
  { baseId:'A', relic:7 }, { baseId:'B', relic:6 }, { baseId:'C', relic:5 },
]};
const opponentRoster = { units:[
  { baseId:'D', relic:5 }, { baseId:'E', relic:5 }, { baseId:'F', relic:5 },
]};

test('team average relic requires a complete current roster snapshot', () => {
  assert.equal(teamAverageRelic(['A','B','C'], ownRoster), 6);
  assert.equal(teamAverageRelic(['A','B','MISSING'], ownRoster), null);
});

test('current relic suitability compares loaded rosters without changing historical evidence', () => {
  const fit = currentRelicSuitability({ defenseMembers:['D','E','F'], counterMembers:['A','B','C'], ownRoster, opponentRoster });
  assert.equal(fit.defenderAverageRelic, 5);
  assert.equal(fit.attackerAverageRelic, 6);
  assert.equal(fit.relicDelta, 1);
  assert.equal(fit.band, 'comparable');
});

test('relic suitability bands call out deep undergear separately', () => {
  const low = { units:[{baseId:'A',relic:2},{baseId:'B',relic:2},{baseId:'C',relic:2}] };
  const fit = currentRelicSuitability({ defenseMembers:['D','E','F'], counterMembers:['A','B','C'], ownRoster:low, opponentRoster });
  assert.equal(fit.relicDelta, -3);
  assert.equal(fit.band, 'deep-underdog');
});

test('relic delta formatting is explicit about sign', () => {
  assert.equal(formatRelicDelta(1.25), '+1.3');
  assert.equal(formatRelicDelta(-2), '-2');
  assert.equal(formatRelicDelta(null), '—');
});

test('allocation relic rows preserve historical win evidence as a separate field', () => {
  const rows = relicSuitabilityForAllocation([
    { rowKey:'FRONT-TOP|0', counterLeaderBaseId:'A', counterMembers:['A','B','C'], battles:42, winRate:.88, averageBanners:53 },
  ], [
    { zone:'FRONT-TOP', slot:0, leaderBaseId:'D', members:['D','E','F'] },
  ], ownRoster, opponentRoster);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].relicDelta, 1);
  assert.equal(rows[0].winRate, .88);
  assert.equal(rows[0].battles, 42);
  assert.equal(rows[0].averageBanners, 53);
});
