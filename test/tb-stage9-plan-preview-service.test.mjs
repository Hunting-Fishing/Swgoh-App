import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbStage9PlanPreviewService } from '../tb-stage9-plan-preview-service.mjs';

const context = Object.freeze({
  guild: { id: 'guild-1', name: 'Test Guild' },
  userId: '11111111-1111-4111-8111-111111111111',
  discordGuildId: '123456789012345678',
  seedAllyCode: '123456789',
});

const guild = Object.freeze({
  guild: { id: 'swgoh-guild-1', name: 'Test Guild' },
  members: [
    { playerId: 'P1', allyCode: '111111111', name: 'One', rosterAvailable: true, units: [{ baseId: 'A', stars: 7, relic: 9 }] },
    { playerId: 'P2', allyCode: '222222222', name: 'Two', rosterAvailable: true, units: [{ baseId: 'B', stars: 7, relic: 8 }] },
  ],
});

function livePlanner(overrides = {}) {
  return {
    guild,
    cache: 'live',
    guildAgeMs: 50,
    guildBindingSource: 'durable-guild-binding',
    planningControls: { preferenceCount: 1, unavailableMemberCount: 0, hardReservationCount: 1 },
    operations: {
      slots: [
        { id: 'P6-S1', phase: 'P6', conflictId: 'P6-C1', squadId: 'P6-PLATOON-1', baseId: 'A', requiredRelic: 9 },
        { id: 'P6-S2', phase: 'P6', conflictId: 'P6-C1', squadId: 'P6-PLATOON-1', baseId: 'B', requiredRelic: 8 },
        { id: 'P1-S1', phase: 'P1', conflictId: 'P1-C1', squadId: 'P1-PLATOON-1', baseId: 'A', requiredRelic: 5 },
      ],
    },
    safety: {
      protections: [
        { memberId: 'P1', phase: 'P6', baseId: 'A', severity: 90 },
        { memberId: 'P1', phase: 'P1', baseId: 'A', severity: 20 },
      ],
    },
    plan: { strategy: 'scarcity-first-mission-safe-echo-style-draft', maxPerTerritory: 10 },
    ...overrides,
  };
}

function persistedPlan(overrides = {}) {
  return {
    id: 'plan-1', guild_id: 'guild-1', tb_key: 'rote', name: 'Live ROTE Plan', status: 'previewed',
    phase_layout: {}, requirement_overrides: {}, ignored_missions: [], ignored_platoons: [], ignored_slots: [],
    updated_at: '2026-08-19T14:00:00Z',
    ...overrides,
  };
}

function parityOutput(overrides = {}) {
  return {
    strategy: 'echobase-parity-command-center',
    maxPerTerritory: 10,
    phases: [
      { phase: 'P1', total: 1, assigned: 1, unfilled: 0 },
      { phase: 'P6', total: 2, assigned: 1, unfilled: 1 },
    ],
    assignments: [
      { id: 'P1-S1', phase: 'P1', baseId: 'A', member: { playerId: 'P1', name: 'One' }, safety: { status: 'SAFE', help: false } },
      { id: 'P6-S1', phase: 'P6', baseId: 'A', member: { playerId: 'P1', name: 'One' }, safety: { status: 'MISSION PROTECTED OVERRIDE', help: true } },
    ],
    unfilled: [{ id: 'P6-S2', phase: 'P6', baseId: 'B', safeOwners: 0, availableOwners: 0 }],
    lockIssues: [],
    parity: {
      mode: 'echobase-parity-command-center', iterations: 1, unresolvedRequirements: [], groupingRulesApplied: [],
      previewReady: true, publishReady: false,
      completion: { sourceSlots: 3, activeSlots: 3, assigned: 2, unfilled: 1, lockIssues: 0 },
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
        userLinks: {
          '234567890123456789': { playerId: 'P1', swgohAllyCode: '111111111' },
          '345678901234567890': { playerId: 'P2', swgohAllyCode: '222222222' },
        },
        memberPreferences: stateReads > 1 && options.controlsChange
          ? { changed: { memberId: 'P1', baseId: 'A', preference: 'keep' } }
          : { stable: { memberId: 'P1', baseId: 'A', preference: 'give' } },
        memberAvailability: options.discordUnavailable ? { p2: { memberId: 'P2', availability: 'unavailable' } } : {},
      };
    },
  };
  const reservationStore = {
    status() { return { enabled: true, durable: true }; },
    async readGuild() {
      return { reservations: {
        one: { discordUserId: '345678901234567890', memberId: 'P2', phase: 'P6', baseId: 'B', reserved: true },
      } };
    },
  };
  const players = [
    { id: 'db-p1', ally_code: '111111111', swgoh_player_id: 'P1', name: 'One', current_guild_id: 'guild-1' },
    { id: 'db-p2', ally_code: '222222222', swgoh_player_id: 'P2', name: 'Two', current_guild_id: 'guild-1' },
  ];
  const store = {
    async select(table, query) {
      calls.push({ table, query });
      if (table === 'guild_tb_plans') return options.noPlan ? [] : [persistedPlan(options.planOverrides)];
      if (table === 'guild_tb_grouping_rules') return options.groupingRules || [];
      if (table === 'guild_tb_plan_preassignments') return options.preassignments || [];
      if (table === 'players') return players;
      if (table === 'guild_member_operation_controls') return options.memberControls || [
        { guild_id: 'guild-1', player_id: 'db-p2', available: true, ignored_until: null, source: 'command-center' },
      ];
      if (table === 'guild_unit_donation_preferences') return options.donationPreferences || [
        { guild_id: 'guild-1', player_id: 'db-p1', base_id: 'A', preference: 'give', source: 'command-center' },
      ];
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const live = {
    async buildPlan(input) {
      calls.push({ service: 'buildPlan', input });
      return options.livePlanner || livePlanner();
    },
  };
  const parityPlanner = (guildInput, operations, parityOptions) => {
    calls.push({ service: 'parityPlanner', guild: guildInput, operations, options: parityOptions });
    return options.parityOutput || parityOutput();
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
    store, stateStore, reservationStore, live, parityPlanner, versionService,
    now: () => new Date('2026-08-22T13:00:00Z'),
    discordConfig: { redundancyTarget: 2 },
  });
  return { service, calls };
}

function preview(service) {
  return service.createPreview(context, { planId: 'plan-1', phase: 'P6', interaction: { guild_id: context.discordGuildId } });
}

test('creates immutable P6 preview from shared web parity planner and keeps delivery disabled', async () => {
  const { service, calls } = fixture();
  const result = await preview(service);
  const hydration = calls.find((row) => row.service === 'buildPlan');
  const parity = calls.find((row) => row.service === 'parityPlanner');
  const create = calls.find((row) => row.service === 'createVersion');

  assert.equal(hydration.input.allyCode, '123456789');
  assert.equal(hydration.input.redundancyTarget, 2);
  assert.deepEqual(parity.guild, guild);
  assert.deepEqual(parity.options.preferences.map((row) => [row.memberId,row.baseId,row.preference]), [['P1','A','give']]);
  assert.deepEqual(parity.options.reservations.map((row) => [row.memberId,row.phase,row.baseId]), [['P2','P6','B']]);
  assert.deepEqual(parity.options.ignoredMembers, []);
  assert.equal(parity.options.maxPerTerritory, 10);

  assert.equal(create.input.rotePhase, 'P6');
  assert.deepEqual(create.input.assignments.map((row) => row.id), ['P6-S1']);
  assert.deepEqual(create.input.unfilled.map((row) => row.id), ['P6-S2']);
  assert.equal(create.input.delivery.published, false);
  assert.equal(create.input.delivery.memberDms, false);
  assert.equal(create.input.diagnostics.plannerContract, 'stage9-web-discord-parity-v2');
  assert.equal(create.input.diagnostics.sourceHydrationContract, 'stage8-discord-mission-safe-v1');
  assert.match(create.input.inputFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.version.versionNumber, 1);
  assert.equal(result.controlsStable, true);
});

test('persisted phase layout, overrides, ignores, grouping rules and preassignments flow into parity planner', async () => {
  const groupingRules = [{ id:'rule-1', rule_type:'avoid_pair', priority:10, enabled:true, when_spec:{phase:'P6'}, then_spec:{baseIds:['B']} }];
  const preassignments = [{ id:'pre-1', slot_id:'P6-S1', player_id:'db-p1' }];
  const planOverrides = {
    phase_layout: { includedPhases:['P6'], excludedConflictIds:['P6-EXCLUDED'] },
    requirement_overrides: { 'P6-S2': { baseId:'B', requiredRelic:9 } },
    ignored_missions: ['P6-IGNORED-MISSION'],
    ignored_platoons: ['P6-IGNORED-PLATOON'],
    ignored_slots: ['P6-IGNORED-SLOT'],
  };
  const { service, calls } = fixture({ groupingRules, preassignments, planOverrides });
  const result = await preview(service);
  const parity = calls.find((row) => row.service === 'parityPlanner');

  assert.deepEqual(parity.options.phaseLayout, planOverrides.phase_layout);
  assert.deepEqual(parity.options.requirementOverrides, planOverrides.requirement_overrides);
  assert.deepEqual(parity.options.ignoredMissions, planOverrides.ignored_missions);
  assert.deepEqual(parity.options.ignoredPlatoons, planOverrides.ignored_platoons);
  assert.deepEqual(parity.options.ignoredSlots, planOverrides.ignored_slots);
  assert.deepEqual(parity.options.groupingRules, groupingRules);
  assert.deepEqual(parity.options.preAssignments, [{ slotId:'P6-S1', memberId:'P1' }]);
  assert.deepEqual(result.customization, {
    phaseLayout:true, requirementOverrides:1, ignoredMissions:1, ignoredPlatoons:1, ignoredSlots:1, groupingRules:1, preassignments:1,
  });
  assert.equal(calls.some((row) => row.service === 'createVersion'), true);
});

test('canonical database controls override duplicate Discord preferences and normalize unavailable members', async () => {
  const { service, calls } = fixture({
    discordUnavailable: true,
    donationPreferences: [{ guild_id:'guild-1', player_id:'db-p1', base_id:'A', preference:'keep', source:'command-center' }],
    memberControls: [{ guild_id:'guild-1', player_id:'db-p2', available:false, ignored_until:null, source:'command-center' }],
  });
  await preview(service);
  const parity = calls.find((row) => row.service === 'parityPlanner');
  assert.deepEqual(parity.options.preferences.map((row) => [row.memberId,row.baseId,row.preference]), [['P1','A','keep']]);
  assert.deepEqual(parity.options.ignoredMembers, ['P2']);
});

test('fails closed when durable planning controls mutate during live source hydration', async () => {
  const { service, calls } = fixture({ controlsChange: true });
  await assert.rejects(() => preview(service), (error) => error?.code === 'TB_ASSIGNMENT_PLANNING_CONTROLS_CHANGED');
  assert.equal(calls.some((row) => row.service === 'parityPlanner'), false);
  assert.equal(calls.some((row) => row.service === 'createVersion'), false);
});

test('fails closed when parity planner reports unresolved officer requirement overrides', async () => {
  const unresolved = parityOutput({
    assignments: [], unfilled: [],
    parity: { mode:'echobase-parity-command-center', unresolvedRequirements:[{slotId:'P6-S1'}], previewReady:false, publishReady:false },
  });
  const { service, calls } = fixture({
    planOverrides: { requirement_overrides: { 'P6-S1': { clear:true } } },
    parityOutput: unresolved,
  });
  await assert.rejects(
    () => preview(service),
    (error) => error?.code === 'TB_ASSIGNMENT_PARITY_PREVIEW_NOT_READY' && /1 unresolved requirement/i.test(error.message),
  );
  assert.equal(calls.some((row) => row.service === 'createVersion'), false);
});

test('input fingerprint changes when live Operation requirements change', async () => {
  const first = await preview(fixture().service);
  const changedLive = livePlanner();
  changedLive.operations = { slots: changedLive.operations.slots.map((row) => row.id === 'P6-S2' ? { ...row, requiredRelic: 9 } : row) };
  const second = await preview(fixture({ livePlanner: changedLive }).service);
  assert.notEqual(first.inputFingerprint, second.inputFingerprint);
});

test('input fingerprint changes when persisted plan controls, grouping rules or preassignments change', async () => {
  const baseline = await preview(fixture().service);
  const ignored = await preview(fixture({ planOverrides:{ ignored_slots:['P6-S2'] } }).service);
  const ruled = await preview(fixture({ groupingRules:[{ id:'r1', rule_type:'avoid_pair', priority:10, enabled:true, when_spec:{phase:'P6'}, then_spec:{baseIds:['B']} }] }).service);
  const locked = await preview(fixture({ preassignments:[{ id:'pre1', slot_id:'P6-S1', player_id:'db-p1' }] }).service);
  assert.notEqual(baseline.inputFingerprint, ignored.inputFingerprint);
  assert.notEqual(baseline.inputFingerprint, ruled.inputFingerprint);
  assert.notEqual(baseline.inputFingerprint, locked.inputFingerprint);
});

test('missing or archived source plans are rejected before hydration and immutable version creation', async () => {
  const { service, calls } = fixture({ noPlan:true });
  await assert.rejects(() => preview(service), (error) => error?.code === 'TB_ASSIGNMENT_SOURCE_PLAN_STALE');
  assert.equal(calls.some((row) => row.service === 'buildPlan'), false);
  assert.equal(calls.some((row) => row.service === 'createVersion'), false);
});
