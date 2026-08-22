import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANDALORE_GET2_PER_CLEAR,
  buildGuildMandaloreReadiness,
  buildMandaloreMemberReadiness,
  isMandalorian,
} from '../public/guild-mandalore-readiness-model.js';

const coreUnits = [
  { baseId: 'MANDALORBOKATAN', name: "Bo-Katan (Mand'alor)", gear: 13, relic: 7, power: 42000 },
  { baseId: 'THEMANDALORIANBESKARARMOR', name: 'The Mandalorian (Beskar Armor)', gear: 13, relic: 7, power: 39000 },
];

function member(index, extra = []) {
  return {
    playerId: `P${index}`,
    allyCode: `${700000000 + index}`,
    name: `Member ${index}`,
    galacticPower: 10_000_000 + index,
    rosterAvailable: true,
    units: [...coreUnits, ...extra],
  };
}

test('Mandalorian faction detection accepts canonical and actual prefixed game tags', () => {
  assert.equal(isMandalorian({ categories: ['Mandalorian'] }), true);
  assert.equal(isMandalorian({ categories: ['affiliation_mandalorian'] }), true);
  assert.equal(isMandalorian({ categories: ['affiliation_ls_mandalorian'] }), true);
  assert.equal(isMandalorian({ categories: ['affiliation_ds_mandalorian'] }), true);
  assert.equal(isMandalorian({ categories: [{ id: 'affiliation_ls_mandalorian' }] }), true);
  assert.equal(isMandalorian({ factions: ['Mandalorian'] }), true);
  assert.equal(isMandalorian({ tags: ['faction_mandalorian'] }), true);
  assert.equal(isMandalorian({ categories: ['affiliation_ls_jedi'] }), false);
});

test('third Mandalorian excludes required core units and selects the strongest valid candidate', () => {
  const report = buildMandaloreMemberReadiness(member(1, [
    { baseId: 'MANDALORIANLOW', name: 'Low Mando', gear: 13, relic: 5, power: 30000, categories: ['affiliation_ls_mandalorian'] },
    { baseId: 'MANDALORIANHIGH', name: 'High Mando', gear: 13, relic: 8, power: 41000, categories: [{ id: 'affiliation_ls_mandalorian' }] },
  ]));
  assert.equal(report.thirdMando.baseId, 'MANDALORIANHIGH');
  assert.equal(report.thirdMando.state.relic, 8);
  assert.equal(report.status, 'READY');
});

test('catalog-provided real Mandalorian tag is merged onto compact persisted units', () => {
  const compactMember = member(2, [{ baseId: 'BO-KATAN', name: 'Bo-Katan Kryze', gear: 13, relic: 7, power: 36000 }]);
  const catalog = [{ baseId: 'BO-KATAN', name: 'Bo-Katan Kryze', categories: ['affiliation_ls_mandalorian'] }];
  const report = buildMandaloreMemberReadiness(compactMember, catalog);
  assert.equal(report.thirdMando.baseId, 'BO-KATAN');
  assert.equal(report.status, 'READY');
});

test('guild summary separates eligibility potential from the required 25 successful clears', () => {
  const members = Array.from({ length: 24 }, (_, index) => member(index + 1, [
    { baseId: `MANDO${index}`, name: `Mando ${index}`, gear: 13, relic: 7, power: 35000, categories: ['affiliation_ls_mandalorian'] },
  ]));
  const report = buildGuildMandaloreReadiness({ guild: { name: 'Test Guild', memberCount: 24 }, members });
  assert.equal(report.summary.ready, 24);
  assert.equal(report.summary.potentialSuccessfulClears, 24);
  assert.equal(report.summary.unlockShortfall, 1);
  assert.equal(report.summary.canFieldUnlockCount, false);
  assert.equal(report.summary.potentialGet2, 24 * MANDALORE_GET2_PER_CLEAR);
  assert.equal(report.rewardPerSuccessfulClear.amount, 50);
  assert.equal(report.rewardPerSuccessfulClear.currency, 'GET2');
});

test('25 eligible accounts means enough potential attempts, not guaranteed mission completion', () => {
  const members = Array.from({ length: 25 }, (_, index) => member(index + 1, [
    { baseId: `MANDO${index}`, name: `Mando ${index}`, gear: 13, relic: 7, power: 35000, categories: ['affiliation_ls_mandalorian'] },
  ]));
  const report = buildGuildMandaloreReadiness({ guild: { name: 'Test Guild', memberCount: 25 }, members });
  assert.equal(report.summary.ready, 25);
  assert.equal(report.summary.unlockShortfall, 0);
  assert.equal(report.summary.canFieldUnlockCount, true);
  assert.match(report.gateText, /successful guild clears/i);
});
