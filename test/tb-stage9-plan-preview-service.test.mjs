import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbStage9PlanPreviewService } from '../tb-stage9-plan-preview-service.mjs';

const context = Object.freeze({
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  discordGuildId: '123456789012345678',
  seedAllyCode: '123456789',
});

function planner(overrides = {}) {
  return {
    guild: {
      guild: { id: 'swgoh-guild-1', name: 'Test Guild' },
      members: [
        { playerId: 'P1', allyCode: '111111111', name: 'One', galacticPower: 10000000, rosterAvailable: true, units: [{ baseId: 'A', stars: 7, relic: 9 }] },
        { playerId: 'P2', allyCode: '222222222', name: 'Two', galacticPower: 9000000, rosterAvailable: true, units: [{ baseId: 'B', stars: 7, relic: 8 }] },
      ],
    },
    cache: 'live',
    guildAgeMs: 50,
    guildBindingSource: 'durable-guild-binding',
    planningControls: { preferenceCount: 1, unavailableMemberCount: 0, hardReservationCount: 1 },
    operations: {
      slots: [
        { id: 'P6-S1', phase: 'P6', baseId: 'A', requiredRelic: 9 },
        { id: 'P6-S2', phase: 'P6', baseId: 'B', requiredRelic: 8 },
        { id: 'P1-S1', phase: 'P1', baseId: 'A', requiredRelic: 5 },
      ],
    },
    safety: {
      protections: [
        { memberId: 'P1', phase: 'P6', baseId: 'A', severity: 90 },
        { memberId: 'P1', phase: 'P1', baseId: 'A', severity: 20 },
      ],
    },
    plan: {
      strategy: 'scarcity-first-mission-safe-echo-style-draft',
      maxPerTerritory: 10,
      phases: [
        { phase: 'P1', total: 1, assigned: 1, unfilled: 0 },
        { phase: 'P6', total: 2, assigned: 1, unfilled: 1 },
      ],
      assignments: [
        { id: 'P1-S1', phase: 'P1', baseId: 'A', member: { playerId: 'P1', name: 'One' }, safety: { status: 'SAFE', help: false } },
        { id: 'P6-S1', phase: 'P6', baseId: 'A', member: { playerId: 'P1', name: 'One' }, safety: { status: 'MISSION PROTECTED OVERRIDE', help: true } },
      ],
      unfilled: [
        { id: 'P6-S2', phase: 'P6', baseId: 'B', safeOwners: 0, availableOwners: 0 },
      ],
    },
    ...overrides,
  };
}

function fixture(options = {}) {
  let stateReads = 0;
  const calls = [];
  const stateStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() {
      stateReads += 1;
      return {
        swgohAllyCode: '123456789',
        userLinks: { '234567890123456789': { swgohAllyCode: '111111111' } },
        memberPreferences: stateReads > 1 && options.controlsChange
          ? { changed: { memberId: 'P1', baseId: 'A', preference: 'keep' } }
          : { stable: { memberId: 'P1', baseId: 'A', preference: 'give' } },
        memberAvailability: {},
      };
    },
  };
  const reservationStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() { return { reservations: { one: { memberId: 'P2', phase: 'P6', baseId: 'B', reserved: true } } }; },
  };
  const store = {
    async select(table, query) {
      calls.push({ table, query });
      if (table === 'guild_tb_plans') return options.noPlan ? [] : [{ id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'Live ROTE Plan', status: 'previewed', updated_at: '2026-08-19T14:00:00Z' }];
      if (table === 'guild_member_operation_controls') return [{ guild_id: 'guild-1', player_id: 'P2', available: true, ignored_until: null, source: 'command-center', updated_at: '2026-08-19T13:00:00Z' }];
      if (table === 'guild_unit_donation_preferences') return [{ guild_id: 'guild-1', player_id: 'P1', base_id: 'A', preference: 'give', source: 'command-center', updated_at: '2026-08-19T13:00:00Z' }];
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const livePlanner = options.planner || planner();
  const live = {
    async buildPlan(input) {
      calls.push({ service: 'buildPlan', input });
      return livePlanner;
    },
  };
  const versionService = {
    async createVersion(receivedContext, input) {
      calls.push({ service: 'createVersion', receivedContext, input });
      return {
        version: {
          id: 'run-1', guildId: 'guild-1', planId: input.planId, rotePhase: input.rotePhase, versionNumber: 1,
          planHash: 'a'.repeat(64), inputFingerprint: input.inputFingerprint, assignments: input.assignments,
          unfilled: input.unfilled, diagnostics: input.diagnostics, delivery: input.delivery,
        },
        verification: { valid: true, stored: 'a'.repeat(64), recomputed: 'a'.repeat(64) },
        attempt: 1,
      };
    },
  };
  const service = createTbStage9PlanPreviewService({
    store,
    stateStore,
    reservationStore,
    live,
    versionService,
    discordConfig: { redundancyTarget: 2 },
  });
  return { service, calls };
}

test('creates an immutable phase version from the exact Stage 8 planner while keeping delivery disabled', async () => {
  const { service, calls } = fixture();
  const result = await service.createPreview(context, { planId: 'plan-1', phase: 'P6', interaction: { guild_id: context.discordGuildId } });

  const plannerCall = calls.find((row) => row.service === 'buildPlan');
  assert.equal(plannerCall.input.phase, undefined);
  assert.equal(plannerCall.input.allyCode, '123456789');
  assert.equal(plannerCall.input.redundancyTarget, 2);

  const create = calls.find((row) => row.service === 'createVersion');
  assert.equal(create.receivedContext.userId, context.userId);
  assert.equal(create.input.planId, 'plan-1');
  assert.equal(create.input.rotePhase, 'P6');
  assert.deepEqual(create.input.assignments.map((row) => row.id), ['P6-S1']);
  assert.deepEqual(create.input.unfilled.map((row) => row.id), ['P6-S2']);
  assert.equal(create.input.delivery.published, false);
  assert.equal(create.input.delivery.memberDms, false);
  assert.match(create.input.inputFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(create.input.diagnostics.phaseSummary.assigned, 1);
  assert.equal(create.input.diagnostics.phaseSummary.unfilled, 1);
  assert.equal(create.input.diagnostics.phaseSummary.helpAssignments, 1);
  assert.equal(create.input.diagnostics.safetySummary.protectedUnits, 1);
  assert.equal(create.input.diagnostics.safetySummary.criticalProtections, 1);
  assert.equal(result.controlsStable, true);
  assert.equal(result.version.versionNumber, 1);
});

test('refuses to persist when durable planning controls change while Stage 8 planner is running', async () => {
  const { service, calls } = fixture({ controlsChange: true });
  await assert.rejects(
    () => service.createPreview(context, { planId: 'plan-1', phase: 'P6', interaction: { guild_id: context.discordGuildId } }),
    (error) => error?.code === 'TB_ASSIGNMENT_PLANNING_CONTROLS_CHANGED',
  );
  assert.equal(calls.some((row) => row.service === 'createVersion'), false);
});

test('input fingerprint changes when actual Operation requirements change even if slot count stays constant', async () => {
  const firstFixture = fixture();
  const firstResult = await firstFixture.service.createPreview(context, { planId: 'plan-1', phase: 'P6', interaction: { guild_id: context.discordGuildId } });

  const changed = planner();
  changed.operations = {
    slots: changed.operations.slots.map((row) => row.id === 'P6-S2' ? { ...row, requiredRelic: 9 } : row),
  };
  const secondFixture = fixture({ planner: changed });
  const secondResult = await secondFixture.service.createPreview(context, { planId: 'plan-1', phase: 'P6', interaction: { guild_id: context.discordGuildId } });

  assert.notEqual(firstResult.inputFingerprint, secondResult.inputFingerprint);
});

test('refuses immutable preview creation for missing/archived source plan', async () => {
  const { service, calls } = fixture({ noPlan: true });
  await assert.rejects(
    () => service.createPreview(context, { planId: 'plan-1', phase: 'P6', interaction: { guild_id: context.discordGuildId } }),
    (error) => error?.code === 'TB_ASSIGNMENT_SOURCE_PLAN_STALE',
  );
  assert.equal(calls.some((row) => row.service === 'buildPlan'), false);
});
