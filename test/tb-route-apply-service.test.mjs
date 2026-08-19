import test from 'node:test';
import assert from 'node:assert/strict';
import { createTbRouteApplyService } from '../tb-route-apply-service.mjs';

const FINGERPRINT = 'a'.repeat(64);
const OTHER_FINGERPRINT = 'b'.repeat(64);

function preview(overrides = {}) {
  return {
    configured: true,
    event: { id: '11111111-1111-4111-8111-111111111111', currentPhase: 'P2' },
    zones: [
      { planetId: 'geonosis', currentTp: 120_000_000, currentStars: 0, targetStars: 1, updatedAt: '2026-08-19T13:00:00.000Z' },
      { planetId: 'bracca', currentTp: 100_000_000, currentStars: 0, targetStars: 1, updatedAt: '2026-08-19T13:00:01.000Z', lockedByOfficer: true },
    ],
    plan: {
      inputFingerprint: FINGERPRINT,
      riskMode: 'safe',
      remainingGuildDeploymentTp: 60_000_000,
      blockedZones: 0,
      thresholdReference: { version: '2026-08-19' },
      zones: [
        {
          planetId: 'geonosis', priority: 1, command: 'attack', commandLabel: 'ATTACK', explanation: 'Attack first, then deploy safely.',
          remainingMissionTp: 10_000_000, remainingOperationTp: 5_000_000, lockedByOfficer: false, commandSource: 'optimizer',
        },
        {
          planetId: 'bracca', priority: 2, command: 'stop', commandLabel: 'STOP', explanation: 'Officer lock preserved.',
          remainingMissionTp: 0, remainingOperationTp: 0, lockedByOfficer: true, commandSource: 'officer-lock',
        },
      ],
    },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    expectedInputFingerprint: FINGERPRINT,
    remainingGuildDeploymentTp: 60_000_000,
    remainingTpByPlanet: {
      geonosis: { priority: 1, remainingMissionTp: 10_000_000, remainingOperationTp: 5_000_000 },
      bracca: { priority: 2, remainingMissionTp: 0, remainingOperationTp: 0 },
    },
    ...overrides,
  };
}

test('route apply requires a preview fingerprint before any preview or database call', async () => {
  let previewCalled = false;
  let rpcCalled = false;
  const service = createTbRouteApplyService({
    previewService: { async preview() { previewCalled = true; return preview(); } },
    store: { async rpc() { rpcCalled = true; return {}; } },
  });
  await assert.rejects(
    () => service.apply('user-1', input({ expectedInputFingerprint: '' })),
    (error) => error.status === 400 && error.code === 'ROUTE_PREVIEW_FINGERPRINT_REQUIRED',
  );
  assert.equal(previewCalled, false);
  assert.equal(rpcCalled, false);
});

test('route apply rejects a stale preview before opening the database transaction', async () => {
  let rpcCalled = false;
  const service = createTbRouteApplyService({
    previewService: { async preview() { return preview({ plan: { ...preview().plan, inputFingerprint: OTHER_FINGERPRINT } }); } },
    store: { async rpc() { rpcCalled = true; return {}; } },
  });
  await assert.rejects(
    () => service.apply('user-1', input()),
    (error) => error.status === 409
      && error.code === 'ROUTE_PREVIEW_STALE'
      && error.details.currentInputFingerprint === OTHER_FINGERPRINT,
  );
  assert.equal(rpcCalled, false);
});

test('blocked optimizer route cannot be applied', async () => {
  let rpcCalled = false;
  const blockedPreview = preview({
    plan: {
      ...preview().plan,
      blockedZones: 1,
      zones: [
        { ...preview().plan.zones[0], blocked: true },
        preview().plan.zones[1],
      ],
    },
  });
  const service = createTbRouteApplyService({
    previewService: { async preview() { return blockedPreview; } },
    store: { async rpc() { rpcCalled = true; return {}; } },
  });
  await assert.rejects(
    () => service.apply('user-1', input()),
    (error) => error.status === 409
      && error.code === 'ROUTE_HAS_BLOCKERS'
      && error.details.blockedPlanets.includes('geonosis'),
  );
  assert.equal(rpcCalled, false);
});

test('route apply sends only unlocked commands and preserves server zone versions', async () => {
  let rpcName = '';
  let rpcArgs = null;
  const service = createTbRouteApplyService({
    previewService: {
      async preview(userId, body) {
        assert.equal(userId, 'user-1');
        assert.equal(body.remainingGuildDeploymentTp, 60_000_000);
        assert.equal(body.remainingTpByPlanet.geonosis.priority, 1);
        return preview();
      },
    },
    store: {
      async rpc(name, args) {
        rpcName = name;
        rpcArgs = args;
        return { snapshotId: '22222222-2222-4222-8222-222222222222', inputFingerprint: FINGERPRINT, appliedZoneCount: 1, appliedAt: '2026-08-19T13:10:00.000Z' };
      },
    },
  });
  const result = await service.apply('user-1', input());
  assert.equal(rpcName, 'apply_guild_tb_route_plan');
  assert.equal(rpcArgs.p_event_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(rpcArgs.p_phase, 'P2');
  assert.equal(rpcArgs.p_input_fingerprint, FINGERPRINT);
  assert.equal(rpcArgs.p_zone_updates.length, 1);
  assert.equal(rpcArgs.p_zone_updates[0].planetId, 'geonosis');
  assert.equal(rpcArgs.p_zone_updates[0].command, 'attack');
  assert.equal(rpcArgs.p_zone_updates[0].expectedUpdatedAt, '2026-08-19T13:00:00.000Z');
  assert.match(rpcArgs.p_zone_updates[0].commandMessage, /^ATTACK:/);
  assert.equal(rpcArgs.p_zone_state_json.length, 2);
  assert.deepEqual(rpcArgs.p_projection_inputs_json.remainingTpByPlanet.geonosis, { priority: 1, remainingMissionTp: 10_000_000, remainingOperationTp: 5_000_000 });
  assert.equal(result.applied, true);
  assert.equal(result.appliedZoneCount, 1);
  assert.equal(result.lockedZoneCount, 1);
  assert.equal(result.commands.find((row) => row.planetId === 'bracca').applied, false);
});

test('route apply fails closed when an unlocked territory lacks a durable version timestamp', async () => {
  const stale = preview({ zones: [{ ...preview().zones[0], updatedAt: '' }, preview().zones[1]] });
  let rpcCalled = false;
  const service = createTbRouteApplyService({
    previewService: { async preview() { return stale; } },
    store: { async rpc() { rpcCalled = true; return {}; } },
  });
  await assert.rejects(
    () => service.apply('user-1', input()),
    (error) => error.status === 409 && error.code === 'ROUTE_STATE_VERSION_REQUIRED',
  );
  assert.equal(rpcCalled, false);
});

test('database stale-state rejection is translated to a recalculate response', async () => {
  const service = createTbRouteApplyService({
    previewService: { async preview() { return preview(); } },
    store: { async rpc() { throw new Error('TB_ROUTE_STATE_STALE'); } },
  });
  await assert.rejects(
    () => service.apply('user-1', input()),
    (error) => error.status === 409 && error.code === 'ROUTE_PREVIEW_STALE',
  );
});
