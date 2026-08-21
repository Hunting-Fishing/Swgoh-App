import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GAC_WAR_ROOM_RELEASE_STATUS } from '../gac-war-room-release-status.mjs';
import { attackOrder, territoryStates } from '../public/gac-attack-order-model.js';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('GAC War Room release status closes every planned implementation milestone', () => {
  assert.equal(GAC_WAR_ROOM_RELEASE_STATUS.state, 'code-complete');
  assert.equal(GAC_WAR_ROOM_RELEASE_STATUS.completionPct, 100);
  assert.ok(Object.values(GAC_WAR_ROOM_RELEASE_STATUS.manualWarRoom).every((value) => value === 'complete'));
  assert.equal(GAC_WAR_ROOM_RELEASE_STATUS.sourceOfTruth, 'verified-owner-server-state');
  assert.equal(GAC_WAR_ROOM_RELEASE_STATUS.acceptance.sourceContract, 'complete');
  assert.equal(GAC_WAR_ROOM_RELEASE_STATUS.acceptance.githubActions, 'blocked-before-steps');
  assert.notEqual(GAC_WAR_ROOM_RELEASE_STATUS.acceptance.githubActions, 'passed');
});

test('runtime bootstrap loads the complete manual War Room lifecycle', async () => {
  const bootstrap = await source('public/asset-resilience.js');
  for (const module of [
    'gac-manual-war-room-bridge.js',
    'gac-manual-cleanup-parity.js',
    'gac-manual-datacron-lock.js',
    'gac-attack-order-ui.js',
    'gac-manual-execution-contract.js',
    'gac-fleet-round-operations.js',
    'gac-fleet-cleanup-control.js',
    'gac-fleet-manual-parity.js',
  ]) assert.match(bootstrap, new RegExp(`import ['"]\\./${module.replaceAll('.', '\\.')}`), module);
});

test('manual attack planning stays server-backed and whole-board allocated', async () => {
  const bridge = await source('public/gac-manual-war-room-bridge.js');
  assert.match(bridge, /buildOpenWarRoomPlan/);
  assert.match(bridge, /\/api\/gac\/attack-plan\//);
  assert.match(bridge, /\/api\/gac\/current-board\//);
  assert.match(bridge, /credentials: 'same-origin'/);
  assert.match(bridge, /gac-war-room-updated/);
});

test('direct battle execution uses the exact B08 fingerprint on manual and saved cards', async () => {
  const execution = await source('public/gac-battle-execution-ui.js');
  assert.match(execution, /executionConfirmation:checklist\.fingerprint/);
  assert.match(execution, /gac-visible-defense\[data-defense-id\]/);
  assert.match(execution, /gac-saved-board-card/);
  assert.match(execution, /BEGIN ATTEMPT/);
});

test('manual Datacron lock reuses eligibility truth and submits exact live Datacron id', async () => {
  const dc = await source('public/gac-manual-datacron-lock.js');
  assert.match(dc, /bestCoverage/);
  assert.match(dc, /loadEligibilityContext/);
  assert.match(dc, /datacronId/);
  assert.match(dc, /method:'POST'/);
  assert.match(dc, /NO DATACRON RECOMMENDED/);
});

test('manual cleanup requires recorded survivor truth and never restores original-defense retry', async () => {
  const cleanup = await source('public/gac-manual-cleanup-parity.js');
  assert.match(cleanup, /cleanupCandidatePlan/);
  assert.match(cleanup, /cleanupAttackBrief/);
  assert.match(cleanup, /findStrategyGuidance/);
  assert.match(cleanup, /ORIGINAL-DEFENSE RETRY BLOCKED/);
  assert.match(cleanup, /SOURCE-GATED EXECUTION/);
  assert.doesNotMatch(cleanup, /data-gac-manual-cleanup-(?:tm|health|protection)/i);
});

test('territory route uses canonical unlock topology and includes fleet state', async () => {
  const ui = await source('public/gac-attack-order-ui.js');
  assert.match(ui, /\/api\/gac\/current-fleet-board\//);
  assert.match(ui, /\/api\/gac\/fleet-attack-plan\//);
  assert.match(ui, /Operational priority only/);
  assert.doesNotMatch(ui, /predicted win probability|guaranteed win/i);

  const defenses = [
    { id: 1, zone: 'FRONT-TOP', slot: 0 },
    { id: 2, zone: 'BACK-TOP', slot: 0 },
    { id: 3, zone: 'FRONT-BOTTOM', slot: 0 },
    { id: 4, zone: 'BACK-BOTTOM', slot: 0 },
  ];
  let states = territoryStates(defenses, []);
  assert.equal(states['BACK-TOP'].unlocked, false);
  assert.equal(states['BACK-BOTTOM'].unlocked, false);
  states = territoryStates(defenses, [{ defenseId: 1, status: 'win' }, { defenseId: 3, status: 'win' }]);
  assert.equal(states['BACK-TOP'].unlocked, true);
  assert.equal(states['BACK-BOTTOM'].unlocked, true);
  const route = attackOrder({ defenses, assignments: [{ defenseId: 1, status: 'win' }, { defenseId: 3, status: 'win' }, { defenseId: 2, status: 'planned', planKind: 'fleet' }] });
  assert.equal(route.next.defenseId, 2);
});

test('manual fleet bridge reuses canonical fleet lifecycle and keeps fleet Datacrons inapplicable', async () => {
  const fleet = await source('public/gac-fleet-manual-parity.js');
  const api = await source('gac-fleet-attack-plan-api.mjs');
  assert.match(fleet, /__gacFleetCanonicalOperations/);
  assert.match(fleet, /data-gac-fleet-lock/);
  assert.match(fleet, /data-gac-fleet-status/);
  assert.match(fleet, /data-gac-fleet-result/);
  assert.match(fleet, /data-gac-fleet-cleanup-control/);
  assert.match(api, /Datacrons do not apply to fleet attacks/);
  assert.match(api, /starters\.length !== 3/);
});

test('server attack API remains authoritative for pre-battle and live-roster validation', async () => {
  const api = await source('gac-attack-plan-api.mjs');
  assert.match(api, /assertExecutionConfirmation/);
  assert.match(api, /assertExecutionLiveState/);
  assert.match(api, /The locked enemy defense is no longer present/);
  assert.match(api, /planned counter contains units not present in your current live roster/i);
});

test('release truth boundaries preserve unknown state and source gates', () => {
  const truth = GAC_WAR_ROOM_RELEASE_STATUS.truthBoundaries;
  assert.equal(truth.unknownPostBattleState, 'preserved');
  assert.equal(truth.cleanupRequiresConfirmedSurvivors, true);
  assert.equal(truth.tacticalExecutionSourceGated, true);
  assert.equal(truth.fleetStarterRolesUserConfirmed, true);
  assert.equal(truth.fleetDatacrons, 'not-applicable');
  assert.equal(truth.noFabricatedWinProbability, true);
});
