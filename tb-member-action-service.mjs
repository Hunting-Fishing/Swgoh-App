import { ROTE_PLANETS } from './public/rote-map-data.js';
import {
  missionRosterEligibility,
  normalizedRoteMissionsForPlanet,
} from './public/rote-mission-node-eligibility.js';
import { recommendationRosterFit } from './public/tb-mission-intelligence.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const formatted = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const TYPE_PRIORITY = Object.freeze({
  acknowledge: 5,
  operation: 10,
  special: 20,
  combat: 30,
  fleet: 35,
  deploy: 50,
});

function cleanPhase(value) {
  const phase = text(value).toUpperCase();
  return /^P[1-6]$/.test(phase) ? phase : '';
}

function actionKey(...parts) {
  return parts.map((part) => text(part).replace(/[^A-Za-z0-9_.:-]+/g, '-')).filter(Boolean).join(':').slice(0, 240);
}

function assignmentBaseId(assignment = {}) {
  return text(assignment.baseId || assignment.base_id).toUpperCase();
}

function recommendationForRoster(rosterBody, mission) {
  const recommendations = array(mission?.recommendations);
  if (!recommendations.length) return null;
  const fits = recommendations.map((recommendation) => ({
    recommendation,
    fit: recommendationRosterFit(rosterBody, mission, recommendation),
  }));
  return fits.find((row) => row.fit?.complete)?.recommendation || fits[0]?.recommendation || null;
}

function rosterAfterOperations(rosterBody, reservedBaseIds) {
  if (!reservedBaseIds.size) return rosterBody;
  const available = (rows) => array(rows).filter((unit) => !reservedBaseIds.has(text(unit?.baseId).toUpperCase()));
  return Object.freeze({
    ...rosterBody,
    units: Object.freeze(available(rosterBody?.units)),
    ships: Object.freeze(available(rosterBody?.ships)),
  });
}

function operationTask(assignment, phase) {
  const slotId = text(assignment?.slotId || assignment?.slot_id || assignment?.operationSlotId || assignment?.operation_slot_id);
  const baseId = assignmentBaseId(assignment);
  const unitName = text(assignment?.unitName || assignment?.unit_name || assignment?.name) || baseId || 'assigned unit';
  const planetId = text(assignment?.planetId || assignment?.planet_id || assignment?.territoryId || assignment?.territory_id);
  const assignmentPhase = cleanPhase(assignment?.phase) || phase;
  return Object.freeze({
    actionKey: actionKey('operation', assignmentPhase, slotId || baseId || unitName),
    actionType: 'operation',
    phase: assignmentPhase,
    planetId,
    missionId: '',
    operationSlotId: slotId,
    priority: TYPE_PRIORITY.operation,
    recommendedTeamId: '',
    deploymentTargetTp: null,
    title: `Operations · ${unitName}`,
    explanation: planetId
      ? `Place ${unitName} in your assigned ${planetId} Operation slot before using or reserving it elsewhere.`
      : `Place ${unitName} in your assigned Operation slot before using or reserving it elsewhere.`,
    payload: Object.freeze({ baseId, unitName, assignment }),
  });
}

function commandTask(zone, phase) {
  const state = lower(zone?.command_state || zone?.commandState);
  if (!['hold', 'stop'].includes(state)) return null;
  const planetId = text(zone?.planet_id || zone?.planetId);
  const message = text(zone?.command_message || zone?.commandMessage);
  const verb = state === 'stop' ? 'STOP' : 'HOLD';
  return Object.freeze({
    actionKey: actionKey('command', phase, planetId, state),
    actionType: 'acknowledge',
    phase,
    planetId,
    missionId: '',
    operationSlotId: '',
    priority: TYPE_PRIORITY.acknowledge,
    recommendedTeamId: '',
    deploymentTargetTp: null,
    title: `${verb} · ${planetId || 'Territory'}`,
    explanation: message || (state === 'stop'
      ? 'Officer command: do not run missions or deploy into this territory until the command changes.'
      : 'Officer command: hold deployment in this territory. Review the officer note before taking action.'),
    payload: Object.freeze({ commandState: state, commandMessage: message }),
  });
}

function preloadSafetyTask(zone, planet, phase) {
  const currentTp = Number(zone?.current_tp ?? zone?.currentTp ?? 0);
  const capRaw = zone?.preload_cap_tp ?? zone?.preloadCapTp;
  const cap = Number(capRaw);
  const hasCap = capRaw !== null && capRaw !== undefined && capRaw !== '' && Number.isFinite(cap) && cap > 0;
  const message = text(zone?.command_message || zone?.commandMessage);
  if (!hasCap) {
    return Object.freeze({
      actionKey: actionKey('preload-cap-required', phase, planet.id),
      actionType: 'acknowledge',
      phase,
      planetId: planet.id,
      missionId: '',
      operationSlotId: '',
      priority: TYPE_PRIORITY.acknowledge,
      recommendedTeamId: '',
      deploymentTargetTp: null,
      title: `PRELOAD HOLD · ${planet.name}`,
      explanation: message || 'PRELOAD is selected, but no officer TP cap is recorded. Do not deploy until a preload cap is published.',
      payload: Object.freeze({ commandState: 'preload', currentTp: Number.isFinite(currentTp) ? currentTp : 0, preloadCapTp: null, capMissing: true }),
    });
  }
  if (Number.isFinite(currentTp) && currentTp >= cap) {
    return Object.freeze({
      actionKey: actionKey('preload-cap-reached', phase, planet.id),
      actionType: 'acknowledge',
      phase,
      planetId: planet.id,
      missionId: '',
      operationSlotId: '',
      priority: TYPE_PRIORITY.acknowledge,
      recommendedTeamId: '',
      deploymentTargetTp: null,
      title: `PRELOAD CAP REACHED · ${planet.name}`,
      explanation: message || `${planet.name} is at ${formatted(currentTp)} TP with an officer preload cap of ${formatted(cap)} TP. Do not deploy here.`,
      payload: Object.freeze({ commandState: 'preload', currentTp, preloadCapTp: cap, capReached: true }),
    });
  }
  return Object.freeze({
    actionKey: actionKey('preload', phase, planet.id),
    actionType: 'deploy',
    phase,
    planetId: planet.id,
    missionId: '',
    operationSlotId: '',
    priority: TYPE_PRIORITY.deploy,
    recommendedTeamId: '',
    deploymentTargetTp: null,
    title: `Preload · ${planet.name}`,
    explanation: message || `Preload ${planet.name} carefully. Current zone TP: ${formatted(currentTp)}. Officer cap: ${formatted(cap)} TP. Do not cross the cap.`,
    payload: Object.freeze({ commandState: 'preload', currentTp: Number.isFinite(currentTp) ? currentTp : 0, preloadCapTp: cap, capReached: false }),
  });
}

function missionTask({ mission, planet, rosterBody, phase, operationsReservedCount = 0 }) {
  const eligibility = missionRosterEligibility(rosterBody, mission);
  if (!eligibility.loaded || !eligibility.ready) return null;
  const recommendation = recommendationForRoster(rosterBody, mission);
  const missionType = lower(mission?.missionType);
  const actionType = missionType === 'special' ? 'special' : missionType === 'fleet' ? 'fleet' : 'combat';
  const enemy = text(mission?.tactical?.encounter) || array(mission?.enemies).map((entry) => text(typeof entry === 'string' ? entry : entry?.name)).filter(Boolean).slice(0, 2).join(' / ');
  const tag = text(mission?.tactical?.commandTag);
  const title = enemy ? `${enemy} · ${mission.name}` : text(mission?.name) || `${planet.name} mission`;
  const details = [];
  if (tag) details.push(tag);
  if (recommendation?.name) details.push(`Recommended: ${recommendation.name}`);
  details.push('Your roster meets the encoded entry gate after assigned Operations donations are reserved.');
  return Object.freeze({
    actionKey: actionKey(actionType, phase, planet.id, mission.id),
    actionType,
    phase,
    planetId: planet.id,
    missionId: text(mission?.id),
    operationSlotId: '',
    priority: TYPE_PRIORITY[actionType],
    recommendedTeamId: text(recommendation?.id || recommendation?.name),
    deploymentTargetTp: null,
    title,
    explanation: details.join(' · '),
    payload: Object.freeze({
      missionName: text(mission?.name),
      commandTag: tag,
      presetPrefix: text(mission?.tactical?.presetPrefix),
      recommendationName: text(recommendation?.name),
      reward: array(mission?.rewards).join(' · '),
      entryPercent: Number(eligibility.percent || 0),
      operationsReservedCount,
    }),
  });
}

function deploymentTask(zone, planet, phase) {
  const state = lower(zone?.command_state || zone?.commandState);
  if (state === 'preload') return preloadSafetyTask(zone, planet, phase);
  if (!['attack', 'deploy'].includes(state)) return null;
  const message = text(zone?.command_message || zone?.commandMessage);
  const target = Number(zone?.deployment_target_tp ?? zone?.deploymentTargetTp);
  const deploymentTargetTp = Number.isFinite(target) && target >= 0 ? Math.trunc(target) : null;
  return Object.freeze({
    actionKey: actionKey('deploy', phase, planet.id),
    actionType: 'deploy',
    phase,
    planetId: planet.id,
    missionId: '',
    operationSlotId: '',
    priority: TYPE_PRIORITY.deploy,
    recommendedTeamId: '',
    deploymentTargetTp,
    title: `Deploy · ${planet.name}`,
    explanation: message || (state === 'deploy'
      ? `Officer command: deploy available GP to ${planet.name} after higher-priority Operations and missions are complete.`
      : `Deployment is currently allowed in ${planet.name}; complete Operations and playable missions first.`),
    payload: Object.freeze({ commandState: state }),
  });
}

function compareTasks(a, b) {
  return Number(a.priority || 999) - Number(b.priority || 999)
    || String(a.planetId || '').localeCompare(String(b.planetId || ''))
    || String(a.title || '').localeCompare(String(b.title || ''));
}

export function buildTbMemberTasks(input = {}) {
  const event = input.event || {};
  const phase = cleanPhase(event.current_phase || event.currentPhase);
  const rosterBody = input.rosterBody || null;
  if (!phase || !rosterBody) return Object.freeze([]);

  const tasks = [];
  const activeAssignments = array(input.operationAssignments).filter((assignment) => {
    const assignmentPhase = cleanPhase(assignment?.phase);
    return !assignmentPhase || assignmentPhase === phase;
  });
  const operationsReservedBaseIds = new Set(activeAssignments.map(assignmentBaseId).filter(Boolean));
  for (const assignment of activeAssignments) tasks.push(operationTask(assignment, phase));
  const missionRosterBody = rosterAfterOperations(rosterBody, operationsReservedBaseIds);

  const configuredZones = array(input.zones).filter((zone) => cleanPhase(zone?.phase) === phase);
  for (const zone of configuredZones) {
    const planetId = text(zone?.planet_id || zone?.planetId);
    const planet = ROTE_PLANETS.find((candidate) => candidate.id === planetId);
    if (!planet) continue;
    const command = lower(zone.command_state || zone.commandState);
    const commandWarning = commandTask(zone, phase);
    if (commandWarning) tasks.push(commandWarning);
    if (command === 'stop') continue;

    for (const mission of normalizedRoteMissionsForPlanet(planet.id)) {
      const task = missionTask({ mission, planet, rosterBody: missionRosterBody, phase, operationsReservedCount: operationsReservedBaseIds.size });
      if (task) tasks.push(task);
    }

    if (command !== 'hold') {
      const deploy = deploymentTask(zone, planet, phase);
      if (deploy) tasks.push(deploy);
    }
  }

  const unique = new Map();
  for (const task of tasks) if (task?.actionKey && !unique.has(task.actionKey)) unique.set(task.actionKey, task);
  return Object.freeze([...unique.values()].sort(compareTasks).map((task, index) => Object.freeze({
    ...task,
    order: index + 1,
  })));
}

export function todayTaskSummary(tasksInput = []) {
  const tasks = array(tasksInput);
  const byType = Object.freeze(Object.fromEntries(['acknowledge','operation','special','combat','fleet','deploy'].map((type) => [type, tasks.filter((task) => task.actionType === type).length])));
  return Object.freeze({
    total: tasks.length,
    byType,
    blockedCommands: byType.acknowledge,
    missionTasks: byType.special + byType.combat + byType.fleet,
    hasOperations: byType.operation > 0,
    hasDeployment: byType.deploy > 0,
  });
}
