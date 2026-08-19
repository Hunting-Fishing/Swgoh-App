import { supabaseCoreStore } from './supabase-core-store.mjs';
import { compareTbAssignmentVersions } from './tb-assignment-version-diff.mjs';
import { verifyTbAssignmentRunHash } from './tb-assignment-version-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
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

export function createTbAssignmentVersionCompareService(options = {}) {
  const store = options.store || supabaseCoreStore;

  async function readImmutableVersion(guildId, runId) {
    const run = first(await store.select('guild_tb_assignment_runs', {
      select: '*',
      guild_id: `eq.${guildId}`,
      id: `eq.${runId}`,
      version_number: 'not.is.null',
      plan_hash: 'not.is.null',
      limit: 1,
    }));
    if (!run) throw serviceError('Immutable assignment version was not found for this Guild.', 404, 'TB_ASSIGNMENT_VERSION_NOT_FOUND');
    const verification = verifyTbAssignmentRunHash(run);
    if (!verification.valid) {
      throw serviceError('Persisted assignment payload does not match its stored hash.', 500, 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED');
    }
    return run;
  }

  async function compareVersions(context = {}, input = {}) {
    const { guildId } = requireContext(context);
    const fromRunId = text(input.fromRunId || input.fromVersionId || input.from);
    const toRunId = text(input.toRunId || input.toVersionId || input.to);
    if (!fromRunId || !toRunId) {
      throw serviceError('Both immutable assignment version IDs are required.', 400, 'TB_ASSIGNMENT_DIFF_VERSIONS_REQUIRED');
    }
    if (fromRunId === toRunId) {
      throw serviceError('Choose two different immutable assignment versions to compare.', 400, 'TB_ASSIGNMENT_DIFF_SAME_VERSION');
    }

    const [fromRun, toRun] = await Promise.all([
      readImmutableVersion(guildId, fromRunId),
      readImmutableVersion(guildId, toRunId),
    ]);

    if (text(fromRun.plan_id) !== text(toRun.plan_id)) {
      throw serviceError('Assignment versions must belong to the same ROTE plan.', 409, 'TB_ASSIGNMENT_DIFF_PLAN_MISMATCH');
    }
    if (text(fromRun.rote_phase) !== text(toRun.rote_phase)) {
      throw serviceError('Assignment versions must belong to the same ROTE phase.', 409, 'TB_ASSIGNMENT_DIFF_PHASE_MISMATCH');
    }

    return Object.freeze({
      guildId,
      planId: text(fromRun.plan_id),
      rotePhase: text(fromRun.rote_phase),
      diff: compareTbAssignmentVersions(fromRun, toRun),
    });
  }

  return Object.freeze({ compareVersions });
}

export const tbAssignmentVersionCompareService = createTbAssignmentVersionCompareService();
