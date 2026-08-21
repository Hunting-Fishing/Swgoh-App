import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeDefense,
  normalizePlannerState,
  planManualBoard,
  plannerStorageKey,
  squadSize,
  teamStats,
} from '../public/gac-manual-counter-planner-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function unit(baseId, power, relic, speed, zetas = 1, omicrons = 0, faction = 'TEST') {
  return {
    baseId,
    name: baseId,
    unitType: 'Character',
    stars: 7,
    gear: 13,
    relic,
    power,
    speed,
    zetas,
    omicrons,
    factions: [faction],
    abilities: [{ id: `leader-${baseId}`, type: 'Leader', tier: 8 }],
  };
}

const ownUnits = Array.from({ length: 15 }, (_, index) => unit(`OWN_${index + 1}`, 33000 - index * 500, 9 - (index % 4), 350 - index * 4, 2, index % 5 === 0 ? 1 : 0));
const enemyUnits = Array.from({ length: 10 }, (_, index) => unit(`ENEMY_${index + 1}`, 28500 - index * 300, 7 - (index % 3), 320 - index * 3, 1, index % 4 === 0 ? 1 : 0));
const ownRoster = { player: { allyCode: '111222333', name: 'Owner' }, units: ownUnits, capabilities: { zetas: true, omicrons: true } };
const opponentRoster = { player: { allyCode: '444555666', name: 'Enemy' }, units: enemyUnits, capabilities: { zetas: true, omicrons: true } };

const defenses = [
  { id: 'front-see', zone: 'FRONT-TOP', slot: 0, leaderBaseId: 'ENEMY_1', members: enemyUnits.slice(0, 5).map((row) => row.baseId) },
  { id: 'back-gungans', zone: 'BACK-BOTTOM', slot: 0, leaderBaseId: 'ENEMY_6', members: enemyUnits.slice(5, 10).map((row) => row.baseId) },
];

test('manual planner is opponent/format scoped and does not require event IDs', () => {
  const key = plannerStorageKey({ ownerAllyCode: '111-222-333', opponentAllyCode: '444-555-666', format: '5v5' });
  assert.equal(key, 'swgoh:gac-manual-counter:v1:111222333:444555666:5v5');
  assert.equal(key.includes('event'), false);
  assert.equal(key.includes('round'), false);
});

test('manual defenses require the selected format size', () => {
  assert.equal(squadSize('5v5'), 5);
  assert.equal(squadSize('3v3'), 3);
  assert.equal(normalizeDefense(defenses[0], '5v5').complete, true);
  assert.equal(normalizeDefense({ ...defenses[0], members: defenses[0].members.slice(0, 3) }, '5v5').complete, false);
  assert.equal(normalizeDefense({ ...defenses[0], members: defenses[0].members.slice(0, 3) }, '3v3').complete, true);
});

test('reserved defense units are excluded and allocated counters never overlap', () => {
  const reserved = ['OWN_1', 'OWN_2', 'OWN_3', 'OWN_4', 'OWN_5'];
  const plan = planManualBoard({ ownRoster, opponentRoster, defenses, reservedBaseIds: reserved, format: '5v5' });
  assert.equal(plan.assignments.length, 2);
  const used = plan.assignments.flatMap((assignment) => assignment.recommendation?.squad || []).map((row) => row.baseId);
  assert.ok(used.length > 0);
  assert.equal(used.some((id) => reserved.includes(id)), false);
  assert.equal(new Set(used).size, used.length, 'board-wide counter allocation reused a character');
});

test('team stats expose relic, zeta, omicron and speed intelligence', () => {
  const stats = teamStats(ownUnits.slice(0, 5));
  assert.ok(stats.power > 0);
  assert.ok(stats.relics > 0);
  assert.ok(stats.zetas > 0);
  assert.ok(stats.omicrons >= 0);
  assert.ok(stats.fastestSpeed > 0);
  assert.ok(stats.medianSpeed > 0);
});

test('planner state preserves local reserved units and manual board only', () => {
  const state = normalizePlannerState({ reservedBaseIds: ['OWN_1', 'OWN_1', 'OWN_2'], defenses }, '5v5');
  assert.deepEqual(state.reservedBaseIds, ['OWN_1', 'OWN_2']);
  assert.equal(state.defenses.length, 2);
  assert.equal(state.defenses.every((row) => row.source === 'manual-opponent-board'), true);
});

test('manual UI explicitly removes automatic bracket dependency and shows requested deltas', () => {
  const ui = fs.readFileSync(path.join(root, 'public/gac-manual-counter-planner.js'), 'utf8');
  assert.match(ui, /MANUAL GAC MODE/);
  assert.match(ui, /OPPONENT ALLY CODE/);
  assert.match(ui, /YOUR DEFENSE \/ UNAVAILABLE/);
  assert.match(ui, /RELIC Δ/);
  assert.match(ui, /ZETA Δ/);
  assert.match(ui, /OMICRON Δ/);
  assert.match(ui, /FASTEST SPD Δ/);
  assert.match(ui, /MEDIAN SPD Δ/);
  assert.doesNotMatch(ui, /\/api\/gac\/current-event/);
  assert.doesNotMatch(ui, /\/api\/gac\/current-opponent/);
});

test('manual planner is loaded before legacy advanced GAC helpers remain available', () => {
  const loader = fs.readFileSync(path.join(root, 'public/asset-resilience.js'), 'utf8');
  assert.match(loader, /import '\.\/gac-manual-counter-planner\.js';/);
});
