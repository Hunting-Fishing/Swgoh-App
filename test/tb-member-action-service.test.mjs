import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTbMemberTasks, todayTaskSummary } from '../tb-member-action-service.mjs';

const geos = [
  ['GEONOSIANBROODALPHA', 'Geonosian Brood Alpha'],
  ['GEONOSIANSOLDIER', 'Geonosian Soldier'],
  ['GEONOSIANSPY', 'Geonosian Spy'],
  ['SUNFAC', 'Sun Fac'],
  ['POGGLETHELESSER', 'Poggle the Lesser'],
].map(([baseId, name]) => ({
  baseId,
  name,
  unitType: 'Character',
  alignment: 'Dark',
  stars: 7,
  relic: 6,
  gear: 13,
  power: 30000,
  factions: ['Geonosian'],
  categories: ['Geonosian'],
}));

const vader = {
  baseId: 'VADER',
  name: 'Darth Vader',
  unitType: 'Character',
  alignment: 'Dark',
  stars: 7,
  relic: 6,
  gear: 13,
  power: 35000,
  factions: ['Empire', 'Sith'],
  categories: ['Empire', 'Sith'],
};

const rosterBody = { units: [...geos, vader], ships: [] };
const event = { id: 'event-1', current_phase: 'P2' };
const operationAssignments = [{ phase: 'P2', slotId: 'geo-op-1', baseId: 'VADER', unitName: 'Darth Vader', planetId: 'geonosis' }];

function zone(commandState, overrides = {}) {
  return [{ phase: 'P2', planet_id: 'geonosis', command_state: commandState, command_message: commandState === 'stop' ? 'No actions here.' : '', ...overrides }];
}

test('Today queue puts Operations before playable missions and deployment', () => {
  const tasks = buildTbMemberTasks({ event, zones: zone('attack'), rosterBody, operationAssignments });
  assert.ok(tasks.length > 2);
  assert.equal(tasks[0].actionType, 'operation');
  assert.ok(tasks.some((task) => task.actionType === 'combat'));
  assert.equal(tasks.at(-1).actionType, 'deploy');
  assert.deepEqual(tasks.map((task) => task.order), Array.from({ length: tasks.length }, (_, index) => index + 1));
  assert.ok(tasks.filter((task) => ['special', 'combat', 'fleet'].includes(task.actionType)).every((task) => task.payload.operationsReservedCount === 1));
  const summary = todayTaskSummary(tasks);
  assert.equal(summary.hasOperations, true);
  assert.equal(summary.hasDeployment, true);
  assert.ok(summary.missionTasks > 0);
});

test('Operations-assigned units are removed before mission readiness is calculated', () => {
  const spyAssignment = [{ phase: 'P2', slotId: 'geo-op-spy', baseId: 'GEONOSIANSPY', unitName: 'Geonosian Spy', planetId: 'geonosis' }];
  const tasks = buildTbMemberTasks({ event, zones: zone('attack'), rosterBody, operationAssignments: spyAssignment });
  assert.equal(tasks[0].actionType, 'operation');
  const geonosianMission = tasks.find((task) => /Geonosians/i.test(String(task.payload?.missionName || '')));
  assert.equal(geonosianMission, undefined, 'The five-Geonosian mission must not be offered after Geonosian Spy is reserved for Operations');
  assert.ok(tasks.some((task) => task.actionType === 'combat'), 'Other legal Dark Side mission work may remain available');
});

test('STOP command suppresses missions and deployment while keeping the Operation assignment visible', () => {
  const tasks = buildTbMemberTasks({ event, zones: zone('stop'), rosterBody, operationAssignments });
  assert.deepEqual(tasks.map((task) => task.actionType).sort(), ['acknowledge', 'operation'].sort());
  assert.ok(tasks.find((task) => task.actionType === 'acknowledge')?.explanation.includes('No actions here.'));
});

test('PRELOAD keeps missions available and creates a cap-aware deployment task', () => {
  const tasks = buildTbMemberTasks({
    event,
    zones: zone('preload', { current_tp: 120000000, preload_cap_tp: 148124999 }),
    rosterBody,
    operationAssignments: [],
  });
  assert.ok(tasks.some((task) => task.actionType === 'combat'));
  const preload = tasks.find((task) => task.actionType === 'deploy');
  assert.ok(preload);
  assert.equal(preload.payload.preloadCapTp, 148124999);
  assert.match(preload.explanation, /do not cross the cap/i);
});

test('PRELOAD without a TP cap fails closed and does not tell a member to deploy', () => {
  const tasks = buildTbMemberTasks({ event, zones: zone('preload'), rosterBody, operationAssignments: [] });
  assert.equal(tasks.some((task) => task.actionType === 'deploy'), false);
  const warning = tasks.find((task) => task.actionType === 'acknowledge');
  assert.ok(warning);
  assert.equal(warning.payload.capMissing, true);
  assert.match(warning.explanation, /do not deploy/i);
});

test('PRELOAD at or above the cap becomes a stop-deploy warning', () => {
  const tasks = buildTbMemberTasks({
    event,
    zones: zone('preload', { current_tp: 148125000, preload_cap_tp: 148124999 }),
    rosterBody,
    operationAssignments: [],
  });
  assert.equal(tasks.some((task) => task.actionType === 'deploy'), false);
  const warning = tasks.find((task) => task.actionType === 'acknowledge');
  assert.equal(warning?.payload?.capReached, true);
  assert.match(warning?.title || '', /CAP REACHED/i);
});

test('unconfigured territories are not inferred as active live tasks', () => {
  const tasks = buildTbMemberTasks({ event, zones: [], rosterBody, operationAssignments: [] });
  assert.deepEqual(tasks, []);
});

test('an explicitly configured bonus territory participates in its playable next phase', () => {
  const tasks = buildTbMemberTasks({
    event: { id: 'event-2', current_phase: 'P3' },
    zones: [{ phase: 'P3', planet_id: 'zeffo', command_state: 'deploy', command_message: 'Zeffo open.' }],
    rosterBody: { units: [], ships: [] },
    operationAssignments: [],
  });
  assert.ok(tasks.some((task) => task.actionType === 'deploy' && task.planetId === 'zeffo'));
  assert.equal(tasks.find((task) => task.planetId === 'zeffo' && task.actionType === 'deploy')?.explanation, 'Zeffo open.');
});
