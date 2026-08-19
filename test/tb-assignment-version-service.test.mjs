import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalJson,
  computeTbAssignmentPlanHash,
  normalizeRotePhase,
  recomputeTbAssignmentRunHash,
  verifyTbAssignmentRunHash,
} from '../tb-assignment-version-service.mjs';

test('canonicalJson sorts object keys recursively while preserving array order', () => {
  const value = {
    z: 3,
    a: { y: 2, x: 1 },
    rows: [{ b: 2, a: 1 }, 'x'],
  };
  assert.equal(canonicalJson(value), '{"a":{"x":1,"y":2},"rows":[{"a":1,"b":2},"x"],"z":3}');
});

test('assignment hash is stable across object-key insertion order', () => {
  const first = computeTbAssignmentPlanHash({
    guildId: 'guild-1',
    planId: 'plan-1',
    rotePhase: 'p6',
    versionNumber: 4,
    inputFingerprint: 'source-abc',
    assignments: [{ slotId: 'S1', playerId: 'P1', unit: { baseId: 'UNIT_A', relic: 7 } }],
    unfilled: [],
    diagnostics: { helpCount: 0, totals: { unfilled: 0, assigned: 1 } },
  });

  const second = computeTbAssignmentPlanHash({
    diagnostics: { totals: { assigned: 1, unfilled: 0 }, helpCount: 0 },
    unfilled: [],
    assignments: [{ unit: { relic: 7, baseId: 'UNIT_A' }, playerId: 'P1', slotId: 'S1' }],
    inputFingerprint: 'source-abc',
    versionNumber: 4,
    rotePhase: 'P6',
    planId: 'plan-1',
    guildId: 'guild-1',
  });

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, second);
});

test('assignment hash changes when a publish-relevant assignment changes', () => {
  const base = {
    guildId: 'guild-1',
    planId: 'plan-1',
    rotePhase: 'P6',
    versionNumber: 1,
    inputFingerprint: 'source-abc',
    assignments: [{ slotId: 'S1', playerId: 'P1', baseId: 'UNIT_A' }],
    unfilled: [],
    diagnostics: { helpCount: 0 },
  };

  const changed = {
    ...base,
    assignments: [{ slotId: 'S1', playerId: 'P2', baseId: 'UNIT_A' }],
  };

  assert.notEqual(computeTbAssignmentPlanHash(base), computeTbAssignmentPlanHash(changed));
});

test('persisted run hash can be recomputed and verified exactly', () => {
  const run = {
    guild_id: 'guild-1',
    plan_id: 'plan-1',
    rote_phase: 'P3',
    version_number: 2,
    input_fingerprint: 'fp-2',
    assignments: [{ slotId: 'S2', playerId: 'P8' }],
    unfilled: [{ slotId: 'S9', reason: 'HELP' }],
    diagnostics: { helpCount: 1 },
  };
  run.plan_hash = recomputeTbAssignmentRunHash(run);

  assert.equal(verifyTbAssignmentRunHash(run).valid, true);
  assert.equal(verifyTbAssignmentRunHash({ ...run, assignments: [{ slotId: 'S2', playerId: 'P9' }] }).valid, false);
});

test('normalizeRotePhase fails closed outside P1 through P6', () => {
  assert.equal(normalizeRotePhase('p1'), 'P1');
  assert.throws(() => normalizeRotePhase('P7'), (error) => error?.code === 'INVALID_ROTE_PHASE');
});
