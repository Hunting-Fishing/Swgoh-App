import { supabaseCoreStore } from './supabase-core-store.mjs';
import {
  normalizeRotePhase,
  verifyTbAssignmentRunHash,
} from './tb-assignment-version-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;

function serviceError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireContext(context = {}) {
  const guildId = text(context?.guild?.id || context?.guildId);
  const actorUserId = text(context?.userId);
  if (!guildId) throw serviceError('Guild context is required.', 400, 'GUILD_CONTEXT_REQUIRED');
  if (!actorUserId) throw serviceError('Officer user context is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
  return Object.freeze({ guildId, actorUserId });
}

function artifactFrom(run = {}) {
  return Object.freeze({
    id: text(run.id),
    guildId: text(run.guild_id),
    planId: text(run.plan_id),
    rotePhase: text(run.rote_phase),
    versionNumber: Number(run.version_number || 0),
    planHash: text(run.plan_hash),
    inputFingerprint: text(run.input_fingerprint),
    assignments: Object.freeze(array(run.assignments)),
    unfilled: Object.freeze(array(run.unfilled)),
    diagnostics: Object.freeze(object(run.diagnostics)),
    delivery: Object.freeze(object(run.delivery)),
    approvedAt: text(run.approved_at),
    approvedByUserId: text(run.approved_by_user_id),
    approvedPlanHash: text(run.approved_plan_hash),
    createdAt: text(run.created_at),
  });
}

export function createTbAssignmentPublishabilityService(options = {}) {
  const store = options.store || supabaseCoreStore;

  async function auditGeneralRejection(context, runId, code, reason, metadata = {}) {
    await store.insert('guild_operations_audit_log', [{
      guild_id: context.guildId,
      actor_user_id: context.actorUserId,
      action: 'tb-assignment.publishability-rejected',
      entity_type: 'guild_tb_assignment_run',
      entity_id: runId || null,
      metadata: { code, reason, ...object(metadata) },
    }], { returning: false });
  }

  async function auditRunRejection(context, run, code, reason, metadata = {}) {
    await store.insert('guild_tb_assignment_decisions', [{
      guild_id: context.guildId,
      run_id: run.id,
      decision: 'publishability_rejected',
      actor_user_id: context.actorUserId,
      plan_hash: text(run.plan_hash) || null,
      reason: text(reason).slice(0, 500) || code,
      metadata: { code, ...object(metadata) },
    }], { returning: false });
  }

  async function reject(context, run, code, reason, metadata = {}, status = 409) {
    try {
      if (run?.id && text(run.guild_id) === context.guildId) {
        await auditRunRejection(context, run, code, reason, metadata);
      } else {
        await auditGeneralRejection(context, text(run?.id || metadata.runId), code, reason, metadata);
      }
    } catch (auditError) {
      throw serviceError(
        `Publishability rejection could not be durably audited: ${text(auditError?.message) || 'audit write failed'}`,
        503,
        'TB_ASSIGNMENT_PUBLISHABILITY_AUDIT_FAILED',
      );
    }
    throw serviceError(reason, status, code);
  }

  async function readRun(guildId, runId) {
    return first(await store.select('guild_tb_assignment_runs', {
      select: '*',
      guild_id: `eq.${guildId}`,
      id: `eq.${runId}`,
      limit: 1,
    }));
  }

  async function readLatest(run) {
    return first(await store.select('guild_tb_assignment_runs', {
      select: 'id,version_number,plan_hash,superseded_by_run_id,cancelled_at',
      guild_id: `eq.${run.guild_id}`,
      plan_id: `eq.${run.plan_id}`,
      rote_phase: `eq.${run.rote_phase}`,
      version_number: 'not.is.null',
      plan_hash: 'not.is.null',
      order: 'version_number.desc',
      limit: 1,
    }));
  }

  async function assertPublishable(contextInput = {}, input = {}) {
    const context = requireContext(contextInput);
    const runId = text(input.runId || input.versionId);
    const expectedPlanId = text(input.planId || input.currentPlanId);
    const phaseInput = text(input.rotePhase || input.phase);
    const expectedPhase = phaseInput ? normalizeRotePhase(phaseInput) : '';

    if (!runId) throw serviceError('An immutable assignment version ID is required.', 400, 'TB_ASSIGNMENT_VERSION_REQUIRED');

    const run = await readRun(context.guildId, runId);
    if (!run) {
      await reject(
        context,
        null,
        'TB_ASSIGNMENT_VERSION_NOT_FOUND',
        'Immutable assignment version was not found for this Guild.',
        { runId },
        404,
      );
    }

    if (!Number(run.version_number) || !text(run.plan_hash) || !text(run.plan_id) || !text(run.rote_phase)) {
      await reject(context, run, 'TB_ASSIGNMENT_NOT_IMMUTABLE_VERSION', 'The selected TB run is not a Stage 9 immutable assignment version.');
    }

    let verification;
    try {
      verification = verifyTbAssignmentRunHash(run);
    } catch (error) {
      await reject(context, run, 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED', 'Persisted assignment payload cannot be deterministically verified.', { verificationError: text(error?.code || error?.message) }, 500);
    }
    if (!verification?.valid) {
      await reject(context, run, 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED', 'Persisted assignment payload does not match its stored hash.', { stored: verification?.stored, recomputed: verification?.recomputed }, 500);
    }

    if (expectedPlanId && text(run.plan_id) !== expectedPlanId) {
      await reject(context, run, 'TB_ASSIGNMENT_CURRENT_PLAN_MISMATCH', 'Immutable assignment version does not belong to the current authoritative ROTE plan.', { expectedPlanId, actualPlanId: text(run.plan_id) });
    }
    if (expectedPhase && text(run.rote_phase) !== expectedPhase) {
      await reject(context, run, 'TB_ASSIGNMENT_PHASE_MISMATCH', 'Immutable assignment version does not belong to the requested ROTE phase.', { expectedPhase, actualPhase: text(run.rote_phase) });
    }

    if (text(run.status) === 'cancelled' || text(run.cancelled_at)) {
      await reject(context, run, 'TB_ASSIGNMENT_CANCELLED', 'Cancelled assignment versions are not publishable.');
    }
    if (text(run.superseded_by_run_id)) {
      await reject(context, run, 'TB_ASSIGNMENT_SUPERSEDED', 'Superseded assignment versions are not publishable.', { supersededByRunId: text(run.superseded_by_run_id) });
    }

    if (!text(run.approved_at) || !text(run.approved_by_user_id)) {
      await reject(context, run, 'TB_ASSIGNMENT_APPROVAL_REQUIRED', 'This immutable assignment version has not been approved by an officer.');
    }
    if (text(run.approved_plan_hash).toLowerCase() !== text(run.plan_hash).toLowerCase()) {
      await reject(context, run, 'TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH', 'Stored approval does not authorize this exact assignment payload hash.');
    }

    const plan = first(await store.select('guild_tb_plans', {
      select: 'id,guild_id,tb_key,status,updated_at',
      guild_id: `eq.${context.guildId}`,
      id: `eq.${run.plan_id}`,
      limit: 1,
    }));
    if (!plan || text(plan.tb_key || 'rote').toLowerCase() !== 'rote' || text(plan.status) === 'archived') {
      await reject(context, run, 'TB_ASSIGNMENT_SOURCE_PLAN_STALE', 'The source ROTE plan is unavailable or archived.');
    }

    const latest = await readLatest(run);
    if (!latest || text(latest.id) !== text(run.id) || Number(latest.version_number || 0) !== Number(run.version_number || 0)) {
      await reject(context, run, 'TB_ASSIGNMENT_STALE_VERSION', 'A newer authoritative immutable assignment version exists for this plan and phase.', {
        latestRunId: text(latest?.id),
        latestVersionNumber: Number(latest?.version_number || 0),
      });
    }

    return Object.freeze({
      publishable: true,
      artifact: artifactFrom(run),
      verification,
      sourcePlan: Object.freeze({
        id: text(plan.id),
        status: text(plan.status),
        updatedAt: text(plan.updated_at),
      }),
    });
  }

  return Object.freeze({ assertPublishable });
}

export const tbAssignmentPublishabilityService = createTbAssignmentPublishabilityService();
