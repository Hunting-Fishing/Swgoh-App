import test from 'node:test';
import assert from 'node:assert/strict';
import { TB_SPECIAL_MISSION_FACTS, potentialMissionReward, tbSpecialMissionFact } from '../public/tb-special-mission-facts.js';
import { buildGuildZeffoReadiness } from '../public/guild-zeffo-readiness-model.js';
import { buildGuildMandaloreReadiness } from '../public/guild-mandalore-readiness-model.js';
import { buildGuildRevaReadiness } from '../public/guild-reva-readiness-model.js';
import { buildGuildWatReadiness } from '../public/guild-wat-readiness-model.js';

const relicUnit = (baseId, relic = 7, extra = {}) => ({ baseId, name: baseId, gear: 13, relic, stars: 7, rarity: 7, power: 30000, ...extra });
const guild = (members) => ({ guild: { id: 'g1', name: 'Test Guild', memberCount: members.length }, members });
const member = (id, units) => ({ playerId: `p${id}`, allyCode: String(700000000 + id), name: `Member ${id}`, galacticPower: 10000000, rosterAvailable: true, units });

test('shared facts encode the four supported TB mission reward truths', () => {
  assert.equal(TB_SPECIAL_MISSION_FACTS.zeffo.unlockTarget, 30);
  assert.equal(TB_SPECIAL_MISSION_FACTS.zeffo.reward.currency, 'GET3');
  assert.equal(TB_SPECIAL_MISSION_FACTS.zeffo.reward.perSuccessfulClear, 50);
  assert.equal(TB_SPECIAL_MISSION_FACTS.zeffo.reward.theoreticalGuildMaximum, 2500);

  assert.equal(TB_SPECIAL_MISSION_FACTS.mandalore.unlockTarget, 25);
  assert.equal(TB_SPECIAL_MISSION_FACTS.mandalore.reward.currency, 'GET2');
  assert.equal(TB_SPECIAL_MISSION_FACTS.mandalore.reward.perSuccessfulClear, 50);
  assert.equal(TB_SPECIAL_MISSION_FACTS.mandalore.reward.theoreticalGuildMaximum, 2500);

  assert.equal(TB_SPECIAL_MISSION_FACTS.reva.reward.unit, 'THIRDSISTER');
  assert.equal(TB_SPECIAL_MISSION_FACTS.reva.reward.perSuccessfulClear, 1);
  assert.equal(TB_SPECIAL_MISSION_FACTS.reva.reward.theoreticalGuildMaximum, 50);

  assert.equal(TB_SPECIAL_MISSION_FACTS.wat.reward.unit, 'WATTAMBOR');
  assert.equal(TB_SPECIAL_MISSION_FACTS.wat.reward.perSuccessfulClear, 1);
  assert.equal(TB_SPECIAL_MISSION_FACTS.wat.reward.theoreticalGuildMaximum, 50);
});

test('potential reward is eligibility-based opportunity and clamps to 50 guild attempts', () => {
  assert.deepEqual(potentialMissionReward('zeffo', 18).amount, 900);
  assert.deepEqual(potentialMissionReward('mandalore', 25).amount, 1250);
  assert.deepEqual(potentialMissionReward('reva', 35).amount, 35);
  assert.deepEqual(potentialMissionReward('wat', 50).amount, 50);
  assert.equal(potentialMissionReward('zeffo', 99).amount, 2500);
  assert.equal(potentialMissionReward('reva', 99).amount, 50);
  assert.equal(potentialMissionReward('unknown', 50), null);
});

test('Zeffo guild model reports GET3 opportunity rather than stale GET2', () => {
  const ready = member(1, [relicUnit('CEREJUNDA'), relicUnit('JEDIKNIGHTCAL')]);
  const report = buildGuildZeffoReadiness(guild([ready]));
  assert.equal(report.rewardCurrency, 'GET3');
  assert.equal(report.rewardPerSuccessfulClear.currency, 'GET3');
  assert.equal(report.summary.potentialGet3, 50);
  assert.equal(Object.hasOwn(report.summary, 'potentialGet2'), false);
});

test('Mandalore guild model reports 50 GET2 per eligible successful-attempt opportunity', () => {
  const ready = member(2, [
    relicUnit('MANDALORBOKATAN'),
    relicUnit('THEMANDALORIANBESKARARMOR'),
    relicUnit('BO-KATAN', 7, { categories: ['affiliation_ls_mandalorian'] }),
  ]);
  const report = buildGuildMandaloreReadiness(guild([ready]), [{ baseId: 'BO-KATAN', categories: ['affiliation_ls_mandalorian'] }]);
  assert.equal(report.summary.ready, 1);
  assert.equal(report.rewardPerSuccessfulClear.currency, 'GET2');
  assert.equal(report.rewardPerSuccessfulClear.perSuccessfulClear, 50);
  assert.equal(report.summary.potentialGet2, 50);
});

test('Reva and Wat shard opportunity remains one shard per eligible successful attempt', () => {
  const revaMember = member(3, [
    relicUnit('GRANDINQUISITOR'),
    ...['SECONDINQ', 'SEVENTHSISTER', 'EIGHTHBROTHER', 'NINTHSISTER'].map((baseId) => relicUnit(baseId, 7, { categories: ['affiliation_ds_inquisitorius'] })),
  ]);
  const revaCatalog = ['SECONDINQ', 'SEVENTHSISTER', 'EIGHTHBROTHER', 'NINTHSISTER'].map((baseId) => ({ baseId, categories: ['affiliation_ds_inquisitorius'] }));
  const reva = buildGuildRevaReadiness(guild([revaMember]), revaCatalog);
  assert.equal(reva.summary.ready, 1);
  assert.equal(reva.summary.potentialShards, 1);

  const watMember = member(4, ['GEONOSIANBROODALPHA', 'GEONOSIANSOLDIER', 'GEONOSIANSPY', 'POGGLETHELESSER', 'SUNFAC'].map((baseId) => ({ baseId, name: baseId, stars: 7, rarity: 7, power: 16500 })));
  const wat = buildGuildWatReadiness(guild([watMember]));
  assert.equal(wat.summary.ready, 1);
  assert.equal(wat.summary.potentialShards, 1);
});

test('every supported fact carries an explicit external provenance reference', () => {
  for (const id of ['zeffo', 'mandalore', 'reva', 'wat']) {
    const fact = tbSpecialMissionFact(id);
    assert.match(fact.source.url, /^https:\/\//);
    assert.ok(fact.source.label);
    assert.ok(fact.source.sourceType);
  }
});
