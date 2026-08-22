import test from 'node:test';
import assert from 'node:assert/strict';

import {
  datacronWarehouseBattleSamples,
  summarizeDatacronWarehouseMaturity,
} from '../public/gac-datacron-evidence-maturity.js';

function batch(battles = [], ready = true) {
  return {
    warehouseReady: ready,
    count: battles.length,
    results: [{ enemyLeaderBaseId:'D1', observations:battles.map((value) => ({ battles:value })) }],
  };
}

test('Datacron maturity counts underlying battle samples rather than matchup rows', () => {
  assert.equal(datacronWarehouseBattleSamples(batch([3, 7, 20])), 30);
});

test('Datacron maturity remains experimental while warehouse is unavailable, empty or low sample', () => {
  assert.equal(summarizeDatacronWarehouseMaturity(batch([], false)).state, 'not-ready');
  assert.equal(summarizeDatacronWarehouseMaturity(batch([], true)).state, 'empty');
  const low = summarizeDatacronWarehouseMaturity(batch([10, 9], true));
  assert.equal(low.state, 'low-sample');
  assert.equal(low.experimental, true);
  assert.match(low.label, /EXPERIMENTAL/i);
});

test('Datacron maturity graduates only after enough verified battle evidence accumulates', () => {
  const growing = summarizeDatacronWarehouseMaturity(batch([25, 30], true));
  assert.equal(growing.state, 'growing');
  assert.equal(growing.experimental, false);

  const established = summarizeDatacronWarehouseMaturity(batch([60, 50], true));
  assert.equal(established.state, 'established');
  assert.match(established.label, /VERIFIED EVIDENCE/i);
});
