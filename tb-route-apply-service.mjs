import { tbRoutePreviewService } from './tb-route-preview-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function httpError(message, status, code, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function planetId(zone = {}) {
  return text(zone.planetId ?? zone.planet_id).toLowerCase();
}

function fingerprint(value) {
  const candidate = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(candidate) ? candidate : '';
}

function routeInputsFromPlan(plan = {}) {
  return Object.freeze({
    remainingGuildDeploymentTp: Number(plan.remainingGuildDeploymentTp || 0),
    riskMode: text(plan.riskMode || 'safe'),
    thresholdReferenceVersion: text(plan?.thresholdReference?.version),
    remainingTpByPlanet: Object.freeze(Object.fromEntries(array(plan.zones).map((zone) => [
      planetId(zone),
      Object.freeze({
        remainingMissionTp: Number(zone.remainingMissionTp || 0),
        remainingOperationTp: Number(zone.remainingOperationTp || 0),
      }),
    ]).filter(([id]) => id))),
  });
}

function rpcFailure(error) {
  const message = text(error?.message);
  if (message.includes('TB_ROUTE_STATE_STALE') || message.includes('TB_ROUTE_EVENT_STALE')) {
    return httpError('The active TB state changed after this preview. Recalculate before applying orders.', 409, 'ROUTE_PREVIEW_STALE');
  }
  if (message.includes('TB_ROUTE_APPLY_CONCURRENCY_FAILURE')) {
    return httpError('The route could not be applied atomically because territory state changed during the update. Recalculate before retrying.', 409, 'ROUTE_APPLY_CONCURRENCY_FAILURE');
  }
  if (message.includes('TB_ROUTE_')) {
    return httpError('The route apply transaction rejected an invalid or stale payload.', 400, 'ROUTE_APPLY_REJECTED', { databaseMessage: message });
  }
  return error;
}

export function createTbRouteApplyService(options = {}) {
  const previewService = options.previewService || tbRoutePreviewService;
  const store = options.store || supabaseCoreStore;

  async function apply(userId, input = {}) {
    const expectedInputFingerprint = fingerprint(input.expectedInputFingerprint ?? input.expected_input_fingerprint);
    if (!expectedInputFingerprint) {
      throw httpError('A valid optimizer preview fingerprint is required before applying route orders.', 400, 'ROUTE_PREVIEW_FINGERPRINT_REQUIRED');
    }

    const preview = await previewService.preview(userId, input);
    if (!preview?.configured || !preview?.event || !preview?.plan) {
      throw httpError('An active TB event and a valid optimizer preview are required before applying route orders.', 409, 'ROUTE_PREVIEW_REQUIRED');
    }

    const currentFingerprint = fingerprint(preview.plan.inputFingerprint);
    if (!currentFingerprint || currentFingerprint !== expectedInputFingerprint) {
      throw httpError('The optimizer inputs or active TB state changed after this preview. Recalculate before applying orders.', 409, 'ROUTE_PREVIEW_STALE', {
        expectedInputFingerprint,
        currentInputFingerprint: currentFingerprint,
      });
    }

    const blocked = array(preview.plan.zones).filter((zone) => zone.blocked === true);
    if (blocked.length) {
      throw httpError('The route contains blocked territories and cannot be applied. Resolve every blocking constraint, then recalculate.', 409, 'ROUTE_HAS_BLOCKERS', {
        blockedPlanets: blocked.map((zone) => planetId(zone)).filter(Boolean),
      });
    }

    const stateByPlanet = new Map(array(preview.zones).map((zone) => [planetId(zone), zone]).filter(([id]) => id));
    const zoneUpdates = [];
    for (const recommendation of array(preview.plan.zones)) {
      if (recommendation.lockedByOfficer === true || recommendation.commandSource === 'officer-lock') continue;
      const id = planetId(recommendation);
      const state = stateByPlanet.get(id);
      if (!id || !state) throw httpError(`Durable event state for ${id || 'a route territory'} is unavailable.`, 409, 'ROUTE_STATE_INCOMPLETE');
      const expectedUpdatedAt = text(state.updatedAt ?? state.updated_at);
      if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
        throw httpError(`${id} does not have a durable update timestamp, so an atomic route apply cannot be verified.`, 409, 'ROUTE_STATE_VERSION_REQUIRED');
      }
      zoneUpdates.push(Object.freeze({
        planetId: id,
        command: text(recommendation.command).toLowerCase(),
        commandMessage: `${text(recommendation.commandLabel || recommendation.command).toUpperCase()}: ${text(recommendation.explanation)}`.slice(0, 800),
        expectedUpdatedAt,
      }));
    }

    const routeInputs = routeInputsFromPlan(preview.plan);
    let audit;
    try {
      audit = await store.rpc('apply_guild_tb_route_plan', {
        p_event_id: preview.event.id,
        p_phase: preview.event.currentPhase,
        p_created_by_user_id: userId,
        p_input_fingerprint: currentFingerprint,
        p_zone_state_json: array(preview.zones),
        p_projection_inputs_json: routeInputs,
        p_route_plan_json: preview.plan,
        p_zone_updates: zoneUpdates,
      });
    } catch (error) {
      throw rpcFailure(error);
    }

    const result = object(audit);
    return Object.freeze({
      applied: true,
      source: 'tb-route-apply-service-v1',
      event: preview.event,
      inputFingerprint: currentFingerprint,
      snapshotId: text(result.snapshotId),
      appliedZoneCount: Number(result.appliedZoneCount || 0),
      lockedZoneCount: array(preview.plan.zones).length - zoneUpdates.length,
      appliedAt: text(result.appliedAt),
      commands: Object.freeze(array(preview.plan.zones).map((zone) => Object.freeze({
        planetId: planetId(zone),
        command: text(zone.command),
        lockedByOfficer: zone.lockedByOfficer === true,
        applied: !(zone.lockedByOfficer === true || zone.commandSource === 'officer-lock'),
      }))),
      evidenceBoundary: 'Unlocked route commands were applied atomically only after the server re-ran the optimizer against current durable event state and matched the preview fingerprint. Locked officer commands were not modified. The applied decision is preserved in an immutable phase snapshot.',
    });
  }

  return Object.freeze({ apply });
}

export const tbRouteApplyService = createTbRouteApplyService();
