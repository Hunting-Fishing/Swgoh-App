import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoteRoutePlan } from '../tb-route-planning-service.mjs';

function zone(overrides = {}) {
  return {
    phase: 'P2',
    planet_id: 'geonosis',
    priority: 1,
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
  assert.match(plan.inputFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(plan.thresholdReference.sourceKind, 'community-reference');
  assert.equal(plan.zones[0].priority, 1);
  assert.equal(plan.zones[0].targetThresholdTp, 148_125_000);
  assert.equal(plan.zones[0].recommendedDeploymentTp, 28_125_000);
  assert.equal(plan.rejectedThresholdZones.length, 0);
});

test('planner refuses a hidden array-order fallback when route priority is missing', () => {
  assert.throws(
    () => buildRoteRoutePlan({
      remainingGuildDeploymentTp: 40_000_000,
      zones: [zone({ priority: undefined })],
    }),
    (error) => error.status === 400
      && error.code === 'ROUTE_PRIORITY_REQUIRED'
      && error.details.missingPlanets.includes('geonosis'),
  );
});

test('planner refuses duplicate route priorities before allocating shared deployment', () => {
  assert.throws(
    () => buildRoteRoutePlan({
      remainingGuildDeploymentTp: 40_000_000,
      zones: [
        zone({ planet_id: 'geonosis', priority: 1 }),
        zone({ planet_id: 'bracca', priority: 1, current_tp: 100_000_000 }),
      ],
    }),
    (error) => error.status === 400
      && error.code === 'ROUTE_PRIORITY_DUPLICATE'
      && error.details.duplicatePriorities[0].planets.includes('geonosis')
      && error.details.duplicatePriorities[0].planets.includes('bracca'),
  );
});

test('input fingerprint is deterministic for equivalent inputs and changes with route state', () => {
  const input = {
    remainingGuildDeploymentTp: 40_000_000,
    riskMode: 'safe',
    zones: [
      zone({ planet_id: 'geonosis', priority: 1 }),
      zone({ planet_id: 'bracca', priority: 2, current_tp: 100_000_000 }),
    ],
  };
  const first = buildRoteRoutePlan(input);
  const reordered = buildRoteRoutePlan({ ...input, zones: [...input.zones].reverse() });
  const changed = buildRoteRoutePlan({ ...input, zones: [zone({ planet_id: 'geonosis', priority: 1, current_tp: 120_000_001 }), input.zones[1]] });
  assert.equal(first.inputFingerprint, reordered.inputFingerprint);
  assert.notEqual(first.inputFingerprint, changed.inputFingerprint);
});

test('priority is part of the optimizer fingerprint', () => {
  const first = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 40_000_000,
    zones: [
      zone({ planet_id: 'geonosis', priority: 1 }),
      zone({ planet_id: 'bracca', priority: 2, current_tp: 100_000_000 }),
    ],
  });
  const reversedPriority = buildRoteRoutePlan({
    remainingGuildDeploymentTp: 40_000_000,
    zones: [
      zone({ planet_id: 'geonosis', priority: 2 }),
      zone({ planet_id: 'bracca', priority: 1, current_tp: 100_000_000 }),
    ],
  });
  assert.notEqual(first.inputFingerprint, reversedPriority.inputFingerprint);
});

test('officer command and lock state participate in the optimizer fingerprint', () => {
  const open = buildRoteRoutePlan({ remainingGuildDeploymentTp: 40_000_000, zones: [zone({ command_state: 'attack', locked_by_officer: false })] });
  const locked = buildRoteRoutePlan({ remainingGuildDeploymentTp: 40_000_000, zones: [zone({ command_state: 'attack', locked_by_officer: true })] });
  assert.notEqual(open.inputFingerprint, locked.inputFingerprint);
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
