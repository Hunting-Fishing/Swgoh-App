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

const rosterBody = { units: geos, ships: [] };
const event = { id: 'event-1', current_phase: 'P2' };
const operationAssignments = [{ phase: 'P2', slotId: 'geo-op-1', baseId: 'GEONOSIANSPY', unitName: 'Geonosian Spy', planetId: 'geonosis' }];

function zone(commandState) {
  return [{ phase: 'P2', planet_id: 'geonosis', command_state: commandState, command_message: commandState === 'stop' ? 'No actions here.' : '' }];
}

test('Today queue puts Operations before playable missions and deployment', () => {
  const tasks = buildTbMemberTasks({ event, zones: zone('attack'), rosterBody, operationAssignments });
  assert.ok(tasks.length > 2);
  assert.equal(tasks[0].actionType, 'operation');
  assert.ok(tasks.some((task) => task.actionType === 'combat'));
  assert.equal(tasks.at(-1).actionType, 'deploy');
  assert.deepEqual(tasks.map((task) => task.order), Array.from({ length: tasks.length }, (_, index) => index + 1));
  const summary = todayTaskSummary(tasks);
  assert.equal(summary.hasOperations, true);
  assert.equal(summary.hasDeployment, true);
  assert.ok(summary.missionTasks > 0);
});

test('STOP command suppresses missions and deployment while keeping the Operation assignment visible', () => {
  const tasks = buildTbMemberTasks({ event, zones: zone('stop'), rosterBody, operationAssignments });
  assert.deepEqual(tasks.map((task) => task.actionType).sort(), ['acknowledge', 'operation'].sort());
  assert.ok(tasks.find((task) => task.actionType === 'acknowledge')?.explanation.includes('No actions here.'));
});

test('PRELOAD allows mission work but suppresses deployment', () => {
  const tasks = buildTbMemberTasks({ event, zones: zone('preload'), rosterBody, operationAssignments: [] });
  assert.ok(tasks.some((task) => task.actionType === 'combat'));
  assert.equal(tasks.some((task) => task.actionType === 'deploy'), false);
});

test('unconfigured territories are not inferred as active live tasks', () => {
  const tasks = buildTbMemberTasks({ event, zones: [], rosterBody, operationAssignments: [] });
  assert.deepEqual(tasks, []);
});
