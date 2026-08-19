import { createHash } from 'node:crypto';
import { discordHardReservationStore } from './discord-hard-reservation-store.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { createDiscordTbLiveServices } from './discord-tb-live.mjs';
import { discordTbConfig } from './discord-tb.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import {
  canonicalJson,
  normalizeRotePhase,
  tbAssignmentVersionService,
} from './tb-assignment-version-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;

function serviceError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function stableRows(rows) {
  return array(rows).map((row) => row && typeof row === 'object' ? { ...row } : row)
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}

function helpCount(assignments) {
  return array(assignments).filter((row) => row?.safety?.help === true).length;
}

function requireContext(context = {}) {
  const guildId = text(context?.guild?.id || context?.guildId);
  const actorUserId = text(context?.userId);
  const discordGuildId = text(context?.discordGuildId);
  const seedAllyCode = text(context?.seedAllyCode).replace(/\D/g, '');
  if (!guildId) throw serviceError('Guild context is required.', 400, 'GUILD_CONTEXT_REQUIRED');
  if (!actorUserId) throw serviceError('Officer user context is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
  if (!/^\d{16,22}$/.test(discordGuildId)) throw serviceError('Bound Discord Guild context is required.', 409, 'DISCORD_GUILD_REQUIRED');
  if (!/^\d{9}$/.test(seedAllyCode)) throw serviceError('Bound SWGOH Guild Ally Code is required.', 409, 'SWGOH_GUILD_BINDING_REQUIRED');
  return Object.freeze({ guildId, actorUserId, discordGuildId, seedAllyCode });
}

function compactGuildState(guild = {}) {
  return Object.freeze({
    swgohAllyCode: text(guild.swgohAllyCode).replace(/\D/g, ''),
    userLinks: object(guild.userLinks),
    memberPreferences: object(guild.memberPreferences),
    memberAvailability: object(guild.memberAvailability),
  });
}

function compactReservationState(state = {}) {
  return Object.freeze({ reservations: object(state.reservations) });
}

function nonEmptyObject(value) {
  return Object.keys(object(value)).length > 0;
}

function unsupportedPlanCustomization(plan = {}, rules = [], preassignments = []) {
  const custom = [];
  if (nonEmptyObject(plan.phase_layout)) custom.push('phase layout');
  if (nonEmptyObject(plan.requirement_overrides)) custom.push('requirement overrides');
  if (array(plan.ignored_missions).length) custom.push('ignored missions');
  if (array(plan.ignored_platoons).length) custom.push('ignored platoons');
  if (array(plan.ignored_slots).length) custom.push('ignored slots');
  if (array(rules).length) custom.push('grouping rules');
  if (array(preassignments).length) custom.push('preassignments');
  return Object.freeze(custom);
}

export function createTbStage9PlanPreviewService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const stateStore = options.stateStore || discordStateStore;
  const reservationStore = options.reservationStore || discordHardReservationStore;
  const versionService = options.versionService || tbAssignmentVersionService;
  const env = options.env || process.env;
  const config = options.discordConfig || discordTbConfig(env);
  const live = options.live || createDiscordTbLiveServices(env, {
    stateStore,
    reservationStore,
    store,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.guildRosterService ? { guildRosterService: options.guildRosterService } : {}),
  });

  async function readControlSnapshot(context) {
    const stateStatus = typeof stateStore?.status === 'function' ? stateStore.status() : null;
    if (!stateStatus?.enabled || !stateStatus?.durable || typeof stateStore?.readGuild !== 'function') {
      throw serviceError('Durable Discord planning state is unavailable.', 503, 'DISCORD_PLANNING_STATE_UNAVAILABLE');
    }
    const guildState = await stateStore.readGuild(context.discordGuildId);
    if (!guildState) throw serviceError('Durable Discord Guild state was not found.', 409, 'DISCORD_GUILD_STATE_NOT_FOUND');

    let reservationState = {};
    const reservationStatus = typeof reservationStore?.status === 'function' ? reservationStore.status() : null;
    if (reservationStatus?.enabled || reservationStatus?.durable) {
      if (!reservationStatus?.enabled || !reservationStatus?.durable || typeof reservationStore?.readGuild !== 'function') {
        throw serviceError('Durable hard-reservation state is configured but unavailable.', 503, 'HARD_RESERVATION_STATE_UNAVAILABLE');
      }
      reservationState = await reservationStore.readGuild(context.discordGuildId) || {};
    }

    const [memberControls, donationPreferences] = await Promise.all([
      store.select('guild_member_operation_controls', {
        select: 'guild_id,player_id,available,ignored_until,ignore_reason,source,updated_at',
        guild_id: `eq.${context.guildId}`,
        limit: 100,
      }),
      store.select('guild_unit_donation_preferences', {
        select: 'guild_id,player_id,base_id,preference,source,updated_at',
        guild_id: `eq.${context.guildId}`,
        limit: 500,
      }),
    ]);

    return Object.freeze({
      discordGuild: compactGuildState(guildState),
      hardReservations: compactReservationState(reservationState),
      memberControls: Object.freeze(stableRows(memberControls)),
      donationPreferences: Object.freeze(stableRows(donationPreferences)),
    });
  }

  async function requirePlan(context, planIdInput) {
    const planId = text(planIdInput);
    if (!planId) throw serviceError('A persisted ROTE plan is required.', 400, 'TB_ASSIGNMENT_PLAN_REQUIRED');
    const plan = first(await store.select('guild_tb_plans', {
      select: 'id,guild_id,tb_key,name,status,phase_layout,requirement_overrides,ignored_missions,ignored_platoons,ignored_slots,updated_at',
      id: `eq.${planId}`,
      guild_id: `eq.${context.guildId}`,
      limit: 1,
    }));
    if (!plan || text(plan.tb_key || 'rote').toLowerCase() !== 'rote' || text(plan.status).toLowerCase() === 'archived') {
      throw serviceError('The selected persisted ROTE plan is unavailable or archived.', 409, 'TB_ASSIGNMENT_SOURCE_PLAN_STALE');
    }

    const [rules, preassignments] = await Promise.all([
      store.select('guild_tb_grouping_rules', {
        select: 'id,rule_type,priority',
        plan_id: `eq.${plan.id}`,
        guild_id: `eq.${context.guildId}`,
        enabled: 'eq.true',
        limit: 1,
      }),
      store.select('guild_tb_plan_preassignments', {
        select: 'id,slot_id,player_id',
        plan_id: `eq.${plan.id}`,
        limit: 1,
      }),
    ]);
    const unsupported = unsupportedPlanCustomization(plan, rules, preassignments);
    if (unsupported.length) {
      throw serviceError(
        `The persisted ROTE plan contains ${unsupported.join(', ')}. Discord immutable preview cannot safely ignore saved web-plan configuration, so preview creation is blocked until the same planner path materializes those settings.`,
        409,
        'TB_ASSIGNMENT_PLAN_CUSTOMIZATION_UNSUPPORTED',
      );
    }
    return plan;
  }

  async function createPreview(contextInput = {}, input = {}) {
    const context = requireContext(contextInput);
    const phase = normalizeRotePhase(input.rotePhase || input.phase);
    const sourcePlan = await requirePlan(context, input.planId);
    const controlsBefore = await readControlSnapshot(context);
    const controlsBeforeHash = digest(controlsBefore);

    const planner = await live.buildPlan({
      allyCode: context.seedAllyCode,
      interaction: input.interaction,
      redundancyTarget: Number(config?.redundancyTarget || 2),
    });

    const controlsAfter = await readControlSnapshot(context);
    const controlsAfterHash = digest(controlsAfter);
    if (controlsBeforeHash !== controlsAfterHash) {
      throw serviceError(
        'Guild planning controls changed while the immutable preview was being generated. Run plan-preview again.',
        409,
        'TB_ASSIGNMENT_PLANNING_CONTROLS_CHANGED',
      );
    }

    const assignments = array(planner?.plan?.assignments).filter((row) => text(row?.phase).toUpperCase() === phase);
    const unfilled = array(planner?.plan?.unfilled).filter((row) => text(row?.phase).toUpperCase() === phase);
    const phaseProtections = array(planner?.safety?.protections).filter((row) => text(row?.phase).toUpperCase() === phase);
    const phaseRow = array(planner?.plan?.phases).find((row) => text(row?.phase).toUpperCase() === phase) || {};

    const plannerInputs = Object.freeze({
      contract: 'stage8-discord-mission-safe-v1',
      phase,
      guildBindingSource: text(planner?.guildBindingSource),
      redundancyTarget: Number(config?.redundancyTarget || 2),
      maxPerTerritory: Number(planner?.plan?.maxPerTerritory || 10),
      guildSnapshotHash: digest(planner?.guild || {}),
      operationRequirementsHash: digest(planner?.operations || {}),
      missionProtectionsHash: digest(array(planner?.safety?.protections)),
      durableControlsHash: controlsBeforeHash,
      sourcePlanHash: digest({
        id: plan.id,
        updatedAt: plan.updated_at,
        phaseLayout: plan.phase_layout || {},
        requirementOverrides: plan.requirement_overrides || {},
        ignoredMissions: array(plan.ignored_missions),
        ignoredPlatoons: array(plan.ignored_platoons),
        ignoredSlots: array(plan.ignored_slots),
      }),
    });
    const inputFingerprint = digest(plannerInputs);
    const diagnostics = Object.freeze({
      plannerContract: plannerInputs.contract,
      requestedPhase: phase,
      strategy: text(planner?.plan?.strategy),
      phaseSummary: Object.freeze({
        total: Number(phaseRow?.total || assignments.length + unfilled.length),
        assigned: assignments.length,
        unfilled: unfilled.length,
        helpAssignments: helpCount(assignments),
      }),
      safetySummary: Object.freeze({
        protectedUnits: phaseProtections.length,
        criticalProtections: phaseProtections.filter((row) => Number(row?.severity || 0) >= 80).length,
        helpAssignments: helpCount(assignments),
      }),
      planningControls: Object.freeze({ ...(planner?.planningControls || {}) }),
      source: Object.freeze({
        guildBindingSource: text(planner?.guildBindingSource),
        rosterCache: text(planner?.cache),
        guildAgeMs: Number(planner?.guildAgeMs || 0),
        plannerInputs,
      }),
    });

    const created = await versionService.createVersion(contextInput, {
      planId: sourcePlan.id,
      rotePhase: phase,
      inputFingerprint,
      assignments,
      unfilled,
      diagnostics,
      delivery: { mode: 'preview', published: false, memberDms: false },
    });

    return Object.freeze({
      source: 'stage9-immutable-stage8-mission-safe-preview',
      plan: Object.freeze({
        id: text(sourcePlan.id),
        name: text(sourcePlan.name),
        status: text(sourcePlan.status),
        updatedAt: text(sourcePlan.updated_at),
      }),
      phase,
      inputFingerprint,
      version: created.version,
      verification: created.verification,
      attempt: created.attempt,
      summary: diagnostics.phaseSummary,
      controlsStable: true,
    });
  }

  return Object.freeze({ createPreview, readControlSnapshot, requirePlan });
}

export const tbStage9PlanPreviewService = createTbStage9PlanPreviewService();
