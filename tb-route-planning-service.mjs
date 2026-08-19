import { createHash } from 'node:crypto';
import { optimizeTbRoute } from './tb-route-optimizer.mjs';
import {
  ROTE_THRESHOLD_REFERENCE,
  roteTerritoryThresholdById,
  withRoteStarThresholds,
} from './public/rote-territory-thresholds.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function phase(value) {
  const normalized = text(value).toUpperCase();
  return /^P[1-6]$/.test(normalized) ? normalized : '';
}

function zonePlanetId(zone = {}) {
  return text(zone.planetId ?? zone.planet_id).toLowerCase();
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
  if (!reference) return Object.freeze({ ...zone });

  const zonePhase = phase(zone.phase);
  if (zonePhase && zonePhase !== reference.playablePhase) {
    return Object.freeze({
      ...zone,
      starThresholds: undefined,
      thresholdRejected: true,
      thresholdRejectionCode: 'ROTE_PHASE_MISMATCH',
      thresholdRejectionExplanation: `${reference.name} threshold reference belongs to ${reference.playablePhase}, but the supplied zone state is ${zonePhase}.`,
    });
  }

  return Object.freeze({
    ...withRoteStarThresholds(zone),
    thresholdRejected: false,
    thresholdRejectionCode: '',
    thresholdRejectionExplanation: '',
  });
}

function fingerprintZone(zone = {}) {
  return Object.freeze({
    phase: phase(zone.phase),
    planetId: zonePlanetId(zone),
    priority: Number(zone.priority || 0),
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
    sourceBoundary: 'Current TP, stars, remaining capacity and officer commands must come from the active event state. ROTE star thresholds are static versioned reference data only.',
  });
}
