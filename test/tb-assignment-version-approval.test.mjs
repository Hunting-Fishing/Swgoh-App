import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTbAssignmentPlanHash,
  createTbAssignmentVersionService,
} from '../tb-assignment-version-service.mjs';

function makeRun(overrides = {}) {
  const run = {
    id: 'run-7',
    guild_id: 'guild-1',
    plan_id: 'plan-1',
    status: 'preview',
    input_fingerprint: 'fp-7',
    assignments: [{ slotId: 'S1', playerId: 'P1' }],
    unfilled: [],
    diagnostics: { helpCount: 0 },
    delivery: { mode: 'preview' },
    rote_phase: 'P6',
    version_number: 7,
    supersedes_run_id: 'run-6',
    superseded_by_run_id: null,
    approved_at: null,
    approved_by_user_id: null,
    approved_plan_hash: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    created_at: '2026-08-19T14:00:00.000Z',
    ...overrides,
  };
  run.plan_hash = overrides.plan_hash || computeTbAssignmentPlanHash({
    guildId: run.guild_id,
    planId: run.plan_id,
    rotePhase: run.rote_phase,
    versionNumber: run.version_number,
    inputFingerprint: run.input_fingerprint,
    assignments: run.assignments,
    unfilled: run.unfilled,
    diagnostics: run.diagnostics,
  });
  return run;
}

function approvalStore(runInput) {
  let run = { ...runInput };
  let rpcCalls = 0;
  return {
    state: () => ({ run, rpcCalls }),
    async select(table) {
      assert.equal(table, 'guild_tb_assignment_runs');
      return [run];
    },
    async rpc(name, params) {
      assert.equal(name, 'approve_guild_tb_assignment_version');
      rpcCalls += 1;
      assert.equal(params.p_guild_id, run.guild_id);
      assert.equal(params.p_run_id, run.id);
      assert.equal(params.p_plan_hash, run.plan_hash);
      run = {
        ...run,
        approved_at: '2026-08-19T14:30:00.000Z',
        approved_by_user_id: params.p_actor_user_id,
        approved_plan_hash: params.p_plan_hash,
      };
      return {
        runId: run.id,
        planHash: run.plan_hash,
        approvedAt: run.approved_at,
        approvedByUserId: run.approved_by_user_id,
        alreadyApproved: false,
      };
    },
  };
}

const context = { guild: { id: 'guild-1' }, userId: 'officer-1' };

test('approveVersion recomputes persisted hash before exact-hash approval', async () => {
  const run = makeRun();
  const store = approvalStore(run);
  const service = createTbAssignmentVersionService({ store });

  const result = await service.approveVersion(context, { runId: run.id, planHash: run.plan_hash });

  assert.equal(store.state().rpcCalls, 1);
  assert.equal(result.verification.valid, true);
  assert.equal(result.version.approvedPlanHash, run.plan_hash);
  assert.equal(result.version.approvedByUserId, 'officer-1');
});

test('approveVersion rejects a different confirmation hash before the approval RPC', async () => {
  const run = makeRun();
  const store = approvalStore(run);
  const service = createTbAssignmentVersionService({ store });
  const differentHash = run.plan_hash[0] === 'a' ? `b${run.plan_hash.slice(1)}` : `a${run.plan_hash.slice(1)}`;

  await assert.rejects(
    () => service.approveVersion(context, { runId: run.id, planHash: differentHash }),
    (error) => error?.code === 'TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH',
  );
  assert.equal(store.state().rpcCalls, 0);
});

test('approveVersion rejects a tampered persisted payload before the approval RPC', async () => {
  const valid = makeRun();
  const tampered = { ...valid, assignments: [{ slotId: 'S1', playerId: 'P9' }] };
  const store = approvalStore(tampered);
  const service = createTbAssignmentVersionService({ store });

  await assert.rejects(
    () => service.approveVersion(context, { runId: valid.id, planHash: valid.plan_hash }),
    (error) => error?.code === 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED',
  );
  assert.equal(store.state().rpcCalls, 0);
});

test('approveVersion requires the complete 64-character hash', async () => {
  const run = makeRun();
  const store = approvalStore(run);
  const service = createTbAssignmentVersionService({ store });

  await assert.rejects(
    () => service.approveVersion(context, { runId: run.id, planHash: run.plan_hash.slice(0, 12) }),
    (error) => error?.code === 'TB_ASSIGNMENT_INVALID_HASH',
  );
  assert.equal(store.state().rpcCalls, 0);
});
