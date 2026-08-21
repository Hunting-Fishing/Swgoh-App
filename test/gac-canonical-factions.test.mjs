import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_FACTIONS,
  canonicalFaction,
  unitPlayerFactions,
} from '../public/gac-player-facing-factions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('raw internal game tags never leak into the player-facing faction list', () => {
  assert.equal(canonicalFaction('Conq Idenshore'), '');
  assert.equal(canonicalFaction('Conq Imperialdominance'), '');
  assert.equal(canonicalFaction('Conq Princesszody'), '');
  assert.equal(canonicalFaction('Specialmission Empire'), '');
  assert.equal(canonicalFaction('Specialmission Bountyhunter'), '');
  assert.equal(canonicalFaction('Teamup Appo Arctrooper'), '');
});

test('species and category aliases map to the faction names players see in SWGOH', () => {
  assert.equal(canonicalFaction('Species Gungan'), 'Gungan');
  assert.equal(canonicalFaction('species_gungan'), 'Gungan');
  assert.equal(canonicalFaction({ id: 'species_gungan' }), 'Gungan');
  assert.equal(canonicalFaction('Species Droid'), 'Droid');
  assert.equal(canonicalFaction('Species Jawa'), 'Jawa');
  assert.equal(canonicalFaction('Species Wookiee Ls'), 'Wookiee');
  assert.equal(canonicalFaction('Spectre'), 'Spectre');
  assert.equal(canonicalFaction('Empire'), 'Empire');
  assert.equal(canonicalFaction('affiliation_sith_empire'), 'Sith Empire');
});

test('non-player-facing species and combat plumbing remain hidden', () => {
  assert.equal(canonicalFaction('Species Human'), '');
  assert.equal(canonicalFaction('Light Side'), '');
  assert.equal(canonicalFaction('Dark Side'), '');
  assert.equal(canonicalFaction('Leader'), '');
  assert.equal(canonicalFaction('Attacker'), '');
});

test('unit faction extraction deduplicates aliases and preserves canonical names only', () => {
  const unit = {
    factions: ['Gungan'],
    tags: ['species_gungan', 'Light Side'],
    categories: ['Species Gungan', 'Conq Maybebestfriends', 'Specialmission Empire'],
  };
  assert.deepEqual(unitPlayerFactions(unit), ['Gungan']);
});

test('current player-facing taxonomy includes the core in-game faction filters', () => {
  for (const expected of ['Gungan', 'Rebel', 'Empire', 'Sith', 'Jedi', 'Galactic Republic', 'Separatist', 'First Order', 'Resistance', 'Mandalorian', 'Nightsister']) {
    assert.ok(PLAYER_FACTIONS.includes(expected), `missing ${expected}`);
  }
});

test('canonical UI keeps raw API values hidden behind readable labels', () => {
  const ui = fs.readFileSync(path.join(root, 'public/gac-canonical-faction-filter-ui.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');
  assert.match(ui, /canonicalFaction/);
  assert.match(ui, /All factions/);
  assert.match(ui, /rawSelect\.hidden = true/);
  assert.match(ui, /rawSelect\.dispatchEvent\(new Event\('change'/);
  assert.match(loader, /gac-canonical-faction-filter-ui\.js/);
});
