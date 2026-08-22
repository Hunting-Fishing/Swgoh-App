import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFaction, unitPlayerFactions } from '../public/gac-player-facing-factions.js';
import { filterRosterUnits } from '../public/gac-manual-counter-planner-model.js';

const roster = {
  units: [
    { baseId:'MOTHERTALZIN', name:'Mother Talzin', unitType:'Character', factions:['Nightsisters'], tags:['affiliation_nightsisters'] },
    { baseId:'DEDRAMEERO', name:'Dedra Meero', unitType:'Character', factions:['Empire','Imperialsecuritybureau'], tags:['affiliation_empire','affiliation_imperialsecuritybureau'] },
    { baseId:'ANAKINKNIGHT', name:'Jedi Knight Anakin', unitType:'Character', factions:['Republic','Jedi'], tags:['affiliation_republic','profession_jedi'] },
    { baseId:'ADMIRALACKBAR', name:'Admiral Ackbar', unitType:'Character', factions:['Rebels'], tags:['affiliation_rebels'] },
  ],
};

test('live persisted faction spellings map to player-facing GAC filters', () => {
  assert.equal(canonicalFaction('Nightsisters'), 'Nightsister');
  assert.equal(canonicalFaction('affiliation_nightsisters'), 'Nightsister');
  assert.equal(canonicalFaction('Imperialsecuritybureau'), 'ISB');
  assert.equal(canonicalFaction('affiliation_imperialsecuritybureau'), 'ISB');
  assert.equal(canonicalFaction('Republic'), 'Galactic Republic');
  assert.equal(canonicalFaction('affiliation_republic'), 'Galactic Republic');
  assert.equal(canonicalFaction('Rebels'), 'Rebel');
  assert.equal(canonicalFaction('affiliation_rebels'), 'Rebel');
});

test('GAC roster filter returns characters for the affected live factions', () => {
  assert.deepEqual(filterRosterUnits(roster, { faction:'Nightsister' }).map((unit) => unit.baseId), ['MOTHERTALZIN']);
  assert.deepEqual(filterRosterUnits(roster, { faction:'ISB' }).map((unit) => unit.baseId), ['DEDRAMEERO']);
  assert.deepEqual(filterRosterUnits(roster, { faction:'Galactic Republic' }).map((unit) => unit.baseId), ['ANAKINKNIGHT']);
  assert.deepEqual(filterRosterUnits(roster, { faction:'Rebel' }).map((unit) => unit.baseId), ['ADMIRALACKBAR']);
});

test('unit faction extraction deduplicates live metadata and raw category aliases', () => {
  assert.deepEqual(unitPlayerFactions(roster.units[0]), ['Nightsister']);
  assert.deepEqual(unitPlayerFactions(roster.units[1]), ['Empire','ISB']);
  assert.deepEqual(unitPlayerFactions(roster.units[2]), ['Galactic Republic','Jedi']);
  assert.deepEqual(unitPlayerFactions(roster.units[3]), ['Rebel']);
});
