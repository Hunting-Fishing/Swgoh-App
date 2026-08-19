import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertTbAssignmentRunPublishable,
  createGuildTbPlanVersionService,
  hashTbAssignmentPayload,
} from '../guild-tb-plan-version-service.mjs';

const GUILD = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const PLAN = '33333333-3333-4333-8333-333333333333';

function assignment(slot, donor, { help = false, status = 'SAFE' } = {}) {
  return {
    id: slot,
    phase: 'P6',
    conflictId: 'P6-C1',
    squadId: 'tb3-platoon-1',
    baseId: slot === 'slot-1' ? 'LORDVADER' : 'JEDIMASTERKENOBI',
    name: slot === 'slot-1' ? 'Lord Vader' : 'Jedi Master Kenobi',
    member: { playerId: donor, name: donor },
    safety: { help, status },
  };
}

function fakeStore() {
  const runs = [];
  const approvals = [];
  const audits = [];
  const plans = [{ id: PLAN, guild_id: GUILD, name: 'ROTE', status: 'draft' }];
  let counter = 0;
  let clock = 0;
  const nextId = () => `${String(++counter).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const now = () => `2026-08-19T13:${String(++clock).padStart(2, '0')}:00.000Z`;

  function eq(value, expression) {
    if (expression == null || expression === '') return true;
    const text = String(expression);
    if (text === 'is.null') return value == null;
    if (text.startsWith('eq.')) return String(value ?? '') === text.slice(3);
    if (text.startsWith('gt.')) return Number(value || 0) > Number(text.slice(3));
    return true;
  }

  function tableRows(table) {
    if (table === 'guild_tb_assignment_runs') return runs;
    if (table === 'guild_tb_assignment_run_approvals') return approvals;
    if (table === 'guild_operations_audit_log') return audits;
    if (table === 'guild_tb_plans') return plans;
    return [];
  }

  function matches(row, query = {}) {
    for (const [key, expression] of Object.entries(query)) {
      if (['select', 'order', 'limit'].includes(key)) continue;
      if (!eq(row[key], expression)) return false;
    }
    return true;
  }

  return {
    runs,
    approvals,
    audits,
    status() { return { configured: true }; },
    async select(table, query = {}) {
      let result = tableRows(table).filter((row) => matches(row, query));
      if (query.order === 'created_at.desc') result = result.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      if (query.order === 'version_number.desc') result = result.slice().sort((a, b) => Number(b.version_number || 0) - Number(a.version_number || 0));
      return result.slice(0, Number(query.limit || result.length || 1000)).map((row) => structuredClone(row));
    },
    async insert(table, rows) {
      const target = tableRows(table);
      const saved = rows.map((input) => {
        const row = { id: input.id || nextId(), created_at: input.created_at || now(), ...structuredClone(input) };
        target.push(row);
        return structuredClone(row);
      });
      return saved;
    },
    async update(table, query, patch) {
      const target = tableRows(table);
      const changed = [];
      for (const row of target) {
        if (!matches(row, query)) continue;
        Object.assign(row, structuredClone(patch));
        changed.push(structuredClone(row));
      }
      return changed;
    },
    async rpc(name, args) {
      assert.equal(name, 'create_guild_tb_assignment_version');
      const previous = runs
        .filter((row) => row.guild_id === args.p_guild_id
          && row.rote_phase === args.p_rote_phase
          && String(row.plan_id || '') === String(args.p_plan_id || '')
          && row.version_number != null)
        .sort((a, b) => Number(b.version_number) - Number(a.version_number))[0] || null;
      const created = {
        id: nextId(),
        guild_id: args.p_guild_id,
        plan_id: args.p_plan_id,
        status: 'preview',
        rote_phase: args.p_rote_phase,
        version_number: Number(previous?.version_number || 0) + 1,
        plan_hash: args.p_plan_hash,
        input_fingerprint: args.p_input_fingerprint,
        assignments: structuredClone(args.p_assignments || []),
        unfilled: structuredClone(args.p_unfilled || []),
        diagnostics: structuredClone(args.p_diagnostics || {}),
        delivery: {},
        created_by_user_id: args.p_created_by_user_id,
        supersedes_run_id: previous?.id || null,
        superseded_by_run_id: null,
        cancelled_at: null,
        cancelled_by_user_id: null,
        created_at: now(),
      };
      runs.push(created);
      if (previous && !previous.cancelled_at && !previous.superseded_by_run_id) previous.superseded_by_run_id = created.id;
      return structuredClone(created);
    },
  };
}

function operationsService() {
  return {
    async requireOfficer() {
      return { guild: { id: GUILD, name: 'Ludus Venatus' }, userId: USER, role: 'officer' };
    },
  };
}

function versionInput(assignments) {
  return {
    planId: PLAN,
    phase: 'P6',
    inputFingerprint: 'roster:abc|controls:def',
    assignments,
    unfilled: [{ id: 'slot-3', phase: 'P6', baseId: 'ASAJJVENTRESS' }],
    diagnostics: { helpAssignments: assignments.filter((row) => row.safety?.help).length },
  };
}

test('plan hash is deterministic across object key and assignment array order', () => {
  const a = assignment('slot-1', 'member-a');
  const b = assignment('slot-2', 'member-b', { help: true, status: 'MISSION PROTECTED OVERRIDE' });
  const firstHash = hashTbAssignmentPayload(versionInput([a, b]));
  const secondHash = hashTbAssignmentPayload({
    diagnostics: { helpAssignments: 1 },
    unfilled: [{ baseId: 'ASAJJVENTRESS', phase: 'P6', id: 'slot-3' }],
    assignments: [b, a],
    inputFingerprint: 'roster:abc|controls:def',
    phase: 'p6',
    planId: PLAN,
  });
  assert.equal(firstHash, secondHash);
  assert.match(firstHash, /^[0-9a-f]{64}$/);
});

test('new immutable version supersedes previous version and approval is exact-hash bound', async () => {
  const store = fakeStore();
  const service = createGuildTbPlanVersionService({ store, operationsService: operationsService() });
  const firstVersion = await service.createVersion(USER, '732764286', versionInput([
    assignment('slot-1', 'The Revanchist', { help: true, status: 'MISSION PROTECTED OVERRIDE' }),
    assignment('slot-2', 'Fahey'),
  ]));
  assert.equal(firstVersion.version_number, 1);
  assert.equal(firstVersion.supersedes_run_id, null);

  await assert.rejects(
    service.approveVersion(USER, '732764286', firstVersion.id, '000000000000'),
    (error) => error?.code === 'TB_PLAN_HASH_CONFIRMATION_MISMATCH',
  );

  const approved = await service.approveVersion(USER, '732764286', firstVersion.id, firstVersion.plan_hash.slice(0, 12));
  assert.equal(approved.approval.decision, 'approved');
  assert.equal(approved.approval.plan_hash, firstVersion.plan_hash);
  assert.equal((await service.assertPublishable(USER, '732764286', firstVersion.id)).publishable, true);

  const secondVersion = await service.createVersion(USER, '732764286', versionInput([
    assignment('slot-1', 'Aaron', { help: true, status: 'MISSION PROTECTED OVERRIDE' }),
    assignment('slot-2', 'Fahey'),
  ]));
  assert.equal(secondVersion.version_number, 2);
  assert.equal(secondVersion.supersedes_run_id, firstVersion.id);
  assert.equal(store.runs.find((row) => row.id === firstVersion.id).superseded_by_run_id, secondVersion.id);

  await assert.rejects(
    service.assertPublishable(USER, '732764286', firstVersion.id),
    (error) => error?.code === 'TB_ASSIGNMENT_VERSION_SUPERSEDED',
  );
  await assert.rejects(
    service.approveVersion(USER, '732764286', secondVersion.id, firstVersion.plan_hash.slice(0, 12)),
    (error) => error?.code === 'TB_PLAN_HASH_CONFIRMATION_MISMATCH',
  );
});

test('cancel revokes an existing approval and publishability fails closed', async () => {
  const store = fakeStore();
  const service = createGuildTbPlanVersionService({ store, operationsService: operationsService() });
  const version = await service.createVersion(USER, '732764286', versionInput([
    assignment('slot-1', 'Aaron'),
  ]));
  await service.approveVersion(USER, '732764286', version.id, version.plan_hash.slice(0, 16));
  const cancelled = await service.cancelVersion(USER, '732764286', version.id, 'Officer cancelled test preview.');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(store.approvals.at(-1).decision, 'revoked');
  await assert.rejects(
    assertTbAssignmentRunPublishable({ store, guildId: GUILD, runId: version.id }),
    (error) => error?.code === 'TB_ASSIGNMENT_VERSION_CANCELLED',
  );
});

test('version diff reports changed donor, fill-state changes, and HELP delta', async () => {
  const store = fakeStore();
  const service = createGuildTbPlanVersionService({ store, operationsService: operationsService() });
  const from = await service.createVersion(USER, '732764286', {
    ...versionInput([
      assignment('slot-1', 'The Revanchist', { help: true, status: 'MISSION PROTECTED OVERRIDE' }),
      assignment('slot-2', 'Fahey'),
    ]),
    unfilled: [{ id: 'slot-3', phase: 'P6', baseId: 'ASAJJVENTRESS' }],
  });
  const to = await service.createVersion(USER, '732764286', {
    ...versionInput([
      assignment('slot-1', 'Aaron'),
      assignment('slot-2', 'Fahey'),
      assignment('slot-3', 'NewDonor'),
    ]),
    unfilled: [],
  });
  const delta = await service.compareVersions(USER, '732764286', from.id, to.id);
  assert.equal(delta.changedDonors.length, 1);
  assert.equal(delta.changedDonors[0].from.donorName, 'The Revanchist');
  assert.equal(delta.changedDonors[0].to.donorName, 'Aaron');
  assert.equal(delta.newlyFilled.length, 1);
  assert.equal(delta.unfilled.delta, -1);
  assert.equal(delta.risk.delta, -1);
});

test('Stage 9 migration enforces immutable payload, append-only approvals, and atomic version creation', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260819141000_stage9_immutable_tb_assignment_versions.sql', import.meta.url), 'utf8');
  assert.match(sql, /guard_immutable_tb_assignment_run_payload/);
  assert.match(sql, /new\.assignments is distinct from old\.assignments/);
  assert.match(sql, /new\.plan_hash is distinct from old\.plan_hash/);
  assert.match(sql, /guard_append_only_tb_assignment_approval/);
  assert.match(sql, /before update or delete on public\.guild_tb_assignment_run_approvals/);
  assert.match(sql, /create_guild_tb_assignment_version/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /set superseded_by_run_id = v_created\.id/);
});
