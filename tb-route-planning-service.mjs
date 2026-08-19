import { createHash } from 'node:crypto';
import { optimizeTbRoute } from './tb-route-optimizer.mjs';
import {
  ROTE_THRESHOLD_REFERENCE,
  roteTerritoryThresholdById,
  withRoteStarThresholds,
} from './public/rote-territory-thresholds.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function routeError(message, code, details = null) {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function phase(value) {
  const normalized = text(value).toUpperCase();
  return /^P[1-6]$/.test(normalized) ? normalized : '';
}

function zonePlanetId(zone = {}) {
  return text(zone.planetId ?? zone.planet_id).toLowerCase();
}

function routePriority(zone = {}) {
  const value = Number(zone.priority ?? zone.routePriority ?? zone.route_priority);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function prepareZone(zone = {}) {
  const planetId = zonePlanetId(zone);
  const reference = roteTerritoryThresholdById(planetId);
  const prepared = reference
    ? (() => {
        const zonePhase = phase(zone.phase);
        if (zonePhase && zonePhase !== reference.playablePhase) {
          return {
            ...zone,
            starThresholds: undefined,
            thresholdRejected: true,
            thresholdRejectionCode: 'ROTE_PHASE_MISMATCH',
            thresholdRejectionExplanation: `${reference.name} threshold reference belongs to ${reference.playablePhase}, but the supplied zone state is ${zonePhase}.`,
          };
        }
        return {
          ...withRoteStarThresholds(zone),
          thresholdRejected: false,
          thresholdRejectionCode: '',
          thresholdRejectionExplanation: '',
        };
      })()
    : { ...zone };
  const priority = routePriority(prepared);
  return Object.freeze({ ...prepared, ...(priority == null ? {} : { priority }) });
}

function requireExplicitUniquePriorities(zones) {
  const missingPlanets = zones.filter((zone) => routePriority(zone) == null).map((zone) => zonePlanetId(zone) || '(unknown territory)');
  if (missingPlanets.length) {
    throw routeError(
      `Every route territory requires an explicit positive integer priority: ${missingPlanets.join(', ')}.`,
      'ROUTE_PRIORITY_REQUIRED',
      { missingPlanets: Object.freeze([...missingPlanets]) },
    );
  }

  const byPriority = new Map();
  for (const zone of zones) {
    const priority = routePriority(zone);
    const planets = byPriority.get(priority) || [];
    planets.push(zonePlanetId(zone) || '(unknown territory)');
    byPriority.set(priority, planets);
  }
  const duplicatePriorities = [...byPriority.entries()]
    .filter(([, planets]) => planets.length > 1)
    .map(([priority, planets]) => Object.freeze({ priority, planets: Object.freeze([...planets]) }));
  if (duplicatePriorities.length) {
    throw routeError(
      'Every route territory requires a unique priority so shared deployment capacity follows an explicit officer-defined order.',
      'ROUTE_PRIORITY_DUPLICATE',
      { duplicatePriorities: Object.freeze(duplicatePriorities) },
    );
  }
}

function fingerprintZone(zone = {}) {
  return Object.freeze({
    phase: phase(zone.phase),
    planetId: zonePlanetId(zone),
    priority: routePriority(zone),
    currentTp: Number(zone.currentTp ?? zone.current_tp ?? 0),
    currentStars: Number(zone.currentStars ?? zone.current_stars ?? 0),
    targetStars: Number(zone.targetStars ?? zone.target_stars ?? 0),
    preloadCapTp: zone.preloadCapTp ?? zone.preload_cap_tp ?? null,
    deploymentTp: Number(zone.deploymentTp ?? zone.deployment_tp ?? 0),
    combatTp: Number(zone.combatTp ?? zone.combat_tp ?? 0),
    operationTp: Number(zone.operationTp ?? zone.operation_tp ?? 0),
    remainingMissionTp: Number(zone.remainingMissionTp ?? zone.remaining_mission_tp ?? 0),
    remainingOperationTp: Number(zone.remainingOperationTp ?? zone.remaining_operation_tp ?? 0),
    commandState: text(zone.commandState ?? zone.command_state).toLowerCase(),
    commandMessage: text(zone.commandMessage ?? zone.command_message),
    lockedByOfficer: zone.lockedByOfficer === true || zone.locked_by_officer === true,
    deployAllowed: zone.deployAllowed ?? zone.deploy_allowed ?? true,
    combatAllowed: zone.combatAllowed ?? zone.combat_allowed ?? true,
    starThresholds: array(zone.starThresholds ?? zone.star_thresholds).map(Number),
    thresholdRejected: zone.thresholdRejected === true,
    thresholdRejectionCode: text(zone.thresholdRejectionCode),
  });
}

export function buildRoteRoutePlan(input = {}) {
  const zones = array(input.zones).map(prepareZone);
  requireExplicitUniquePriorities(zones);
  const remainingGuildDeploymentTp = input.remainingGuildDeploymentTp ?? input.remaining_guild_deployment_tp;
  const riskMode = input.riskMode ?? input.risk_mode;
  const inputFingerprint = fingerprint({
    planner: 'rote-route-planning-service-v1',
    thresholdReferenceVersion: ROTE_THRESHOLD_REFERENCE.version,
    remainingGuildDeploymentTp: Number(remainingGuildDeploymentTp || 0),
    riskMode: text(riskMode).toLowerCase() || 'safe',
    zones: zones.map(fingerprintZone).sort((a, b) => a.planetId.localeCompare(b.planetId)),
  });
  const result = optimizeTbRoute({
    zones,
    remainingGuildDeploymentTp,
    riskMode,
  });

  const rejectedThresholdZones = zones
    .filter((zone) => zone.thresholdRejected === true)
    .map((zone) => Object.freeze({
      planetId: zonePlanetId(zone),
      code: text(zone.thresholdRejectionCode),
      explanation: text(zone.thresholdRejectionExplanation),
    }));

  return Object.freeze({
    ...result,
    planner: 'rote-route-planning-service-v1',
    inputFingerprint,
    thresholdReference: ROTE_THRESHOLD_REFERENCE,
    rejectedThresholdZones: Object.freeze(rejectedThresholdZones),
    sourceBoundary: 'Current TP, stars, remaining capacity and officer commands must come from the active event state. Route priority is explicit officer input. ROTE star thresholds are static versioned reference data only.',
  });
}
