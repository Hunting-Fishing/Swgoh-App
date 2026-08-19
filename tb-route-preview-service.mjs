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
      let remainingMissionTp;
      let remainingOperationTp;
      try {
        remainingMissionTp = nonNegativeInteger(values.remainingMissionTp ?? values.remaining_mission_tp ?? values.missionTp ?? values.mission_tp, `${id} remaining mission TP`);
        remainingOperationTp = nonNegativeInteger(values.remainingOperationTp ?? values.remaining_operation_tp ?? values.operationTp ?? values.operation_tp, `${id} remaining Operation TP`);
      } catch {
        missing.push(id);
        return { ...zone };
      }
      return {
        ...zone,
        remainingMissionTp,
        remainingOperationTp,
      };
    });

    if (missing.length) {
      throw httpError(
        `Route preview requires explicit remaining mission and Operation TP for every configured territory: ${[...new Set(missing)].join(', ')}.`,
        400,
        'ROUTE_ZONE_INPUTS_INCOMPLETE',
        { missingPlanets: [...new Set(missing)] },
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
      evidenceBoundary: 'Current event TP/stars/commands come from the authenticated durable TB event state. Remaining deployable/mission/Operation TP is explicit officer preview input and is not persisted or represented as canonical game state.',
    });
  }

  return Object.freeze({ preview });
}

export const tbRoutePreviewService = createTbRoutePreviewService();
