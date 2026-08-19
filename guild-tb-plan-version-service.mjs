import { createHash } from 'node:crypto';
import { createGuildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => Array.isArray(value) ? (value[0] || null) : (value || null);
const nowIso = () => new Date().toISOString();

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function error(message, code, status = 409) {
  const value = new Error(message);
  value.code = code;
  value.status = status;
  return value;
}

function phase(value) {
  const normalized = text(value).toUpperCase();
  if (!/^P[1-6]$/.test(normalized)) throw error('ROTE phase must be P1 through P6.', 'INVALID_ROTE_PHASE', 400);
  return normalized;
}

function uuidOrEmpty(value, label = 'ID') {
  const normalized = text(value);
  if (!normalized) return '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw error(`${label} must be a valid UUID.`, 'INVALID_UUID', 400);
  }
  return normalized;
}

function canonical(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      result[key] = canonical(value[key]);
    }
    return result;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  return String(value);
}

function stableStringify(value) {
  return JSON.stringify(canonical(value));
}

function canonicalRows(rows) {
  return array(rows)
    .map((row) => canonical(row))
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

export function canonicalTbAssignmentPayload(input = {}) {
  return Object.freeze({
    schemaVersion: 1,
    tbKey: 'rote',
    planId: text(input.planId) || null,
    phase: phase(input.phase),
    inputFingerprint: text(input.inputFingerprint) || null,
    assignments: Object.freeze(canonicalRows(input.assignments)),
    unfilled: Object.freeze(canonicalRows(input.unfilled)),
    diagnostics: canonical(object(input.diagnostics)),
  });
}

export function hashTbAssignmentPayload(input = {}) {
  const payload = canonicalTbAssignmentPayload(input);
  return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

function runHashInput(run = {}) {
  return {
    planId: text(run.plan_id),
    phase: run.rote_phase,
    inputFingerprint: run.input_fingerprint,
    assignments: run.assignments,
    unfilled: run.unfilled,
    diagnostics: run.diagnostics,
  };
}

function slotId(row = {}, index = 0) {
  const explicit = text(row.id || row.slotId || row.slot_id);
  if (explicit) return explicit;
  return [
    text(row.phase),
    text(row.conflictId || row.conflict_id),
    text(row.squadId || row.squad_id),
    text(row.baseId || row.base_id),
    text(row.name),
    String(index),
  ].join('|');
}

function donorId(row = {}) {
  return text(row?.member?.playerId || row?.member?.allyCode || row?.member?.name || row.playerId || row.player_id || row.memberId);
}

function isRisky(row = {}) {
  const status = text(row?.safety?.status || 'SAFE').toUpperCase();
  return row?.safety?.help === true || row?.safety?.forced === true || status !== 'SAFE';
}

function compactAssignment(row = {}, index = 0) {
  return Object.freeze({
    slotId: slotId(row, index),
    phase: text(row.phase),
    conflictId: text(row.conflictId || row.conflict_id),
    squadId: text(row.squadId || row.squad_id),
    baseId: text(row.baseId || row.base_id),
    unitName: text(row.name),
    donorId: donorId(row),
    donorName: text(row?.member?.name),
    safetyStatus: text(row?.safety?.status || 'SAFE'),
    risky: isRisky(row),
  });
}

function versionDelta(fromRun = {}, toRun = {}) {
  const fromAssignments = new Map(array(fromRun.assignments).map((row, index) => [slotId(row, index), compactAssignment(row, index)]));
  const toAssignments = new Map(array(toRun.assignments).map((row, index) => [slotId(row, index), compactAssignment(row, index)]));
  const fromUnfilled = new Map(array(fromRun.unfilled).map((row, index) => [slotId(row, index), row]));
  const toUnfilled = new Map(array(toRun.unfilled).map((row, index) => [slotId(row, index), row]));

  const changedDonors = [];
  const addedAssignments = [];
  const removedAssignments = [];
  const newlyFilled = [];
  const newlyUnfilled = [];

  for (const [key, next] of toAssignments.entries()) {
    const previous = fromAssignments.get(key);
    if (!previous) addedAssignments.push(next);
    else if (previous.donorId !== next.donorId) changedDonors.push(Object.freeze({ slotId: key, from: previous, to: next }));
    if (fromUnfilled.has(key)) newlyFilled.push(next);
  }
  for (const [key, previous] of fromAssignments.entries()) {
    if (!toAssignments.has(key)) removedAssignments.push(previous);
    if (toUnfilled.has(key)) newlyUnfilled.push(previous);
  }

  const fromRisk = [...fromAssignments.values()].filter((row) => row.risky).length;
  const toRisk = [...toAssignments.values()].filter((row) => row.risky).length;

  return Object.freeze({
    fromRunId: text(fromRun.id),
    toRunId: text(toRun.id),
    fromVersion: Number(fromRun.version_number || 0),
    toVersion: Number(toRun.version_number || 0),
    changedDonors: Object.freeze(changedDonors),
    addedAssignments: Object.freeze(addedAssignments),
    removedAssignments: Object.freeze(removedAssignments),
    newlyFilled: Object.freeze(newlyFilled),
    newlyUnfilled: Object.freeze(newlyUnfilled),
    risk: Object.freeze({ from: fromRisk, to: toRisk, delta: toRisk - fromRisk }),
    assigned: Object.freeze({ from: fromAssignments.size, to: toAssignments.size, delta: toAssignments.size - fromAssignments.size }),
    unfilled: Object.freeze({ from: fromUnfilled.size, to: toUnfilled.size, delta: toUnfilled.size - fromUnfilled.size }),
  });
}

async function latestApproval(store, runId) {
  const rows = await store.select('guild_tb_assignment_run_approvals', {
    select: 'id,guild_id,run_id,plan_hash,decision,actor_user_id,reason,metadata,created_at',
    run_id: `eq.${runId}`,
    order: 'created_at.desc',
    limit: 1,
  });
  return first(rows);
}

async function readRun(store, guildId, runId) {
  const rows = await store.select('guild_tb_assignment_runs', {
    select: '*',
    id: `eq.${uuidOrEmpty(runId, 'Assignment version ID')}`,
    guild_id: `eq.${guildId}`,
    limit: 1,
  });
  const run = first(rows);
  if (!run) throw error('That immutable TB assignment version was not found in this Guild.', 'TB_ASSIGNMENT_VERSION_NOT_FOUND', 404);
  return run;
}

async function newerVersion(store, run) {
  const query = {
    select: 'id,version_number,plan_hash,created_at',
    guild_id: `eq.${run.guild_id}`,
    rote_phase: `eq.${run.rote_phase}`,
    version_number: `gt.${Number(run.version_number || 0)}`,
    order: 'version_number.desc',
    limit: 1,
  };
  query.plan_id = run.plan_id ? `eq.${run.plan_id}` : 'is.null';
  return first(await store.select('guild_tb_assignment_runs', query));
}

export async function assertTbAssignmentRunPublishable({ store = supabaseCoreStore, guildId, runId } = {}) {
  const normalizedGuildId = uuidOrEmpty(guildId, 'Guild ID');
  if (!normalizedGuildId) throw error('Guild ID is required.', 'GUILD_ID_REQUIRED', 400);
  const run = await readRun(store, normalizedGuildId, runId);
  if (!run.plan_hash) throw error('Assignment version has no immutable plan hash.', 'TB_PLAN_HASH_MISSING');
  const recomputed = hashTbAssignmentPayload(runHashInput(run));
  if (recomputed !== text(run.plan_hash)) throw error('Stored assignment payload no longer matches its immutable plan hash.', 'TB_PLAN_HASH_MISMATCH');
  if (text(run.status).toLowerCase() === 'cancelled' || run.cancelled_at) throw error('Cancelled assignment version cannot be published.', 'TB_ASSIGNMENT_VERSION_CANCELLED');
  if (run.superseded_by_run_id) throw error('Superseded assignment version cannot be published.', 'TB_ASSIGNMENT_VERSION_SUPERSEDED');
  const newer = await newerVersion(store, run);
  if (newer) throw error('A newer assignment version exists for this plan and phase.', 'TB_ASSIGNMENT_VERSION_STALE');
  const approval = await latestApproval(store, run.id);
  if (!approval || text(approval.decision) !== 'approved') throw error('Exact officer approval is required before publishing this assignment version.', 'TB_ASSIGNMENT_APPROVAL_REQUIRED');
  if (text(approval.plan_hash) !== text(run.plan_hash)) throw error('Officer approval does not match the immutable assignment hash.', 'TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH');
  return Object.freeze({ publishable: true, run, approval, recomputedHash: recomputed });
}

export function createGuildTbPlanVersionService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const operations = options.operationsService || createGuildOperationsService({ store });
  const now = typeof options.now === 'function' ? options.now : nowIso;

  async function audit(context, action, runId, metadata = {}) {
    await store.insert('guild_operations_audit_log', [{
      guild_id: context.guild.id,
      actor_user_id: context.userId,
      action,
      entity_type: 'guild_tb_assignment_run',
      entity_id: text(runId) || null,
      metadata: object(metadata),
      occurred_at: now(),
    }], { returning: false });
  }

  async function requirePlan(context, planIdInput) {
    const planId = uuidOrEmpty(planIdInput, 'TB plan ID');
    if (!planId) return '';
    const rows = await store.select('guild_tb_plans', {
      select: 'id,guild_id,name,status,updated_at',
      id: `eq.${planId}`,
      guild_id: `eq.${context.guild.id}`,
      limit: 1,
    });
    if (!first(rows)) throw error('TB plan was not found in this Guild.', 'TB_PLAN_NOT_FOUND', 404);
    return planId;
  }

  async function createVersion(userId, lookupAllyCode, input = {}) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const planId = await requirePlan(context, input.planId);
    const rotePhase = phase(input.phase);
    const hashInput = {
      planId,
      phase: rotePhase,
      inputFingerprint: input.inputFingerprint,
      assignments: input.assignments,
      unfilled: input.unfilled,
      diagnostics: input.diagnostics,
    };
    const planHash = hashTbAssignmentPayload(hashInput);
    const created = first(await store.rpc('create_guild_tb_assignment_version', {
      p_guild_id: context.guild.id,
      p_plan_id: planId || null,
      p_rote_phase: rotePhase,
      p_plan_hash: planHash,
      p_input_fingerprint: text(input.inputFingerprint) || null,
      p_assignments: array(input.assignments),
      p_unfilled: array(input.unfilled),
      p_diagnostics: object(input.diagnostics),
      p_created_by_user_id: context.userId,
    }));
    if (!created?.id) throw error('Immutable assignment version could not be persisted.', 'TB_ASSIGNMENT_VERSION_CREATE_FAILED', 503);
    await audit(context, 'tb-assignment-version.create', created.id, {
      phase: rotePhase,
      versionNumber: Number(created.version_number || 0),
      planHash,
      supersedesRunId: text(created.supersedes_run_id) || null,
      assigned: array(created.assignments).length,
      unfilled: array(created.unfilled).length,
    });
    return Object.freeze({ ...created, planHash });
  }

  async function listVersions(userId, lookupAllyCode, input = {}) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const query = {
      select: 'id,guild_id,plan_id,status,rote_phase,version_number,plan_hash,input_fingerprint,diagnostics,created_by_user_id,created_at,supersedes_run_id,superseded_by_run_id,cancelled_at,cancelled_by_user_id',
      guild_id: `eq.${context.guild.id}`,
      order: 'created_at.desc',
      limit: Math.min(50, Math.max(1, Number(input.limit || 20))),
    };
    if (input.phase) query.rote_phase = `eq.${phase(input.phase)}`;
    if (input.planId) query.plan_id = `eq.${uuidOrEmpty(input.planId, 'TB plan ID')}`;
    const rows = array(await store.select('guild_tb_assignment_runs', query));
    const result = [];
    for (const row of rows) result.push(Object.freeze({ ...row, approval: await latestApproval(store, row.id) }));
    return Object.freeze(result);
  }

  async function getVersion(userId, lookupAllyCode, runId) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const run = await readRun(store, context.guild.id, runId);
    const approval = await latestApproval(store, run.id);
    const recomputedHash = run.plan_hash ? hashTbAssignmentPayload(runHashInput(run)) : '';
    return Object.freeze({ ...run, approval, recomputedHash, hashValid: Boolean(run.plan_hash && recomputedHash === run.plan_hash) });
  }

  async function approveVersion(userId, lookupAllyCode, runId, expectedHash) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const run = await readRun(store, context.guild.id, runId);
    if (!run.plan_hash) throw error('Assignment version has no immutable plan hash.', 'TB_PLAN_HASH_MISSING');
    const confirmation = text(expectedHash).toLowerCase();
    if (!/^[0-9a-f]{12,64}$/.test(confirmation)) throw error('Approval requires at least the first 12 hexadecimal characters of the plan hash.', 'TB_PLAN_HASH_CONFIRMATION_REQUIRED', 400);
    if (!text(run.plan_hash).startsWith(confirmation)) throw error('Hash confirmation does not match this assignment version.', 'TB_PLAN_HASH_CONFIRMATION_MISMATCH');
    const recomputed = hashTbAssignmentPayload(runHashInput(run));
    if (recomputed !== text(run.plan_hash)) throw error('Stored assignment payload does not match its immutable hash.', 'TB_PLAN_HASH_MISMATCH');
    if (text(run.status).toLowerCase() === 'cancelled' || run.cancelled_at) throw error('Cancelled assignment version cannot be approved.', 'TB_ASSIGNMENT_VERSION_CANCELLED');
    if (run.superseded_by_run_id || await newerVersion(store, run)) throw error('Only the newest non-superseded version can be approved.', 'TB_ASSIGNMENT_VERSION_STALE');
    const previous = await latestApproval(store, run.id);
    if (previous?.decision === 'approved' && previous?.plan_hash === run.plan_hash) {
      return Object.freeze({ run, approval: previous, idempotent: true });
    }
    const approval = first(await store.insert('guild_tb_assignment_run_approvals', [{
      guild_id: context.guild.id,
      run_id: run.id,
      plan_hash: run.plan_hash,
      decision: 'approved',
      actor_user_id: context.userId,
      reason: text(arguments?.[4]?.reason) || null,
      metadata: { versionNumber: Number(run.version_number || 0), phase: run.rote_phase },
    }]));
    await audit(context, 'tb-assignment-version.approve', run.id, {
      phase: run.rote_phase,
      versionNumber: Number(run.version_number || 0),
      planHash: run.plan_hash,
    });
    return Object.freeze({ run, approval, idempotent: false });
  }

  async function cancelVersion(userId, lookupAllyCode, runId, reason = '') {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const run = await readRun(store, context.guild.id, runId);
    if (text(run.status).toLowerCase() === 'published') throw error('Published assignment versions cannot be cancelled retroactively.', 'TB_ASSIGNMENT_ALREADY_PUBLISHED');
    if (text(run.status).toLowerCase() === 'cancelled' || run.cancelled_at) return Object.freeze({ ...run, idempotent: true });
    const updated = first(await store.update('guild_tb_assignment_runs', {
      id: `eq.${run.id}`,
      guild_id: `eq.${context.guild.id}`,
    }, {
      status: 'cancelled',
      cancelled_at: now(),
      cancelled_by_user_id: context.userId,
    }));
    const approval = await latestApproval(store, run.id);
    if (approval?.decision === 'approved') {
      await store.insert('guild_tb_assignment_run_approvals', [{
        guild_id: context.guild.id,
        run_id: run.id,
        plan_hash: run.plan_hash,
        decision: 'revoked',
        actor_user_id: context.userId,
        reason: text(reason) || 'Assignment version cancelled.',
        metadata: { previousApprovalId: approval.id },
      }]);
    }
    await audit(context, 'tb-assignment-version.cancel', run.id, {
      phase: run.rote_phase,
      versionNumber: Number(run.version_number || 0),
      planHash: run.plan_hash,
      reason: text(reason) || null,
    });
    return Object.freeze({ ...updated, idempotent: false });
  }

  async function compareVersions(userId, lookupAllyCode, fromRunId, toRunId) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const fromRun = await readRun(store, context.guild.id, fromRunId);
    const toRun = await readRun(store, context.guild.id, toRunId);
    return versionDelta(fromRun, toRun);
  }

  async function assertPublishable(userId, lookupAllyCode, runId) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    try {
      return await assertTbAssignmentRunPublishable({ store, guildId: context.guild.id, runId });
    } catch (cause) {
      await audit(context, 'tb-assignment-version.publishability-denied', runId, {
        code: text(cause?.code) || 'TB_ASSIGNMENT_NOT_PUBLISHABLE',
        message: text(cause?.message),
      });
      throw cause;
    }
  }

  return Object.freeze({
    createVersion,
    listVersions,
    getVersion,
    approveVersion,
    cancelVersion,
    compareVersions,
    assertPublishable,
  });
}

export const guildTbPlanVersionService = createGuildTbPlanVersionService();
