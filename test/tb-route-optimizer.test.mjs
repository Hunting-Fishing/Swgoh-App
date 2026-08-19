import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeTbRoute } from '../tb-route-optimizer.mjs';

const thresholds = [100_000_000, 200_000_000, 300_000_000];

function zone(overrides = {}) {
  return {
    planetId: 'geonosis',
    planetName: 'Geonosis',
    currentTp: 120_000_000,
    currentStars: 1,
    targetStars: 2,
    starThresholds: thresholds,
    remainingMissionTp: 20_000_000,
    remainingOperationTp: 5_000_000,
    ...overrides,
  };
}

test('explicit preload cap is never crossed', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 80_000_000,
    zones: [zone({ preloadCapTp: 148_124_999, remainingMissionTp: 0, remainingOperationTp: 0 })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'preload');
  assert.equal(geo.safeCeilingTp, 148_124_999);
  assert.equal(geo.recommendedDeploymentTp, 28_124_999);
  assert.ok(geo.currentTp + geo.recommendedDeploymentTp <= geo.preloadCapTp);
});

test('preload deployment reserves headroom for known mission and Operation TP', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 80_000_000,
    zones: [zone({ preloadCapTp: 148_124_999 })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'preload');
  assert.equal(geo.recommendedDeploymentTp, 3_124_999);
  assert.ok(geo.currentTp + geo.remainingMissionTp + geo.remainingOperationTp + geo.recommendedDeploymentTp <= geo.preloadCapTp);
});

test('known actions that can exceed preload cap block deployment', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 80_000_000,
    zones: [zone({ preloadCapTp: 130_000_000, remainingMissionTp: 20_000_000, remainingOperationTp: 5_000_000 })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'preload');
  assert.equal(geo.blocked, true);
  assert.equal(geo.blockingCode, 'KNOWN_ACTIONS_EXCEED_PRELOAD_CAP');
  assert.equal(geo.recommendedDeploymentTp, 0);
});

test('preload at the cap emits STOP and zero deployment', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 80_000_000,
    zones: [zone({ currentTp: 148_124_999, preloadCapTp: 148_124_999 })],
  });
  assert.equal(result.zones[0].command, 'stop');
  assert.equal(result.zones[0].recommendedDeploymentTp, 0);
  assert.equal(result.zones[0].blockingCode, 'PRELOAD_CAP_REACHED');
});

test('officer lock is preserved while unsafe PRELOAD without a cap fails closed', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 80_000_000,
    zones: [zone({ commandState: 'preload', lockedByOfficer: true, preloadCapTp: null })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'preload');
  assert.equal(geo.commandSource, 'officer-lock');
  assert.equal(geo.blocked, true);
  assert.equal(geo.blockingCode, 'PRELOAD_CAP_REQUIRED');
  assert.equal(geo.recommendedDeploymentTp, 0);
});

test('missing star thresholds fails closed for an unmet star target', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 80_000_000,
    zones: [zone({ starThresholds: [] })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'hold');
  assert.equal(geo.blocked, true);
  assert.equal(geo.blockingCode, 'STAR_THRESHOLDS_REQUIRED');
  assert.equal(geo.recommendedDeploymentTp, 0);
});

test('known mission TP produces ATTACK-first command and exact residual deployment', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone()],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'attack');
  assert.equal(geo.requestedDeploymentTp, 55_000_000);
  assert.equal(geo.recommendedDeploymentTp, 55_000_000);
});

test('known actions that exceed the protected next-star ceiling fail closed', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({ currentTp: 190_000_000, currentStars: 1, targetStars: 2, remainingMissionTp: 120_000_000, remainingOperationTp: 0 })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'hold');
  assert.equal(geo.blocked, true);
  assert.equal(geo.blockingCode, 'KNOWN_ACTIONS_EXCEED_SAFE_CEILING');
  assert.equal(geo.recommendedDeploymentTp, 0);
});

test('global deployment capacity is allocated deterministically by route priority', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 70_000_000,
    zones: [
      zone({ planetId: 'bracca', planetName: 'Bracca', priority: 2, currentTp: 150_000_000, remainingMissionTp: 0, remainingOperationTp: 0 }),
      zone({ planetId: 'geonosis', planetName: 'Geonosis', priority: 1, currentTp: 150_000_000, remainingMissionTp: 0, remainingOperationTp: 0 }),
    ],
  });
  assert.deepEqual(result.zones.map((row) => row.planetId), ['geonosis','bracca']);
  assert.equal(result.zones[0].recommendedDeploymentTp, 50_000_000);
  assert.equal(result.zones[1].recommendedDeploymentTp, 20_000_000);
  assert.equal(result.allocatedDeploymentTp, 70_000_000);
  assert.equal(result.unallocatedDeploymentTp, 0);
});

test('target already satisfied becomes HOLD', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({ currentTp: 210_000_000, currentStars: 2, targetStars: 2 })],
  });
  assert.equal(result.zones[0].command, 'hold');
  assert.equal(result.zones[0].recommendedDeploymentTp, 0);
});

test('target-star route exposes next-star safe ceiling', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({ currentTp: 150_000_000, remainingMissionTp: 0, remainingOperationTp: 0 })],
  });
  const geo = result.zones[0];
  assert.equal(geo.safeCeilingTp, 299_999_999);
  assert.equal(geo.command, 'deploy');
  assert.equal(geo.recommendedDeploymentTp, 50_000_000);
});

test('locked STOP remains untouched', () => {
  const result = optimizeTbRoute({
    remainingGuildDeploymentTp: 100_000_000,
    zones: [zone({ commandState: 'stop', lockedByOfficer: true, commandMessage: 'Do not touch this zone.' })],
  });
  const geo = result.zones[0];
  assert.equal(geo.command, 'stop');
  assert.equal(geo.commandSource, 'officer-lock');
  assert.equal(geo.recommendedDeploymentTp, 0);
  assert.equal(geo.explanation, 'Do not touch this zone.');
});
