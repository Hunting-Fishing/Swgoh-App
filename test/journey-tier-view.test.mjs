import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JOURNEY_PRESETS } from '../public/farm-presets.js';
import { SOLO_JOURNEY_TIERS, GUILD_JOURNEY_GROUPS } from '../public/journey-tier-layout-data.js';

const view = await readFile(new URL('../public/journey-tier-view.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/journey-tier-view.css', import.meta.url), 'utf8');
const loader = await readFile(new URL('../public/farm-workspace-loader.js', import.meta.url), 'utf8');

function names(tier) {
  return tier.journeys.map((journey) => journey.name);
}

test('Solo Journey Tier View follows the published 2026 Tier I-V reorganization', () => {
  assert.equal(SOLO_JOURNEY_TIERS.length, 5);
  assert.deepEqual(names(SOLO_JOURNEY_TIERS[0]), [
    'Emperor Palpatine', 'Grand Master Yoda', 'R2-D2', 'Grand Admiral Thrawn', 'Padmé Amidala', 'BB-8',
  ]);
  assert.deepEqual(names(SOLO_JOURNEY_TIERS[1]), [
    'Commander Luke Skywalker', 'Chewbacca', 'C-3PO', 'Rey (Jedi Training)', 'The Mandalorian (Beskar Armor)',
    'Jedi Knight Cal Kestis', 'Jedi Knight Revan', 'Darth Revan', 'Chimaera',
  ]);
  assert.deepEqual(names(SOLO_JOURNEY_TIERS[2]), [
    'Jedi Master Mace Windu', 'Jar Jar Binks', 'Doctor Aphra', 'Grand Inquisitor', 'Starkiller', 'Darth Malak', "Han's Millennium Falcon",
  ]);
  assert.deepEqual(names(SOLO_JOURNEY_TIERS[3]), [
    'Cassian Andor (Undercover)', 'Maul (Hate-Fueled)', 'General Skywalker',
  ]);
  assert.deepEqual(names(SOLO_JOURNEY_TIERS[4]), [
    'Jedi Knight Luke Skywalker', "Bo-Katan (Mand'alor)", 'Baylan Skoll', 'Executor', 'Profundity', 'Leviathan',
  ]);
});

test('every tier item linked to Farm readiness references an existing normalized preset', () => {
  const presetIds = new Set(JOURNEY_PRESETS.map((preset) => preset.id));
  const referenced = SOLO_JOURNEY_TIERS.flatMap((tier) => tier.journeys).map((journey) => journey.presetId).filter(Boolean);
  assert.ok(referenced.length > 0);
  for (const id of referenced) assert.ok(presetIds.has(id), `missing preset ${id}`);
});

test('Guild Journey view models the raid and Territory Battle reward groups separately', () => {
  assert.deepEqual(GUILD_JOURNEY_GROUPS.map((group) => group.label), ['Guild Raids', 'Territory Battles']);
  assert.deepEqual(GUILD_JOURNEY_GROUPS[0].journeys.map((journey) => journey.name), ['Han Solo', 'Darth Traya', 'General Kenobi']);
  assert.deepEqual(GUILD_JOURNEY_GROUPS[1].journeys.map((journey) => journey.name), ['Third Sister', 'Imperial Probe Droid', 'Wat Tambor', 'Rebel Officer Leia Organa', 'Ki-Adi-Mundi']);
});

test('Journey Gallery preserves Grid View and adds SWGOH Tier View as an alternate mode', () => {
  assert.match(view, /Grid View/);
  assert.match(view, /SWGOH Tier View/);
  assert.match(view, /sessionStorage\.setItem\('swgoh:farm:journey-view'/);
  assert.match(view, /Solo Journeys/);
  assert.match(view, /Guild Journeys/);
  assert.match(view, /Galactic Legends/);
  assert.match(css, /\.journey-tier-category-nav/);
  assert.match(css, /\.journey-tier-card-grid/);
  assert.match(css, /clip-path: polygon/);
});

test('unsupported official Journeys remain visible without fabricated readiness', () => {
  assert.match(view, /NOT NORMALIZED/);
  assert.match(view, /Requirements not normalized/);
  assert.match(view, /const percent = model \?/);
  assert.doesNotMatch(view, /Math\.random/);
});

test('supported Tier cards route into the existing Requirements tab contract', () => {
  assert.match(view, /data-gallery-requirements/);
  assert.match(view, /farmTargetModel/);
});

test('tier view loads only after the main Farm Gallery controller', () => {
  const gallery = loader.indexOf('/farm-gallery-tabs.js');
  const tier = loader.indexOf('/journey-tier-view.js');
  assert.ok(gallery >= 0);
  assert.ok(tier > gallery);
});
