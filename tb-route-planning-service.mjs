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

export function buildRoteRoutePlan(input = {}) {
  const zones = array(input.zones).map(prepareZone);
  const result = optimizeTbRoute({
    zones,
    remainingGuildDeploymentTp: input.remainingGuildDeploymentTp ?? input.remaining_guild_deployment_tp,
    riskMode: input.riskMode ?? input.risk_mode,
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
    thresholdReference: ROTE_THRESHOLD_REFERENCE,
    rejectedThresholdZones: Object.freeze(rejectedThresholdZones),
    sourceBoundary: 'Current TP, stars, remaining capacity and officer commands must come from the active event state. ROTE star thresholds are static versioned reference data only.',
  });
}
