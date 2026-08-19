import { createHash } from 'node:crypto';
import { supabaseCoreStore } from './supabase-core-store.mjs';

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

function rpcObject(value, key) {
  if (value && !Array.isArray(value) && typeof value === 'object') return value;
  if (Array.isArray(value) && value.length === 1) {
    const row = value[0];
    if (row && typeof row === 'object') return key && row[key] !== undefined ? row[key] : row;
  }
  return value ?? null;
}

export function normalizeRotePhase(value) {
  const phase = text(value).toUpperCase();
  if (!/^P[1-6]$/.test(phase)) {
    throw serviceError('ROTE phase must be P1 through P6.', 400, 'INVALID_ROTE_PHASE');
  }
  return phase;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const next = value[key];
    if (next === undefined) continue;
    sorted[key] = canonicalize(next);
  }
  return sorted;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function tbAssignmentHashPayload(input = {}) {
  const versionNumber = Math.floor(Number(input.versionNumber));
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw serviceError('A positive assignment version number is required.', 400, 'INVALID_ASSIGNMENT_VERSION');
  }

  return Object.freeze({
    guildId: text(input.guildId),
    planId: text(input.planId) || null,
    rotePhase: normalizeRotePhase(input.rotePhase),
    versionNumber,
    inputFingerprint: text(input.inputFingerprint) || null,
    assignments: array(input.assignments),
    unfilled: array(input.unfilled),
    diagnostics: object(input.diagnostics),
  });
}

export function computeTbAssignmentPlanHash(input = {}) {
  const payload = tbAssignmentHashPayload(input);
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

export function recomputeTbAssignmentRunHash(run = {}) {
  return computeTbAssignmentPlanHash({
    guildId: run.guild_id ?? run.guildId,
    planId: run.plan_id ?? run.planId,
    rotePhase: run.rote_phase ?? run.rotePhase,
    versionNumber: run.version_number ?? run.versionNumber,
    inputFingerprint: run.input_fingerprint ?? run.inputFingerprint,
    assignments: run.assignments,
    unfilled: run.unfilled,
    diagnostics: run.diagnostics,
  });
}

export function verifyTbAssignmentRunHash(run = {}) {
  const stored = text(run.plan_hash ?? run.planHash).toLowerCase();
  const recomputed = recomputeTbAssignmentRunHash(run);
  return Object.freeze({
    valid: /^[0-9a-f]{64}$/.test(stored) && stored === recomputed,
    stored,
    recomputed,
  });
}

function sanitizeVersion(run = {}) {
  return Object.freeze({
    id: text(run.id),
    guildId: text(run.guild_id),
    planId: text(run.plan_id),
    rotePhase: text(run.rote_phase),
    versionNumber: Number(run.version_number || 0),
    planHash: text(run.plan_hash),
    inputFingerprint: text(run.input_fingerprint),
    status: text(run.status),
    assignments: Object.freeze(array(run.assignments)),
    unfilled: Object.freeze(array(run.unfilled)),
    diagnostics: Object.freeze(object(run.diagnostics)),
    delivery: Object.freeze(object(run.delivery)),
    supersedesRunId: text(run.supersedes_run_id),
    supersededByRunId: text(run.superseded_by_run_id),
    approvedAt: text(run.approved_at),
    approvedByUserId: text(run.approved_by_user_id),
    approvedPlanHash: text(run.approved_plan_hash),
    cancelledAt: text(run.cancelled_at),
    cancelledByUserId: text(run.cancelled_by_user_id),
    cancellationReason: text(run.cancellation_reason),
    createdAt: text(run.created_at),
  });
}

export function createTbAssignmentVersionService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const maxCreateAttempts = Math.max(1, Math.min(5, Number(options.maxCreateAttempts || 3)));

  async function latestVersionNumber(guildId, planId, rotePhase) {
    const row = first(await store.select('guild_tb_assignment_runs', {
      select: 'version_number',
      guild_id: `eq.${guildId}`,
      plan_id: `eq.${planId}`,
      rote_phase: `eq.${rotePhase}`,
      version_number: 'not.is.null',
      order: 'version_number.desc',
      limit: 1,
    }));
    return Math.max(0, Number(row?.version_number || 0));
  }

  function isVersionConflict(error) {
    return text(error?.code) === '40001' || text(error?.message).includes('TB_ASSIGNMENT_VERSION_CONFLICT');
  }

  async function readVersion(guildId, runId) {
    return first(await store.select('guild_tb_assignment_runs', {
      select: '*',
      guild_id: `eq.${guildId}`,
      id: `eq.${runId}`,
      limit: 1,
    }));
  }

  async function createVersion(context = {}, input = {}) {
    const guildId = text(context?.guild?.id || context?.guildId);
    const actorUserId = text(context?.userId);
    const planId = text(input.planId);
    const rotePhase = normalizeRotePhase(input.rotePhase);
    const inputFingerprint = text(input.inputFingerprint);

    if (!guildId) throw serviceError('Guild context is required.', 400, 'GUILD_CONTEXT_REQUIRED');
    if (!actorUserId) throw serviceError('Officer user context is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
    if (!planId) throw serviceError('A persisted ROTE plan is required.', 400, 'TB_ASSIGNMENT_PLAN_REQUIRED');
    if (!inputFingerprint) throw serviceError('Planner input fingerprint is required.', 400, 'TB_ASSIGNMENT_INPUT_FINGERPRINT_REQUIRED');

    const assignments = array(input.assignments);
    const unfilled = array(input.unfilled);
    const diagnostics = object(input.diagnostics);
    const delivery = object(input.delivery);

    let lastConflict = null;
    for (let attempt = 1; attempt <= maxCreateAttempts; attempt += 1) {
      const versionNumber = (await latestVersionNumber(guildId, planId, rotePhase)) + 1;
      const planHash = computeTbAssignmentPlanHash({
        guildId,
        planId,
        rotePhase,
        versionNumber,
        inputFingerprint,
        assignments,
        unfilled,
        diagnostics,
      });

      try {
        const raw = await store.rpc('create_guild_tb_assignment_version', {
          p_guild_id: guildId,
          p_plan_id: planId,
          p_rote_phase: rotePhase,
          p_version_number: versionNumber,
          p_plan_hash: planHash,
          p_input_fingerprint: inputFingerprint,
          p_assignments: assignments,
          p_unfilled: unfilled,
          p_diagnostics: diagnostics,
          p_delivery: delivery,
          p_actor_user_id: actorUserId,
        });
        const created = rpcObject(raw, 'create_guild_tb_assignment_version');
        const runId = text(created?.runId || created?.run_id);
        if (!runId) throw serviceError('Version creation RPC did not return a run ID.', 502, 'TB_ASSIGNMENT_VERSION_CREATE_INVALID_RESPONSE');

        const run = await readVersion(guildId, runId);
        if (!run) throw serviceError('Created immutable assignment version could not be re-read.', 502, 'TB_ASSIGNMENT_VERSION_READBACK_FAILED');

        const verification = verifyTbAssignmentRunHash(run);
        if (!verification.valid || verification.stored !== planHash) {
          throw serviceError('Created assignment version failed deterministic hash verification.', 500, 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED');
        }

        return Object.freeze({
          version: sanitizeVersion(run),
          verification,
          attempt,
        });
      } catch (error) {
        if (!isVersionConflict(error) || attempt >= maxCreateAttempts) throw error;
        lastConflict = error;
      }
    }

    throw lastConflict || serviceError('Unable to allocate an immutable assignment version.', 409, 'TB_ASSIGNMENT_VERSION_CONFLICT');
  }

  async function approveVersion(context = {}, input = {}) {
    const guildId = text(context?.guild?.id || context?.guildId);
    const actorUserId = text(context?.userId);
    const runId = text(input.runId || input.versionId);
    const confirmedHash = text(input.planHash || input.hash).toLowerCase();

    if (!guildId) throw serviceError('Guild context is required.', 400, 'GUILD_CONTEXT_REQUIRED');
    if (!actorUserId) throw serviceError('Officer user context is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
    if (!runId) throw serviceError('An immutable assignment version ID is required.', 400, 'TB_ASSIGNMENT_VERSION_REQUIRED');
    if (!/^[0-9a-f]{64}$/.test(confirmedHash)) {
      throw serviceError('Approval requires the full 64-character assignment plan hash.', 400, 'TB_ASSIGNMENT_INVALID_HASH');
    }

    const before = await readVersion(guildId, runId);
    if (!before) throw serviceError('Immutable assignment version was not found for this Guild.', 404, 'TB_ASSIGNMENT_VERSION_NOT_FOUND');

    const beforeVerification = verifyTbAssignmentRunHash(before);
    if (!beforeVerification.valid) {
      throw serviceError('Persisted assignment payload does not match its stored hash.', 500, 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED');
    }
    if (beforeVerification.stored !== confirmedHash) {
      throw serviceError('Approval hash does not match the selected immutable assignment version.', 409, 'TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH');
    }

    const raw = await store.rpc('approve_guild_tb_assignment_version', {
      p_guild_id: guildId,
      p_run_id: runId,
      p_plan_hash: confirmedHash,
      p_actor_user_id: actorUserId,
    });
    const approval = rpcObject(raw, 'approve_guild_tb_assignment_version');

    const after = await readVersion(guildId, runId);
    if (!after) throw serviceError('Approved assignment version could not be re-read.', 502, 'TB_ASSIGNMENT_VERSION_READBACK_FAILED');
    const afterVerification = verifyTbAssignmentRunHash(after);
    if (!afterVerification.valid || text(after.approved_plan_hash).toLowerCase() !== confirmedHash || !text(after.approved_at)) {
      throw serviceError('Assignment approval failed post-approval verification.', 500, 'TB_ASSIGNMENT_APPROVAL_VERIFICATION_FAILED');
    }

    return Object.freeze({
      version: sanitizeVersion(after),
      verification: afterVerification,
      approval: Object.freeze(object(approval)),
    });
  }

  return Object.freeze({
    createVersion,
    approveVersion,
    readVersion,
    latestVersionNumber,
  });
}

export const tbAssignmentVersionService = createTbAssignmentVersionService();
