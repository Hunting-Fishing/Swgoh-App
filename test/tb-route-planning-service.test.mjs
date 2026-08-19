import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoteRoutePlan } from '../tb-route-planning-service.mjs';

function zone(overrides = {}) {
  return {
    phase: 'P2',
    planet_id: 'geonosis',
    current_tp: 120_000_000,
    current_stars: 0,
    target_stars: 1,
    remainingMissionTp: 0,
    remainingOperationTp: 0,
    ...overrides,
  };
}

test('planner decorates active ROTE zone with versioned thresholds and optimizes exact target', () => {
  const plan = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 40_000_000,
    zones: [zone()],
  });
  assert.equal(plan.planner, 'rote-route-planning-service-v1');
  assert.equal(plan.thresholdReference.sourceKind, 'community-reference');
  assert.equal(plan.zones[0].targetThresholdTp, 148_125_000);
  assert.equal(plan.zones[0].recommendedDeploymentTp, 28_125_000);
  assert.equal(plan.rejectedThresholdZones.length, 0);
});

test('phase mismatch rejects static threshold decoration and fails closed', () => {
  const plan = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({ phase: 'P3' })],
  });
  assert.equal(plan.rejectedThresholdZones.length, 1);
  assert.equal(plan.rejectedThresholdZones[0].planetId, 'geonosis');
  assert.equal(plan.rejectedThresholdZones[0].code, 'ROTE_PHASE_MISMATCH');
  assert.equal(plan.zones[0].blocked, true);
  assert.equal(plan.zones[0].blockingCode, 'STAR_THRESHOLDS_REQUIRED');
  assert.equal(plan.zones[0].recommendedDeploymentTp, 0);
});

test('Zeffo is mapped to its playable P3 phase', () => {
  const plan = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 200_000_000,
    zones: [zone({ phase: 'P3', planet_id: 'zeffo', current_tp: 100_000_000 })],
  });
  assert.equal(plan.rejectedThresholdZones.length, 0);
  assert.equal(plan.zones[0].targetThresholdTp, 143_589_583);
  assert.equal(plan.zones[0].recommendedDeploymentTp, 43_589_583);
});

test('Mandalore is mapped to its playable P4 phase', () => {
  const plan = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 200_000_000,
    zones: [zone({ phase: 'P4', planet_id: 'mandalore', current_tp: 150_000_000 })],
  });
  assert.equal(plan.rejectedThresholdZones.length, 0);
  assert.equal(plan.zones[0].targetThresholdTp, 197_748_650);
  assert.equal(plan.zones[0].recommendedDeploymentTp, 47_748_650);
});

test('explicit preload cap remains stricter than static star ceiling', () => {
  const plan = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({
      current_tp: 120_000_000,
      target_stars: 1,
      preload_cap_tp: 140_000_000,
      remainingMissionTp: 5_000_000,
      remainingOperationTp: 0,
    })],
  });
  const geo = plan.zones[0];
  assert.equal(geo.command, 'preload');
  assert.equal(geo.safeCeilingTp, 140_000_000);
  assert.equal(geo.recommendedDeploymentTp, 15_000_000);
  assert.ok(120_000_000 + 5_000_000 + geo.recommendedDeploymentTp <= 140_000_000);
});

test('unknown territory retains optimizer fail-closed behavior', () => {
  const plan = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({ planet_id: 'unknown-world' })],
  });
  assert.equal(plan.zones[0].blocked, true);
  assert.equal(plan.zones[0].blockingCode, 'STAR_THRESHOLDS_REQUIRED');
});
