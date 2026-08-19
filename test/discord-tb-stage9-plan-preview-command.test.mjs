import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordTbStage9PlanPreviewCommand } from '../discord-tb-stage9-plan-preview-command.mjs';

const HASH = 'a'.repeat(64);
const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const context = Object.freeze({
  guild: Object.freeze({ id: 'guild-1', name: 'Ludus Venatus', lastSyncedAt: '2026-08-19T14:00:00Z' }),
  userId: '33333333-3333-4333-8333-333333333333',
  role: 'officer',
  seedAllyCode: '732764286',
});

const baselinePlan = Object.freeze({
  id: PLAN_ID,
  guild_id: 'guild-1',
  tb_key: 'rote',
  name: 'ROTE Discord Approval Baseline',
  status: 'draft',
  phase_layout: {},
  requirement_overrides: {},
  ignored_missions: [],
  ignored_platoons: [],
  ignored_slots: [],
  delivery: {},
  metadata: {},
  updated_at: '2026-08-19T13:00:00Z',
});

function interaction(phase = 'P6') {
  return {
    guild_id: '123456789012345678',
    member: { user: { id: '234567890123456789' } },
    data: { name: 'tb', options: [{ type: 1, name: 'plan-preview', options: [{ type: 3, name: 'phase', value: phase }] }] },
  };
}

function liveSnapshot() {
  return {
    guildBindingSource: 'durable-guild-binding',
    planningControls: { preferenceCount: 0, unavailableMemberCount: 0, hardReservationCount: 0 },
    safety: {
      protections: [
        { phase: 'P6', memberId: 'm1', baseId: 'LORDVADER', severity: 82 },
        { phase: 'P5', memberId: 'm2', baseId: 'REY', severity: 30 },
      ],
    },
    plan: {
      summary: { assigned: 224, unfilled: 316 },
      assignments: [
        { id: 'p6-a', phase: 'P6', baseId: 'LORDVADER', name: 'Lord Vader', member: { playerId: 'm1', name: 'Aaron' }, safety: { help: true, status: 'MISSION PROTECTED OVERRIDE' } },
        { id: 'p5-a', phase: 'P5', baseId: 'REY', name: 'Rey', member: { playerId: 'm2', name: 'Other' }, safety: { help: false, status: 'SAFE' } },
      ],
      unfilled: [
        { id: 'p6-u', phase: 'P6', baseId: 'ASAJJVENTRESS', eligibleOwners: 0, availableOwners: 0, safeOwners: 0 },
        { id: 'p5-u', phase: 'P5', baseId: '50RT', eligibleOwners: 0, availableOwners: 0, safeOwners: 0 },
      ],
    },
  };
}

function baselineStore(plan = baselinePlan) {
  return {
    async select(table) {
      if (table === 'guild_tb_plans') return plan ? [plan] : [];
      if (table === 'guild_tb_grouping_rules') return [];
      if (table === 'guild_tb_plan_preassignments') return [];
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test('plan-preview freezes only requested phase into a verified immutable version', async () => {
  let createInput = null;
  let liveInput = null;
  const command = createDiscordTbStage9PlanPreviewCommand({
    store: baselineStore(),
    contextResolver: { resolve: async () => context },
    operationsService: { saveTbPlan: async () => { throw new Error('should not create baseline'); } },
    liveServices: { buildPlan: async (input) => { liveInput = input; return liveSnapshot(); } },
    versionService: {
      async createVersion(receivedContext, input) {
        assert.equal(receivedContext, context);
        createInput = structuredClone(input);
        return {
          version: {
            id: RUN_ID,
            rotePhase: 'P6',
            versionNumber: 1,
            planHash: HASH,
            inputFingerprint: input.inputFingerprint,
            assignments: input.assignments,
            unfilled: input.unfilled,
            diagnostics: input.diagnostics,
          },
          verification: { valid: true, stored: HASH, recomputed: HASH },
        };
      },
    },
  });

  const content = await command.execute(interaction('P6'));
  assert.equal(liveInput.allyCode, '732764286');
  assert.equal(liveInput.phase, 'P6');
  assert.equal(createInput.planId, PLAN_ID);
  assert.equal(createInput.rotePhase, 'P6');
  assert.match(createInput.inputFingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(createInput.assignments.map((row) => row.id), ['p6-a']);
  assert.deepEqual(createInput.unfilled.map((row) => row.id), ['p6-u']);
  assert.equal(createInput.diagnostics.safetySummary.protectedUnits, 1);
  assert.equal(createInput.diagnostics.safetySummary.criticalProtections, 1);
  assert.equal(createInput.diagnostics.safetySummary.helpAssignments, 1);
  assert.deepEqual(createInput.delivery, { mode: 'preview', publishingEnabled: false, dmsEnabled: false });
  assert.match(content, /Immutable ROTE Plan Preview · P6/);
  assert.match(content, new RegExp(RUN_ID));
  assert.match(content, new RegExp(HASH));
  assert.match(content, /plan-approve phase:P6 version:1 hash:aaaaaaaaaaaa/);
  assert.match(content, /no assignments were published and no DMs were sent/i);
});

test('plan-preview auto-creates one audited baseline plan when no active ROTE plan exists', async () => {
  let plan = null;
  let saveInput = null;
  const store = {
    async select(table) {
      if (table === 'guild_tb_plans') return plan ? [plan] : [];
      if (table === 'guild_tb_grouping_rules' || table === 'guild_tb_plan_preassignments') return [];
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const command = createDiscordTbStage9PlanPreviewCommand({
    store,
    contextResolver: { resolve: async () => context },
    operationsService: {
      async saveTbPlan(userId, allyCode, input) {
        assert.equal(userId, context.userId);
        assert.equal(allyCode, context.seedAllyCode);
        saveInput = structuredClone(input);
        plan = baselinePlan;
        return { id: PLAN_ID };
      },
    },
    liveServices: { buildPlan: async () => liveSnapshot() },
    versionService: {
      async createVersion(_context, input) {
        return {
          version: { id: RUN_ID, rotePhase: 'P6', versionNumber: 1, planHash: HASH, inputFingerprint: input.inputFingerprint, assignments: input.assignments, unfilled: input.unfilled, diagnostics: input.diagnostics },
          verification: { valid: true },
        };
      },
    },
  });

  const content = await command.execute(interaction('P6'));
  assert.equal(saveInput.status, 'draft');
  assert.equal(saveInput.metadata.source, 'discord-stage9-plan-preview');
  assert.equal(saveInput.delivery.publishingEnabled, false);
  assert.equal(saveInput.delivery.dmsEnabled, false);
  assert.match(content, /baseline ROTE approval plan created automatically/i);
});

test('plan-preview fails closed instead of ignoring persisted web-plan customization', async () => {
  let plannerCalled = false;
  const customized = { ...baselinePlan, ignored_slots: ['P6-C1-slot-1'] };
  const command = createDiscordTbStage9PlanPreviewCommand({
    store: baselineStore(customized),
    contextResolver: { resolve: async () => context },
    operationsService: { saveTbPlan: async () => { throw new Error('should not save'); } },
    liveServices: { buildPlan: async () => { plannerCalled = true; return liveSnapshot(); } },
    versionService: { createVersion: async () => { throw new Error('should not create'); } },
  });

  await assert.rejects(command.execute(interaction('P6')), /contains ignored slots.*fails closed/i);
  assert.equal(plannerCalled, false);
});

test('plan-preview fails closed if persisted immutable artifact does not verify', async () => {
  const command = createDiscordTbStage9PlanPreviewCommand({
    store: baselineStore(),
    contextResolver: { resolve: async () => context },
    operationsService: { saveTbPlan: async () => null },
    liveServices: { buildPlan: async () => liveSnapshot() },
    versionService: {
      async createVersion(_context, input) {
        return {
          version: { id: RUN_ID, rotePhase: 'P6', versionNumber: 1, planHash: HASH, assignments: input.assignments, unfilled: input.unfilled, diagnostics: input.diagnostics },
          verification: { valid: false },
        };
      },
    },
  });
  await assert.rejects(command.execute(interaction('P6')), /failed deterministic hash verification/i);
});
