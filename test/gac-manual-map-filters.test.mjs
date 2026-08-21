import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOARD_ZONES,
  availableFactions,
  filterRosterUnits,
  normalizeDefense,
  planManualFleets,
  rosterShips,
} from '../public/gac-manual-counter-planner-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function character(baseId, name, faction) {
  return { baseId, name, unitType: 'Character', power: 30000, relic: 7, speed: 300, zetas: 2, omicrons: 1, stars: 7, gear: 13, factions: [faction], abilities: [{ id: `leader-${baseId}`, type: 'Leader', tier: 8 }] };
}
function ship(baseId, name, faction, power = 90000) {
  return { baseId, name, unitType: 'Ship', power, speed: 190, stars: 7, level: 85, factions: [faction], categories: baseId.startsWith('CAPITAL') ? ['Capital Ship'] : [] };
}

const ownerShips = [
  ship('CAPITAL_OWNER', 'Owner Capital', 'Rebel', 110000),
  ship('OWN_X1', 'X-wing One', 'Rebel'), ship('OWN_X2', 'X-wing Two', 'Rebel'), ship('OWN_X3', 'X-wing Three', 'Rebel'), ship('OWN_X4', 'Phantom', 'Rebel'),
];
const enemyShips = [
  ship('CAPITAL_ENEMY', 'Enemy Capital', 'Empire', 108000),
  ship('ENEMY_T1', 'TIE One', 'Empire'), ship('ENEMY_T2', 'TIE Two', 'Empire'), ship('ENEMY_T3', 'TIE Three', 'Empire'),
];
const ownerRoster = { player: { allyCode: '111222333' }, units: [character('CLS', 'Commander Luke Skywalker', 'Rebel')], ships: ownerShips };
const opponentRoster = { player: { allyCode: '444555666' }, units: [character('BOSSNASS', 'Boss Nass', 'Gungan'), character('SEE', 'Sith Eternal Emperor', 'Sith')], ships: enemyShips };
const catalog = { units: [...ownerRoster.units, ...ownerShips, ...opponentRoster.units, ...enemyShips] };

test('manual map mirrors the four GAC territories with fleet in back top', () => {
  assert.deepEqual(BOARD_ZONES.map((row) => row.value), ['BACK-TOP', 'FRONT-TOP', 'BACK-BOTTOM', 'FRONT-BOTTOM']);
  assert.equal(BOARD_ZONES.find((row) => row.value === 'BACK-TOP')?.type, 'fleet');
  assert.equal(BOARD_ZONES.find((row) => row.value === 'FRONT-TOP')?.type, 'squad');
});

test('roster filters support names, factions and ships', () => {
  assert.equal(rosterShips(opponentRoster).length, 4);
  assert.ok(availableFactions(opponentRoster, 'character').includes('Gungan'));
  assert.ok(availableFactions(opponentRoster, 'ship').includes('Empire'));
  assert.deepEqual(filterRosterUnits(opponentRoster, { type: 'character', faction: 'Gungan' }).map((row) => row.baseId), ['BOSSNASS']);
  assert.deepEqual(filterRosterUnits(opponentRoster, { type: 'character', query: 'eternal' }).map((row) => row.baseId), ['SEE']);
  assert.deepEqual(filterRosterUnits(opponentRoster, { type: 'ship', query: 'tie two' }).map((row) => row.baseId), ['ENEMY_T2']);
});

test('fleet defense normalizes capital plus visible ships into fleet territory', () => {
  const defense = normalizeDefense({
    type: 'fleet',
    zone: 'BACK-TOP',
    slot: 0,
    capitalShipBaseId: 'CAPITAL_ENEMY',
    members: ['CAPITAL_ENEMY', 'ENEMY_T1', 'ENEMY_T2', 'ENEMY_T3'],
  }, '5v5');
  assert.equal(defense.type, 'fleet');
  assert.equal(defense.zone, 'BACK-TOP');
  assert.equal(defense.complete, true);
  assert.deepEqual(defense.starters, ['ENEMY_T1', 'ENEMY_T2', 'ENEMY_T3']);
});

test('manual fleet plan reuses evidence allocator and never invents a fleet heuristic', () => {
  const defense = normalizeDefense({
    type: 'fleet', zone: 'BACK-TOP', slot: 0, capitalShipBaseId: 'CAPITAL_ENEMY',
    members: ['CAPITAL_ENEMY', 'ENEMY_T1', 'ENEMY_T2', 'ENEMY_T3'],
  }, '5v5');
  const evidence = {
    results: [{
      enemyCapitalShipBaseId: 'CAPITAL_ENEMY',
      observations: [{
        defenderCapitalShipBaseId: 'CAPITAL_ENEMY',
        defenderMembers: ['CAPITAL_ENEMY', 'ENEMY_T1', 'ENEMY_T2', 'ENEMY_T3'],
        attackerCapitalShipBaseId: 'CAPITAL_OWNER',
        attackerMembers: ['CAPITAL_OWNER', 'OWN_X1', 'OWN_X2', 'OWN_X3'],
        reliability: { tier: 'verified', rank: 3, automatic: true, label: 'Verified fleet sample' },
        battles: 10, wins: 9, observedWinRate: 0.9,
      }],
    }],
  };
  const plan = planManualFleets({ ownerRoster, catalog, defenses: [defense], evidence, reservedBaseIds: [], format: '5v5' });
  assert.equal(plan.defenses.length, 1);
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].source, 'historical-fleet-counter-evidence');
  assert.equal(plan.assignments[0].recommendation.counterCapitalShipBaseId, 'CAPITAL_OWNER');
});

test('manual UI exposes map, ships, faction dropdowns and name search', () => {
  const ui = fs.readFileSync(path.join(root, 'public/gac-manual-counter-planner.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/gac-manual-map-filters.css'), 'utf8');
  assert.match(ui, /ENEMY BOARD MAP/);
  assert.match(ui, /FLEET TERRITORY \/ BACK TOP/);
  assert.match(ui, /Fleet \/ Ships/);
  assert.match(ui, /data-gac-manual-own-faction/);
  assert.match(ui, /data-gac-manual-enemy-faction/);
  assert.match(ui, /Search by character or ship name/);
  assert.match(ui, /\/api\/gac\/fleet\/counters\/batch/);
  assert.match(css, /grid-template-areas:'backtop fronttop' 'backbottom frontbottom'/);
});
