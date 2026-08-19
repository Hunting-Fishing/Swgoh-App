import test from 'node:test';
import assert from 'node:assert/strict';

import { computeTbAssignmentPlanHash } from '../tb-assignment-version-service.mjs';
import { createTbAssignmentVersionCompareService } from '../tb-assignment-version-compare-service.mjs';

function makeRun(id, versionNumber, overrides = {}) {
  const run = {
    id,
    guild_id: 'guild-1',
    plan_id: 'plan-1',
    rote_phase: 'P6',
    version_number: versionNumber,
    input_fingerprint: `fp-${versionNumber}`,
    assignments: [{ id: 'S1', phase: 'P6', member: { playerId: `P${versionNumber}` }, safety: { help: false } }],
    unfilled: [],
    diagnostics: { safetySummary: { helpAssignments: 0 } },
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

function storeFor(rows) {
  return {
    async select(table, query) {
      assert.equal(table, 'guild_tb_assignment_runs');
      const guildId = String(query.guild_id).replace(/^eq\./, '');
      const id = String(query.id).replace(/^eq\./, '');
      return rows.filter((row) => row.guild_id === guildId && row.id === id);
    },
  };
}

const context = { guild: { id: 'guild-1' }, userId: 'officer-1' };

test('compareVersions verifies both immutable versions and returns the deterministic delta', async () => {
  const from = makeRun('run-1', 1);
  const to = makeRun('run-2', 2);
  const service = createTbAssignmentVersionCompareService({ store: storeFor([from, to]) });

  const result = await service.compareVersions(context, { from: from.id, to: to.id });

  assert.equal(result.guildId, 'guild-1');
  assert.equal(result.planId, 'plan-1');
  assert.equal(result.rotePhase, 'P6');
  assert.equal(result.diff.summary.changedDonors, 1);
  assert.equal(result.diff.changedDonors[0].from.donorId, 'P1');
  assert.equal(result.diff.changedDonors[0].to.donorId, 'P2');
});

test('compareVersions rejects cross-plan and cross-phase comparisons', async () => {
  const base = makeRun('run-1', 1);
  const otherPlan = makeRun('run-2', 2, { plan_id: 'plan-2' });
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
  let service = createTbAssignmentVersionCompareService({ store: storeFor([base, otherPlan]) });
  await assert.rejects(
    () => service.compareVersions(context, { from: base.id, to: otherPlan.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_DIFF_PLAN_MISMATCH',
  );

  const otherPhase = makeRun('run-3', 3, { rote_phase: 'P5' });
  otherPhase.plan_hash = computeTbAssignmentPlanHash({
    guildId: otherPhase.guild_id,
    planId: otherPhase.plan_id,
    rotePhase: otherPhase.rote_phase,
    versionNumber: otherPhase.version_number,
    inputFingerprint: otherPhase.input_fingerprint,
    assignments: otherPhase.assignments,
    unfilled: otherPhase.unfilled,
    diagnostics: otherPhase.diagnostics,
  });
  service = createTbAssignmentVersionCompareService({ store: storeFor([base, otherPhase]) });
  await assert.rejects(
    () => service.compareVersions(context, { from: base.id, to: otherPhase.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_DIFF_PHASE_MISMATCH',
  );
});

test('compareVersions fails closed when either persisted version hash is invalid', async () => {
  const from = makeRun('run-1', 1);
  const corrupt = { ...makeRun('run-2', 2), plan_hash: '0'.repeat(64) };
  const service = createTbAssignmentVersionCompareService({ store: storeFor([from, corrupt]) });

  await assert.rejects(
    () => service.compareVersions(context, { from: from.id, to: corrupt.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_HASH_VERIFICATION_FAILED',
  );
});
