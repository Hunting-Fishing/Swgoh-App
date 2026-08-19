import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTbAssignmentPlanHash,
  createTbAssignmentVersionService,
} from '../tb-assignment-version-service.mjs';

function makeRun() {
  const run = {
    id: 'run-4',
    guild_id: 'guild-1',
    plan_id: 'plan-1',
    status: 'preview',
    input_fingerprint: 'fp-4',
    assignments: [{ slotId: 'S1', playerId: 'P1' }],
    unfilled: [],
    diagnostics: { helpCount: 0 },
    delivery: { mode: 'preview' },
    rote_phase: 'P4',
    version_number: 4,
    supersedes_run_id: 'run-3',
    superseded_by_run_id: null,
    approved_at: '2026-08-19T14:15:00.000Z',
    approved_by_user_id: 'officer-2',
    approved_plan_hash: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    created_at: '2026-08-19T14:00:00.000Z',
  };
  run.plan_hash = computeTbAssignmentPlanHash({
    guildId: run.guild_id,
    planId: run.plan_id,
    rotePhase: run.rote_phase,
    versionNumber: run.version_number,
    inputFingerprint: run.input_fingerprint,
    assignments: run.assignments,
    unfilled: run.unfilled,
    diagnostics: run.diagnostics,
  });
  run.approved_plan_hash = run.plan_hash;
  return run;
}

function cancellationStore(runInput) {
  let run = { ...runInput };
  let rpcCalls = 0;
  return {
    state: () => ({ run, rpcCalls }),
    async select(table) {
      assert.equal(table, 'guild_tb_assignment_runs');
      return [run];
    },
    async rpc(name, params) {
      assert.equal(name, 'cancel_guild_tb_assignment_version');
      rpcCalls += 1;
      run = {
        ...run,
        status: 'cancelled',
        cancelled_at: '2026-08-19T14:45:00.000Z',
        cancelled_by_user_id: params.p_actor_user_id,
        cancellation_reason: params.p_reason,
      };
      return {
        runId: run.id,
        cancelledAt: run.cancelled_at,
        cancelledByUserId: run.cancelled_by_user_id,
        reason: run.cancellation_reason,
        alreadyCancelled: false,
      };
    },
  };
}

const context = { guild: { id: 'guild-1' }, userId: 'officer-1' };

test('cancelVersion cancels an approved immutable version without changing its hash payload', async () => {
  const run = makeRun();
  const store = cancellationStore(run);
  const service = createTbAssignmentVersionService({ store });

  const result = await service.cancelVersion(context, { runId: run.id, reason: 'Roster changed before delivery.' });

  assert.equal(store.state().rpcCalls, 1);
  assert.equal(result.version.status, 'cancelled');
  assert.equal(result.version.cancelledByUserId, 'officer-1');
  assert.equal(result.version.cancellationReason, 'Roster changed before delivery.');
  assert.equal(result.version.planHash, run.plan_hash);
  assert.equal(result.hashVerification.valid, true);
});

test('cancelVersion truncates officer reason to the persisted 500-character bound', async () => {
  const run = makeRun();
  const store = cancellationStore(run);
  const service = createTbAssignmentVersionService({ store });

  await service.cancelVersion(context, { runId: run.id, reason: 'x'.repeat(800) });

  assert.equal(store.state().run.cancellation_reason.length, 500);
});

test('cancelVersion requires officer and immutable version identity context', async () => {
  const run = makeRun();
  const store = cancellationStore(run);
  const service = createTbAssignmentVersionService({ store });

  await assert.rejects(
    () => service.cancelVersion({ guild: { id: 'guild-1' }, userId: '' }, { runId: run.id }),
    (error) => error?.code === 'OFFICER_CONTEXT_REQUIRED',
  );
  await assert.rejects(
    () => service.cancelVersion(context, {}),
    (error) => error?.code === 'TB_ASSIGNMENT_VERSION_REQUIRED',
  );
  assert.equal(store.state().rpcCalls, 0);
});
