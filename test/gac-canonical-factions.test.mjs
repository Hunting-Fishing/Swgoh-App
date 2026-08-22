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

const EXPECTED_PLAYER_FILTERS = Object.freeze([
  '501st', 'Attacker', 'Bad Batch', 'Bounty Hunter', 'Clone Trooper', 'Constable',
  'Droid', 'Empire', 'Ewok', 'First Order', 'Fleet Commander', 'Galactic Legend',
  'Galactic Republic', 'Geonosian', 'Gungan', 'Healer', 'Hutt Cartel', 'ISB',
  'Imperial Remnant', 'Imperial Trooper', 'Inquisitorius', 'Jawa', 'Jedi', 'Jedi Vanguard',
  'Leader', 'Mandalorian', 'Mercenary', 'New Republic', 'Nightsister', 'Old Republic',
  'Order 66 Raid', 'Phoenix', 'Pirate', 'Rebel', 'Rebel Fighter', 'Resistance',
  'Rogue One', 'Scoundrel', 'Separatist', 'Sith', 'Sith Empire', 'Smuggler',
  'Spectre', 'Support', 'Tank', 'Tusken', 'Unaligned Force User', 'Wookiee',
]);

test('raw internal game tags never leak into the player-facing faction list', () => {
  assert.equal(canonicalFaction('Conq Idenshore'), '');
  assert.equal(canonicalFaction('Conq Imperialdominance'), '');
  assert.equal(canonicalFaction('Conq Princesszody'), '');
  assert.equal(canonicalFaction('Specialmission Empire'), '');
  assert.equal(canonicalFaction('Specialmission Bountyhunter'), '');
  assert.equal(canonicalFaction('Teamup Appo Arctrooper'), '');
});

test('species, affiliation, profession and role aliases map to player-facing labels', () => {
  assert.equal(canonicalFaction('Species Gungan'), 'Gungan');
  assert.equal(canonicalFaction('species_gungan'), 'Gungan');
  assert.equal(canonicalFaction({ id: 'species_gungan' }), 'Gungan');
  assert.equal(canonicalFaction('Species Droid'), 'Droid');
  assert.equal(canonicalFaction('Species Jawa'), 'Jawa');
  assert.equal(canonicalFaction('Species Wookiee Ls'), 'Wookiee');
  assert.equal(canonicalFaction('Spectre'), 'Spectre');
  assert.equal(canonicalFaction('Empire'), 'Empire');
  assert.equal(canonicalFaction('affiliation_sith_empire'), 'Sith Empire');
  assert.equal(canonicalFaction('profession_attacker'), 'Attacker');
  assert.equal(canonicalFaction('role_support'), 'Support');
  assert.equal(canonicalFaction('category_order_66_raid'), 'Order 66 Raid');
});

test('alignment and generic species plumbing remain hidden while combat roles stay filterable', () => {
  assert.equal(canonicalFaction('Species Human'), '');
  assert.equal(canonicalFaction('Light Side'), '');
  assert.equal(canonicalFaction('Dark Side'), '');
  assert.equal(canonicalFaction('Leader'), 'Leader');
  assert.equal(canonicalFaction('Attacker'), 'Attacker');
  assert.equal(canonicalFaction('Healer'), 'Healer');
  assert.equal(canonicalFaction('Support'), 'Support');
  assert.equal(canonicalFaction('Tank'), 'Tank');
});

test('unit faction extraction deduplicates aliases and includes roles', () => {
  const unit = {
    factions: ['Gungan'],
    tags: ['species_gungan', 'profession_attacker', 'Light Side'],
    categories: ['Species Gungan', 'role_leader', 'Conq Maybebestfriends', 'Specialmission Empire'],
  };
  assert.deepEqual(unitPlayerFactions(unit), ['Attacker', 'Gungan', 'Leader']);
});

test('player-facing taxonomy exactly covers the complete requested GAC filter list', () => {
  assert.deepEqual(PLAYER_FACTIONS, EXPECTED_PLAYER_FILTERS);
  assert.equal(PLAYER_FACTIONS.length, 48);
});

test('manual planner exposes the full taxonomy and filters through canonical unit tags', () => {
  const model = fs.readFileSync(path.join(root, 'public/gac-manual-counter-planner-model.js'), 'utf8');
  assert.match(model, /PLAYER_FACTIONS, canonicalFaction, unitPlayerFactions/);
  assert.match(model, /return \[\.\.\.PLAYER_FACTIONS\]/);
  assert.match(model, /const canonicalNeedle = canonicalFaction\(faction\)/);
  assert.match(model, /unitPlayerFactions\(unit\)/);
});

test('canonical UI uses a searchable three-column picker instead of a narrow native select', () => {
  const ui = fs.readFileSync(path.join(root, 'public/gac-canonical-faction-filter-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/gac-canonical-faction-filter.css'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'public/gac-manual-selection-guard.js'), 'utf8');
  assert.match(ui, /PLAYER_FACTIONS, canonicalFaction/);
  assert.match(ui, /FILTER BY FACTION \/ ROLE/);
  assert.match(ui, /Search factions/);
  assert.match(ui, /data-gac-faction-grid|gac-faction-grid/);
  assert.match(ui, /rawSelect\.hidden = true/);
  assert.match(ui, /rawSelect\.dispatchEvent\(new Event\('change'/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.gac-faction-menu/);
  assert.match(loader, /gac-canonical-faction-filter-ui\.js/);
});
