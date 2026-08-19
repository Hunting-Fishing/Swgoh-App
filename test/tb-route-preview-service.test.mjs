import test from 'node:test';
import assert from 'node:assert/strict';
import { createTbRoutePreviewService } from '../tb-route-preview-service.mjs';

function snapshot(overrides = {}) {
  return {
    configured: true,
    identity: { allyCode: '123456789', guildId: 'guild-1' },
    event: { id: 'event-1', currentPhase: 'P2', sourceKind: 'officer' },
    zones: [
      { planetId: 'geonosis', phase: 'P2', currentTp: 120_000_000, currentStars: 0, targetStars: 1, preloadCapTp: null, commandState: 'attack' },
      { planetId: 'bracca', phase: 'P2', currentTp: 100_000_000, currentStars: 0, targetStars: 1, preloadCapTp: 140_000_000, commandState: 'preload' },
    ],
    evidenceBoundary: 'officer event state',
    ...overrides,
  };
}

function explicitInputs(overrides = {}) {
  return {
    remainingGuildDeploymentTp: 60_000_000,
    remainingTpByPlanet: {
      geonosis: { remainingMissionTp: 10_000_000, remainingOperationTp: 5_000_000 },
      bracca: { remainingMissionTp: 0, remainingOperationTp: 0 },
    },
    ...overrides,
  };
}

const officerOperations = {
  async requireOfficer(userId, allyCode) {
    assert.equal(userId, 'user-1');
    assert.equal(allyCode, '123456789');
    return { userId, guild: { id: 'guild-1', name: 'Test Guild' } };
  },
};

test('no active event returns an unconfigured preview without invoking planner or officer gate', async () => {
  let plannerCalled = false;
  let officerCalled = false;
  const service = createTbRoutePreviewService({
    events: { async eventSnapshot() { return { configured: false, event: null, zones: [], evidenceBoundary: 'no event' }; } },
    operations: { async requireOfficer() { officerCalled = true; return {}; } },
    planner() { plannerCalled = true; return {}; },
  });
  const result = await service.preview('user-1', explicitInputs());
  assert.equal(result.configured, false);
  assert.equal(result.plan, null);
  assert.equal(plannerCalled, false);
  assert.equal(officerCalled, false);
});

test('configured route preview is denied when existing Guild officer authorization denies access', async () => {
  const service = createTbRoutePreviewService({
    events: { async eventSnapshot() { return snapshot(); } },
    operations: {
      async requireOfficer() {
        const error = new Error('Officer access required.');
        error.status = 403;
        error.code = 'OFFICER_REQUIRED';
        throw error;
      },
    },
  });
  await assert.rejects(
    () => service.preview('user-1', explicitInputs()),
    (error) => error.status === 403 && error.code === 'OFFICER_REQUIRED',
  );
});

test('remaining Guild deployment TP must be explicit', async () => {
  const service = createTbRoutePreviewService({ events: { async eventSnapshot() { return snapshot(); } }, operations: officerOperations });
  await assert.rejects(
    () => service.preview('user-1', { remainingTpByPlanet: explicitInputs().remainingTpByPlanet }),
    (error) => error.status === 400 && error.code === 'ROUTE_INPUT_REQUIRED',
  );
});

test('every configured territory requires explicit mission and Operation TP inputs', async () => {
  const service = createTbRoutePreviewService({ events: { async eventSnapshot() { return snapshot(); } }, operations: officerOperations });
  await assert.rejects(
    () => service.preview('user-1', {
      remainingGuildDeploymentTp: 60_000_000,
      remainingTpByPlanet: { geonosis: { remainingMissionTp: 0, remainingOperationTp: 0 } },
    }),
    (error) => error.status === 400
      && error.code === 'ROUTE_ZONE_INPUTS_INCOMPLETE'
      && error.details.missingPlanets.includes('bracca'),
  );
});

test('preview joins explicit remaining TP to server-owned zone state', async () => {
  let plannerInput = null;
  const service = createTbRoutePreviewService({
    events: { async eventSnapshot(userId) { assert.equal(userId, 'user-1'); return snapshot(); } },
    operations: officerOperations,
    planner(input) {
      plannerInput = input;
      return { algorithm: 'test-plan', zones: [] };
    },
  });
  const result = await service.preview('user-1', explicitInputs({
    currentTp: 999_999_999,
    targetStars: 3,
  }));
  assert.equal(result.configured, true);
  assert.equal(result.persisted, false);
  assert.equal(result.inputSource, 'officer-preview');
  assert.equal(result.officer.guildId, 'guild-1');
  assert.equal(plannerInput.remainingGuildDeploymentTp, 60_000_000);
  assert.equal(plannerInput.zones[0].currentTp, 120_000_000, 'preview body cannot replace durable current TP');
  assert.equal(plannerInput.zones[0].targetStars, 1, 'preview body cannot replace durable target stars');
  assert.equal(plannerInput.zones[0].remainingMissionTp, 10_000_000);
  assert.equal(plannerInput.zones[0].remainingOperationTp, 5_000_000);
});

test('real planner respects durable preload cap after explicit remaining TP is supplied', async () => {
  const service = createTbRoutePreviewService({ events: { async eventSnapshot() { return snapshot(); } }, operations: officerOperations });
  const result = await service.preview('user-1', explicitInputs());
  const bracca = result.plan.zones.find((zone) => zone.planetId === 'bracca');
  assert.equal(bracca.command, 'preload');
  assert.equal(bracca.safeCeilingTp, 140_000_000);
  assert.ok(bracca.currentTp + bracca.recommendedDeploymentTp <= 140_000_000);
});
