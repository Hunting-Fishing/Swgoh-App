import test from 'node:test';
import assert from 'node:assert/strict';

import { roteTacticalMissionNode } from '../public/rote-tactical-node-model.js';
import {
  resolveRoteTacticalNodeAssets,
  resolveRoteTacticalUnitAsset,
} from '../public/rote-tactical-asset-model.js';

const catalog = {
  units: [
    { baseId: 'HONDO', name: 'Hondo Ohnaka', image: '/game-assets/hondo.png' },
    { baseId: 'GRANDINQUISITOR', name: 'Grand Inquisitor', image: '/game-assets/grand-inquisitor.png' },
  ],
};

test('required character portraits resolve from the existing catalog asset pipeline', () => {
  const node = roteTacticalMissionNode('felucia', 'felucia-hondo', { catalog });
  const assets = resolveRoteTacticalNodeAssets(node, catalog);

  assert.equal(assets.required.length, 1);
  assert.equal(assets.required[0].baseId, 'HONDO');
  assert.equal(assets.required[0].src, '/game-assets/hondo.png');
  assert.equal(assets.required[0].source, 'catalog');
  assert.equal(assets.required[0].fabricated, false);
  assert.equal(assets.complete, true);
});

test('the Reva shard node retains the dedicated Reva mission icon while Grand Inquisitor supplies the required portrait', () => {
  const node = roteTacticalMissionNode('tatooine', 'tatooine-reva', { catalog });
  const assets = resolveRoteTacticalNodeAssets(node, catalog);

  assert.equal(assets.kind, 'reva');
  assert.match(assets.missionIcon.src, /mission_reva\.png$/i);
  assert.deepEqual(assets.required.map((asset) => asset.baseId), ['GRANDINQUISITOR']);
  assert.equal(assets.required[0].src, '/game-assets/grand-inquisitor.png');
});

test('missing character artwork is explicit and never represented as fabricated game art', () => {
  const asset = resolveRoteTacticalUnitAsset({ baseId: 'CEREJUNDA', name: 'Cere Junda' }, { units: [] });

  assert.equal(asset.status, 'missing');
  assert.equal(asset.src, '');
  assert.equal(asset.source, 'none');
  assert.equal(asset.fabricated, false);
  assert.equal(asset.initials, 'CJ');
});
