import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRoteTacticalPlanetModel,
  roteTacticalMissionNode,
} from '../public/rote-tactical-node-model.js';

const catalog = {
  units: [
    { baseId: 'HONDO', name: 'Hondo Ohnaka', unitType: 'Character', image: '/assets/hondo.png' },
    { baseId: 'JABBATHEHUTT', name: 'Jabba the Hutt', unitType: 'Character', image: '/assets/jabba.png' },
    { baseId: 'CEREJUNDA', name: 'Cere Junda', unitType: 'Character', image: '/assets/cere.png' },
    { baseId: 'CALKESTIS', name: 'Cal Kestis', unitType: 'Character', image: '/assets/cal.png' },
    { baseId: 'JEDIKNIGHTCAL', name: 'Jedi Knight Cal Kestis', unitType: 'Character', image: '/assets/jkck.png' },
    { baseId: 'GRANDINQUISITOR', name: 'Grand Inquisitor', unitType: 'Character', image: '/assets/gi.png' },
  ],
};

test('P2 Felucia places Hondo on the pinned Hondo mission node with a real required portrait anchor', () => {
  const node = roteTacticalMissionNode('felucia', 'felucia-hondo', { catalog });

  assert.ok(node);
  assert.equal(node.top, 63);
  assert.equal(node.left, 29);
  assert.equal(node.infrastructure, false);
  assert.deepEqual(node.requiredUnits.map((row) => row.baseId), ['HONDO']);
  assert.equal(node.requiredUnits[0].image, '/assets/hondo.png');
  assert.equal(node.assetAnchors.portraits.includes('HONDO'), true);
  assert.equal(node.readiness, null, 'no player roster means no fabricated readiness verdict');
});

test('P2 Bracca Zeffo unlock keeps Cere mandatory and exposes Cal/JKCK as legal alternatives under the shared R7 gate', () => {
  const node = roteTacticalMissionNode('bracca', 'bracca-zeffo-unlock', { catalog });

  assert.ok(node);
  assert.equal(node.top, 61);
  assert.equal(node.left, 26);
  assert.deepEqual(node.requiredUnits.map((row) => row.baseId), ['CEREJUNDA']);
  assert.deepEqual(new Set(node.alternativeUnits.map((row) => row.baseId)), new Set(['CALKESTIS', 'JEDIKNIGHTCAL']));
  assert.equal(node.entryRule.squadSize, 2);
  assert.equal(node.entryRule.threshold.includes('R7+'), true);
  assert.equal(node.entryRule.threshold.includes('7★'), true);
  assert.equal(node.requiredUnits[0].relicMin, 7);
  assert.equal(node.alternativeUnits.every((row) => row.relicMin === 7 && row.starsMin === 7), true);
  assert.match(node.entryRule.notes, /Cere Junda plus either Cal Kestis or Jedi Knight Cal Kestis/i);
});

test('P3 Tatooine Reva shard mission anchors Grand Inquisitor at the actual node and retains the Inquisitorius restriction', () => {
  const node = roteTacticalMissionNode('tatooine', 'tatooine-reva', { catalog });

  assert.ok(node);
  assert.equal(node.top, 64);
  assert.equal(node.left, 46);
  assert.deepEqual(node.requiredUnits.map((row) => row.baseId), ['GRANDINQUISITOR']);
  assert.equal(node.requiredUnits[0].image, '/assets/gi.png');
  assert.deepEqual(node.requiredCategories, ['Inquisitorius']);
  assert.equal(node.rewardBadges.some((reward) => /Third Sister shard/i.test(reward)), true);
  assert.equal(node.assetAnchors.portraits.includes('GRANDINQUISITOR'), true);
  assert.equal(node.assetAnchors.portraits.includes('THIRDSISTER'), false, 'Third Sister is the reward, not a fabricated required unit for the shard mission');
});

test('P3 Tatooine Jabba mission anchors Jabba at its pinned mission coordinate', () => {
  const node = roteTacticalMissionNode('tatooine', 'tatooine-jabba', { catalog });

  assert.ok(node);
  assert.equal(node.top, 34);
  assert.equal(node.left, 42);
  assert.deepEqual(node.requiredUnits.map((row) => row.baseId), ['JABBATHEHUTT']);
  assert.equal(node.requiredUnits[0].image, '/assets/jabba.png');
});

test('infrastructure nodes never fabricate required-character portrait anchors', () => {
  const model = buildRoteTacticalPlanetModel('felucia', { catalog });
  assert.ok(model);

  const infrastructure = model.nodes.filter((node) => node.infrastructure);
  assert.ok(infrastructure.length >= 2);
  for (const node of infrastructure) {
    assert.equal(node.mission, null);
    assert.deepEqual(node.requiredUnits, []);
    assert.deepEqual(node.alternativeUnits, []);
    assert.deepEqual(node.assetAnchors.portraits, []);
    assert.equal(node.readiness, null);
  }
});

test('P2/P3 pinned maps resolve their canonical mission-node IDs without inventing a second coordinate source', () => {
  for (const planetId of ['geonosis', 'felucia', 'bracca', 'dathomir', 'tatooine', 'kashyyyk']) {
    const model = buildRoteTacticalPlanetModel(planetId, { catalog });
    assert.ok(model, `${planetId} should have an existing pinned mission map`);
    assert.deepEqual(model.unresolvedNodeIds, [], `${planetId} should resolve all mission nodes`);
    assert.equal(model.nodes.every((node) => Number.isFinite(node.top) && Number.isFinite(node.left)), true);
  }
});
