import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbAssignmentVersionService } from '../tb-assignment-version-service.mjs';

function mockStore(options = {}) {
  let latest = Number(options.latest || 0);
  let createdRun = null;
  let rpcCalls = 0;
  let conflictRemaining = Number(options.conflicts || 0);

  return {
    state: () => ({ latest, createdRun, rpcCalls }),
    async select(table, query) {
      assert.equal(table, 'guild_tb_assignment_runs');
      if (query.id) return createdRun ? [createdRun] : [];
      return latest > 0 ? [{ version_number: latest }] : [];
    },
    async rpc(name, params) {
      assert.equal(name, 'create_guild_tb_assignment_version');
      rpcCalls += 1;
      if (conflictRemaining > 0) {
        conflictRemaining -= 1;
        latest = Math.max(latest + 1, params.p_version_number);
        const error = new Error('TB_ASSIGNMENT_VERSION_CONFLICT expected newer version');
        error.code = '40001';
        throw error;
      }
      if (options.rpcError) throw options.rpcError;

      latest = params.p_version_number;
      createdRun = {
        id: `run-${latest}`,
        guild_id: params.p_guild_id,
        plan_id: params.p_plan_id,
        status: 'preview',
        input_fingerprint: params.p_input_fingerprint,
        assignments: params.p_assignments,
        unfilled: params.p_unfilled,
        diagnostics: params.p_diagnostics,
        delivery: params.p_delivery,
        rote_phase: params.p_rote_phase,
        version_number: params.p_version_number,
        plan_hash: options.corruptReadbackHash ? '0'.repeat(64) : params.p_plan_hash,
        supersedes_run_id: latest > 1 ? `run-${latest - 1}` : null,
        superseded_by_run_id: null,
        created_at: '2026-08-19T14:00:00.000Z',
      };
      return { runId: createdRun.id, versionNumber: latest, planHash: params.p_plan_hash };
    },
  };
}

const context = { guild: { id: 'guild-1' }, userId: 'officer-1' };
const input = {
  planId: 'plan-1',
  rotePhase: 'p6',
  inputFingerprint: 'planner-fingerprint-1',
  assignments: [{ slotId: 'S1', playerId: 'P1', baseId: 'UNIT_A' }],
  unfilled: [{ slotId: 'S2', reason: 'HELP' }],
  diagnostics: { helpCount: 1 },
  delivery: { mode: 'preview' },
};

test('createVersion hashes, atomically creates and verifies the next immutable version', async () => {
  const store = mockStore({ latest: 2 });
  const service = createTbAssignmentVersionService({ store });

  const result = await service.createVersion(context, input);

  assert.equal(result.attempt, 1);
  assert.equal(result.version.versionNumber, 3);
  assert.equal(result.version.rotePhase, 'P6');
  assert.match(result.version.planHash, /^[0-9a-f]{64}$/);
  assert.equal(result.verification.valid, true);
  assert.equal(store.state().rpcCalls, 1);
});

test('createVersion retries only a serialized version-allocation conflict', async () => {
  const store = mockStore({ latest: 1, conflicts: 1 });
  const service = createTbAssignmentVersionService({ store, maxCreateAttempts: 3 });

  const result = await service.createVersion(context, input);

  assert.equal(result.attempt, 2);
  assert.equal(result.version.versionNumber, 3);
  assert.equal(store.state().rpcCalls, 2);
});

test('createVersion does not retry non-conflict RPC failures', async () => {
  const error = new Error('TB_ASSIGNMENT_PLAN_NOT_FOUND');
  error.code = 'P0002';
  const store = mockStore({ latest: 0, rpcError: error });
  const service = createTbAssignmentVersionService({ store, maxCreateAttempts: 3 });

  await assert.rejects(() => service.createVersion(context, input), (caught) => caught === error);
  assert.equal(store.state().rpcCalls, 1);
});

test('createVersion fails closed when read-back hash does not match persisted payload', async () => {
  const store = mockStore({ latest: 0, corruptReadbackHash: true });
  const service = createTbAssignmentVersionService({ store });

  await assert.rejects(
    () => service.createVersion(context, input),
    (error) => error?.code === 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED',
  );
});

test('createVersion requires a non-empty planner input fingerprint', async () => {
  const store = mockStore();
  const service = createTbAssignmentVersionService({ store });

  await assert.rejects(
    () => service.createVersion(context, { ...input, inputFingerprint: '' }),
    (error) => error?.code === 'TB_ASSIGNMENT_INPUT_FINGERPRINT_REQUIRED',
  );
  assert.equal(store.state().rpcCalls, 0);
});
