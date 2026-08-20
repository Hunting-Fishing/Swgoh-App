import test from 'node:test';
import assert from 'node:assert/strict';

import { CURRENT_JOURNEY_GUIDES, currentJourneyGuideById } from '../public/journey-current-guide-data.js';

test('current guide catalog surfaces 2026 Journey and Era targets missing from the legacy preset ladder', () => {
  const names = new Set(CURRENT_JOURNEY_GUIDES.map((guide) => guide.name));
  for (const name of [
    'Jedi Master Mace Windu',
    'Cassian Andor (Undercover)',
    'Maul (Hate-Fueled)',
    'Rotta the Hutt',
    'Darth Jar Jar',
  ]) assert.equal(names.has(name), true, `${name} should be represented`);
});

test('Darth Jar Jar preserves star and Era-Level gates as separate evidence', () => {
  const guide = currentJourneyGuideById('CURRENT_DARTH_JAR_JAR');
  assert.equal(guide.progressionSystem, 'era');
  assert.equal(guide.requirementsKnown, true);
  assert.deepEqual(guide.tiers.map((tier) => [tier.tier, tier.stars, tier.eraLevel]), [
    [1, 4, 90],
    [2, 5, 95],
    [3, 6, 110],
    [4, 7, 125],
  ]);
  assert.equal(guide.tiers[0].eraLevelUnitName, 'Yoda (Dark Side Vision)');
  assert.equal(guide.tiers[1].eraLevelUnitName, 'Starkiller (Luke Concept)');
  assert.equal(guide.tiers[2].eraLevelUnitName, 'Mara Jade Skywalker');
  assert.equal(guide.tiers[3].eraLevelUnitName, 'ALL REQUIRED UNITS');
  assert.equal(guide.tiers[2].requiredNames.includes('The Ronin'), true);
});

test('reference-only/current guides do not fabricate exact progression requirements', () => {
  for (const id of ['CURRENT_JMMW', 'CURRENT_CASSIAN_UNDERCOVER']) {
    const guide = currentJourneyGuideById(id);
    assert.equal(guide.progressionSystem, 'reference-only');
    assert.equal(guide.requirementsKnown, false);
    assert.deepEqual(guide.tiers, []);
  }
});

test('Era guides without a normalized contract stay explicitly non-numeric', () => {
  for (const id of ['CURRENT_MAUL_HATE_FUELED', 'CURRENT_ROTTA_HUTT']) {
    const guide = currentJourneyGuideById(id);
    assert.equal(guide.progressionSystem, 'era');
    assert.equal(guide.requirementsKnown, false);
    assert.deepEqual(guide.tiers, []);
  }
});

test('every current guide carries source provenance', () => {
  for (const guide of CURRENT_JOURNEY_GUIDES) {
    assert.ok(guide.sources.length > 0, `${guide.id} must have a source`);
    assert.ok(guide.sources.every((source) => /^https:\/\/swgoh\.gg\//.test(source.ref)), `${guide.id} source must be SWGOH.GG`);
    assert.ok(guide.sources.every((source) => source.capturedAt === '2026-08-20'));
  }
});
