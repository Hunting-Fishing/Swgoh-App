import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTbAssignmentPlanHash,
  createTbAssignmentVersionService,
} from '../tb-assignment-version-service.mjs';

function makeRun(versionNumber, overrides = {}) {
  const run = {
    id: `run-${versionNumber}`,
    guild_id: 'guild-1',
    plan_id: 'plan-1',
    status: 'preview',
    input_fingerprint: `fp-${versionNumber}`,
    assignments: [{ slotId: 'S1', playerId: `P${versionNumber}` }],
    unfilled: [],
    diagnostics: { helpCount: versionNumber % 2 },
    delivery: { mode: 'preview' },
    rote_phase: 'P6',
    version_number: versionNumber,
    supersedes_run_id: versionNumber > 1 ? `run-${versionNumber - 1}` : null,
    superseded_by_run_id: null,
    approved_at: null,
    approved_by_user_id: null,
    approved_plan_hash: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    created_at: `2026-08-19T14:${String(versionNumber).padStart(2, '0')}:00.000Z`,
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
  return run;
}

function readStore(rowsInput) {
  const rows = [...rowsInput];
  const calls = [];
  return {
    calls,
    async select(table, query) {
      assert.equal(table, 'guild_tb_assignment_runs');
      calls.push(query);
      let result = rows.filter((row) => row.guild_id === String(query.guild_id || '').replace(/^eq\./, ''));
      if (query.id) result = result.filter((row) => row.id === String(query.id).replace(/^eq\./, ''));
      if (query.plan_id) result = result.filter((row) => row.plan_id === String(query.plan_id).replace(/^eq\./, ''));
      if (query.rote_phase) result = result.filter((row) => row.rote_phase === String(query.rote_phase).replace(/^eq\./, ''));
      if (query.version_number === 'not.is.null') result = result.filter((row) => row.version_number != null);
      if (query.plan_hash === 'not.is.null') result = result.filter((row) => row.plan_hash != null);
      if (query.order === 'created_at.desc') result.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return result.slice(0, Number(query.limit || result.length));
    },
  };
}

const context = { guild: { id: 'guild-1' }, userId: 'officer-1' };

test('getVersion returns a sanitized immutable version with deterministic hash verification', async () => {
  const run = makeRun(3);
  const service = createTbAssignmentVersionService({ store: readStore([run]) });

  const result = await service.getVersion(context, { runId: run.id });

  assert.equal(result.version.id, 'run-3');
  assert.equal(result.version.versionNumber, 3);
  assert.equal(result.version.rotePhase, 'P6');
  assert.equal(result.verification.valid, true);
});

test('getVersion excludes historical non-versioned TB runs from Stage 9 identity', async () => {
  const legacy = {
    ...makeRun(1),
    id: 'legacy-run',
    version_number: null,
    plan_hash: null,
  };
  const service = createTbAssignmentVersionService({ store: readStore([legacy]) });

  await assert.rejects(
    () => service.getVersion(context, { runId: legacy.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_VERSION_NOT_FOUND',
  );
});

test('listVersions filters by Guild, plan and phase and returns newest immutable versions first', async () => {
  const v1 = makeRun(1);
  const v2 = makeRun(2);
  const otherPlan = makeRun(3, { id: 'other-plan-run', plan_id: 'plan-2' });
  const otherGuild = makeRun(4, { id: 'other-guild-run', guild_id: 'guild-2' });
  otherPlan.plan_hash = computeTbAssignmentPlanHash({
    guildId: otherPlan.guild_id,
    planId: otherPlan.plan_id,
    rotePhase: otherPlan.rote_phase,
    versionNumber: otherPlan.version_number,
    inputFingerprint: otherPlan.input_fingerprint,
    assignments: otherPlan.assignments,
    unfilled: otherPlan.unfilled,
    diagnostics: otherPlan.diagnostics,
  });
  otherGuild.plan_hash = computeTbAssignmentPlanHash({
    guildId: otherGuild.guild_id,
    planId: otherGuild.plan_id,
    rotePhase: otherGuild.rote_phase,
    versionNumber: otherGuild.version_number,
    inputFingerprint: otherGuild.input_fingerprint,
    assignments: otherGuild.assignments,
    unfilled: otherGuild.unfilled,
    diagnostics: otherGuild.diagnostics,
  });
  const store = readStore([v1, v2, otherPlan, otherGuild]);
  const service = createTbAssignmentVersionService({ store });

  const result = await service.listVersions(context, { planId: 'plan-1', rotePhase: 'p6' });

  assert.equal(result.count, 2);
  assert.deepEqual(result.versions.map((row) => row.version.id), ['run-2', 'run-1']);
  assert.equal(result.versions.every((row) => row.verification.valid), true);
  assert.equal(store.calls.at(-1).version_number, 'not.is.null');
  assert.equal(store.calls.at(-1).plan_hash, 'not.is.null');
});

test('read/list version surface requires officer context and validates optional ROTE phase', async () => {
  const service = createTbAssignmentVersionService({ store: readStore([makeRun(1)]) });

  await assert.rejects(
    () => service.listVersions({ guild: { id: 'guild-1' }, userId: '' }, {}),
    (error) => error?.code === 'OFFICER_CONTEXT_REQUIRED',
  );
  await assert.rejects(
    () => service.listVersions(context, { phase: 'P7' }),
    (error) => error?.code === 'INVALID_ROTE_PHASE',
  );
});
