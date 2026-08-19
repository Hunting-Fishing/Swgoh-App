import test from 'node:test';
import assert from 'node:assert/strict';

import { computeTbAssignmentPlanHash } from '../tb-assignment-version-service.mjs';
import { createTbAssignmentPublishabilityService } from '../tb-assignment-publishability-service.mjs';

function makeRun(overrides = {}) {
  const run = {
    id: 'run-4',
    guild_id: 'guild-1',
    plan_id: 'plan-1',
    rote_phase: 'P6',
    version_number: 4,
    status: 'preview',
    input_fingerprint: 'fp-4',
    assignments: [{ id: 'S1', phase: 'P6', baseId: 'UNIT_A', member: { playerId: 'P1' }, safety: { help: false } }],
    unfilled: [],
    diagnostics: { safetySummary: { helpAssignments: 0 } },
    delivery: { mode: 'preview' },
    supersedes_run_id: 'run-3',
    superseded_by_run_id: null,
    approved_at: '2026-08-19T14:30:00.000Z',
    approved_by_user_id: 'officer-2',
    approved_plan_hash: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    created_at: '2026-08-19T14:00:00.000Z',
    ...overrides,
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
  run.approved_plan_hash = overrides.approved_plan_hash ?? run.plan_hash;
  return run;
}

function makeStore(runInput, options = {}) {
  const run = runInput ? { ...runInput } : null;
  const latest = options.latest ? { ...options.latest } : run;
  const inserts = [];
  return {
    inserts,
    async select(table, query) {
      if (table === 'guild_tb_assignment_runs') {
        if (query.id) {
          const requestedId = String(query.id).replace(/^eq\./, '');
          const guildId = String(query.guild_id).replace(/^eq\./, '');
          return run && run.id === requestedId && run.guild_id === guildId ? [run] : [];
        }
        return latest ? [latest] : [];
      }
      if (table === 'guild_tb_plans') {
        if (options.planMissing) return [];
        return [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', status: options.planStatus || 'previewed', updated_at: '2026-08-19T14:10:00.000Z' }];
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async insert(table, rows) {
      if (options.auditFails) throw new Error('audit offline');
      inserts.push({ table, rows });
      return rows;
    },
  };
}

const context = { guild: { id: 'guild-1' }, userId: 'officer-1' };

test('assertPublishable returns the exact verified approved latest artifact', async () => {
  const run = makeRun();
  const store = makeStore(run);
  const service = createTbAssignmentPublishabilityService({ store });

  const result = await service.assertPublishable(context, { runId: run.id, currentPlanId: 'plan-1', phase: 'P6' });

  assert.equal(result.publishable, true);
  assert.equal(result.artifact.id, 'run-4');
  assert.equal(result.artifact.planHash, run.plan_hash);
  assert.equal(result.verification.valid, true);
  assert.equal(store.inserts.length, 0);
});

test('assertPublishable rejects and audits a version without exact approval', async () => {
  const run = makeRun({ approved_at: null, approved_by_user_id: null });
  const store = makeStore(run);
  const service = createTbAssignmentPublishabilityService({ store });

  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_APPROVAL_REQUIRED',
  );
  assert.equal(store.inserts.at(-1).table, 'guild_tb_assignment_decisions');
  assert.equal(store.inserts.at(-1).rows[0].decision, 'publishability_rejected');
  assert.equal(store.inserts.at(-1).rows[0].metadata.code, 'TB_ASSIGNMENT_APPROVAL_REQUIRED');
});

test('assertPublishable rejects cancelled and superseded versions', async () => {
  let run = makeRun({ status: 'cancelled', cancelled_at: '2026-08-19T14:40:00.000Z' });
  let service = createTbAssignmentPublishabilityService({ store: makeStore(run) });
  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_CANCELLED',
  );

  run = makeRun({ superseded_by_run_id: 'run-5' });
  service = createTbAssignmentPublishabilityService({ store: makeStore(run) });
  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_SUPERSEDED',
  );
});

test('assertPublishable rejects approval hash mismatch and persisted payload corruption', async () => {
  let run = makeRun({ approved_plan_hash: 'f'.repeat(64) });
  let service = createTbAssignmentPublishabilityService({ store: makeStore(run) });
  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH',
  );

  run = { ...makeRun(), assignments: [{ id: 'S1', member: { playerId: 'tampered' } }] };
  service = createTbAssignmentPublishabilityService({ store: makeStore(run) });
  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED',
  );
});

test('assertPublishable rejects stale version even if supersede pointer is missing', async () => {
  const run = makeRun();
  const latest = makeRun({ id: 'run-5', version_number: 5, input_fingerprint: 'fp-5', supersedes_run_id: 'run-4' });
  const store = makeStore(run, { latest });
  const service = createTbAssignmentPublishabilityService({ store });

  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_STALE_VERSION',
  );
  assert.equal(store.inserts.at(-1).rows[0].metadata.latestRunId, 'run-5');
});

test('assertPublishable rejects current plan mismatch and archived source plans', async () => {
  const run = makeRun();
  let service = createTbAssignmentPublishabilityService({ store: makeStore(run) });
  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id, currentPlanId: 'plan-new' }),
    (error) => error?.code === 'TB_ASSIGNMENT_CURRENT_PLAN_MISMATCH',
  );

  service = createTbAssignmentPublishabilityService({ store: makeStore(run, { planStatus: 'archived' }) });
  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_SOURCE_PLAN_STALE',
  );
});

test('assertPublishable fails closed when rejection audit cannot be written', async () => {
  const run = makeRun({ approved_at: null, approved_by_user_id: null });
  const service = createTbAssignmentPublishabilityService({ store: makeStore(run, { auditFails: true }) });

  await assert.rejects(
    () => service.assertPublishable(context, { runId: run.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_PUBLISHABILITY_AUDIT_FAILED',
  );
});

test('assertPublishable records unknown/wrong-Guild version rejection in the general operations audit', async () => {
  const store = makeStore(null);
  const service = createTbAssignmentPublishabilityService({ store });

  await assert.rejects(
    () => service.assertPublishable(context, { runId: 'not-in-guild' }),
    (error) => error?.code === 'TB_ASSIGNMENT_VERSION_NOT_FOUND',
  );
  assert.equal(store.inserts.at(-1).table, 'guild_operations_audit_log');
  assert.equal(store.inserts.at(-1).rows[0].metadata.code, 'TB_ASSIGNMENT_VERSION_NOT_FOUND');
});
