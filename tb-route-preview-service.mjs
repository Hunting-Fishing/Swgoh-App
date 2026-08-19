import { tbEventStateService } from './tb-event-state-service.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { buildRoteRoutePlan } from './tb-route-planning-service.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? '').trim();

function httpError(message, status, code, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function nonNegativeInteger(value, label) {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0) {
    throw httpError(`${label} must be an explicit non-negative TP value.`, 400, 'ROUTE_INPUT_REQUIRED');
  }
  return Math.trunc(Number(value));
}

function positiveInteger(value, label) {
  if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 1) {
    throw httpError(`${label} must be an explicit positive integer.`, 400, 'ROUTE_PRIORITY_REQUIRED');
  }
  return Math.trunc(Number(value));
}

function planetId(zone = {}) {
  return text(zone.planetId ?? zone.planet_id).toLowerCase();
}

function routeInputForPlanet(inputs, id) {
  const direct = object(inputs[id]);
  if (Object.keys(direct).length) return direct;
  return object(Object.values(inputs).find((entry) => planetId(entry) === id));
}

export function createTbRoutePreviewService(options = {}) {
  const events = options.events || tbEventStateService;
  const operations = options.operations || guildOperationsService;
  const planner = typeof options.planner === 'function' ? options.planner : buildRoteRoutePlan;

  async function preview(userId, input = {}) {
    const snapshot = await events.eventSnapshot(userId);
    if (!snapshot?.configured || !snapshot?.event) {
      return Object.freeze({
        configured: false,
        source: 'tb-route-preview-v1',
        event: snapshot?.event || null,
        zones: Object.freeze([]),
        plan: null,
        evidenceBoundary: snapshot?.evidenceBoundary || 'No active TB event is configured; no route preview can be generated.',
      });
    }

    const officer = await operations.requireOfficer(userId, snapshot?.identity?.allyCode);
    const remainingGuildDeploymentTp = nonNegativeInteger(
      input.remainingGuildDeploymentTp ?? input.remaining_guild_deployment_tp,
      'Remaining Guild deployable TP',
    );
    const byPlanet = object(input.remainingTpByPlanet ?? input.remaining_tp_by_planet);
    const missing = [];
    const zones = array(snapshot.zones).map((zone) => {
      const id = planetId(zone);
      const values = routeInputForPlanet(byPlanet, id);
      if (!id || !Object.keys(values).length) {
        missing.push(id || '(unknown territory)');
        return { ...zone };
      }
      let priority;
      let remainingMissionTp;
      let remainingOperationTp;
      try {
        priority = positiveInteger(values.priority ?? values.routePriority ?? values.route_priority, `${id} route priority`);
        remainingMissionTp = nonNegativeInteger(values.remainingMissionTp ?? values.remaining_mission_tp ?? values.missionTp ?? values.mission_tp, `${id} remaining mission TP`);
        remainingOperationTp = nonNegativeInteger(values.remainingOperationTp ?? values.remaining_operation_tp ?? values.operationTp ?? values.operation_tp, `${id} remaining Operation TP`);
      } catch {
        missing.push(id);
        return { ...zone };
      }
      return {
        ...zone,
        priority,
        remainingMissionTp,
        remainingOperationTp,
      };
    });

    if (missing.length) {
      throw httpError(
        `Route preview requires an explicit route priority plus remaining mission and Operation TP for every configured territory: ${[...new Set(missing)].join(', ')}.`,
        400,
        'ROUTE_ZONE_INPUTS_INCOMPLETE',
        { missingPlanets: [...new Set(missing)] },
      );
    }

    const priorityPlanets = new Map();
    for (const zone of zones) {
      const list = priorityPlanets.get(zone.priority) || [];
      list.push(planetId(zone));
      priorityPlanets.set(zone.priority, list);
    }
    const duplicatePriorities = [...priorityPlanets.entries()]
      .filter(([, planets]) => planets.length > 1)
      .map(([priority, planets]) => Object.freeze({ priority, planets: Object.freeze(planets) }));
    if (duplicatePriorities.length) {
      throw httpError(
        'Each configured territory must have a unique route priority so scarce deployment capacity has an explicit officer-defined order.',
        400,
        'ROUTE_PRIORITY_DUPLICATE',
        { duplicatePriorities },
      );
    }

    const plan = planner({
      zones,
      remainingGuildDeploymentTp,
      riskMode: input.riskMode ?? input.risk_mode,
    });

    return Object.freeze({
      configured: true,
      source: 'tb-route-preview-v1',
      inputSource: 'officer-preview',
      persisted: false,
      identity: snapshot.identity,
      officer: Object.freeze({ guildId: text(officer?.guild?.id), guildName: text(officer?.guild?.name) }),
      event: snapshot.event,
      zones: Object.freeze(array(snapshot.zones)),
      plan,
      evidenceBoundary: 'Current event TP/stars/commands come from authenticated durable TB event state. Route priority and remaining deployable/mission/Operation TP are explicit officer preview inputs and are not represented as canonical game state.',
    });
  }

  return Object.freeze({ preview });
}

export const tbRoutePreviewService = createTbRoutePreviewService();
