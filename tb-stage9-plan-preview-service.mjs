import { createHash } from 'node:crypto';
import { discordHardReservationStore } from './discord-hard-reservation-store.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { createDiscordTbLiveServices } from './discord-tb-live.mjs';
import { discordTbConfig } from './discord-tb.mjs';
import { planGuildTbOperationsParity } from './public/guild-operations-parity-planner.js';
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
const upper = (value) => text(value).toUpperCase();

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
  const discordCandidate = text(context?.discordGuildId);
  const discordGuildId = /^\d{16,22}$/.test(discordCandidate) ? discordCandidate : '';
  const seedAllyCode = text(context?.seedAllyCode).replace(/\D/g, '');
  if (!guildId) throw serviceError('Guild context is required.', 400, 'GUILD_CONTEXT_REQUIRED');
  if (!actorUserId) throw serviceError('Officer user context is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
  if (!/^\d{9}$/.test(seedAllyCode)) throw serviceError('A current SWGOH Guild member Ally Code is required.', 409, 'SWGOH_GUILD_BINDING_REQUIRED');
  return Object.freeze({
    guildId,
    actorUserId,
    discordGuildId,
    discordBound: Boolean(discordGuildId),
    seedAllyCode,
  });
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

function memberIdentity(row = {}) {
  return text(
    row?.memberId
    || row?.playerId
    || row?.swgoh_player_id
    || row?.swgohPlayerId
    || row?.swgohAllyCode
    || row?.allyCode
    || row?.ally_code
    || row?.name,
  );
}

function normalizedPreference(value) {
  const candidate = text(value).toLowerCase();
  return candidate === 'give' || candidate === 'keep' ? candidate : '';
}

function normalizedBaseId(value) {
  const candidate = upper(value);
  return /^[A-Z0-9_:-]{2,80}$/.test(candidate) ? candidate : '';
}

function normalizedPhase(value) {
  const candidate = upper(value);
  return /^P[1-6]$/.test(candidate) ? candidate : '';
}

function normalizedSnowflake(value) {
  const candidate = text(value);
  return /^\d{16,22}$/.test(candidate) ? candidate : '';
}

function playerMemberId(row = {}) {
  return text(row?.swgoh_player_id || row?.ally_code || row?.name);
}

function guildAliasMap(guildSnapshot = {}) {
  const aliases = new Map();
  for (const member of array(guildSnapshot?.members)) {
    const canonical = text(member?.playerId || member?.allyCode || member?.name);
    if (!canonical) continue;
    for (const alias of [member?.playerId, member?.allyCode, member?.name]) {
      if (text(alias)) aliases.set(text(alias), canonical);
    }
  }
  return aliases;
}

function resolveMemberId(value, aliases, dbPlayers) {
  const raw = text(value);
  if (!raw) return '';
  const dbResolved = dbPlayers.get(raw);
  if (dbResolved) return aliases.get(dbResolved) || dbResolved;
  return aliases.get(raw) || raw;
}

function normalizePlanningControls(snapshot = {}, guildSnapshot = {}, nowMs = Date.now()) {
  const aliases = guildAliasMap(guildSnapshot);
  const dbPlayers = new Map(array(snapshot?.players)
    .map((row) => [text(row?.id), playerMemberId(row)])
    .filter(([id, memberId]) => id && memberId));
  const resolve = (value) => resolveMemberId(value, aliases, dbPlayers);

  const preferenceMap = new Map();
  for (const row of Object.values(object(snapshot?.discordGuild?.memberPreferences))) {
    const memberId = resolve(memberIdentity(row));
    const baseId = normalizedBaseId(row?.baseId || row?.base_id);
    const preference = normalizedPreference(row?.preference);
    if (memberId && baseId && preference) preferenceMap.set(`${memberId}|${baseId}`, { memberId, baseId, preference, source: 'discord-state' });
  }
  for (const row of array(snapshot?.donationPreferences)) {
    const memberId = resolve(row?.player_id);
    const baseId = normalizedBaseId(row?.base_id);
    const preference = normalizedPreference(row?.preference);
    if (memberId && baseId && preference) preferenceMap.set(`${memberId}|${baseId}`, { memberId, baseId, preference, source: text(row?.source) || 'command-center' });
  }

  const ignored = new Set();
  for (const row of Object.values(object(snapshot?.discordGuild?.memberAvailability))) {
    if (text(row?.availability).toLowerCase() !== 'unavailable') continue;
    const memberId = resolve(memberIdentity(row));
    if (memberId) ignored.add(memberId);
  }
  for (const row of array(snapshot?.memberControls)) {
    const until = Date.parse(text(row?.ignored_until));
    if (row?.available !== false && !(Number.isFinite(until) && until > nowMs)) continue;
    const memberId = resolve(row?.player_id);
    if (memberId) ignored.add(memberId);
  }

  const reservations = [];
  const userLinks = object(snapshot?.discordGuild?.userLinks);
  for (const row of Object.values(object(snapshot?.hardReservations?.reservations))) {
    if (row?.reserved !== true) continue;
    const discordUserId = normalizedSnowflake(row?.discordUserId || row?.discord_user_id);
    const memberId = resolve(memberIdentity(row));
    const linkedMemberId = discordUserId ? resolve(memberIdentity(userLinks[discordUserId])) : '';
    const phase = normalizedPhase(row?.phase);
    const baseId = normalizedBaseId(row?.baseId || row?.base_id);
    if (!discordUserId || !memberId || linkedMemberId !== memberId || !phase || !baseId) continue;
    reservations.push({ memberId, phase, baseId, source: 'discord-hard-reservation' });
  }

  return Object.freeze({
    preferences: Object.freeze(stableRows([...preferenceMap.values()])),
    ignoredMembers: Object.freeze([...ignored].sort()),
    reservations: Object.freeze(stableRows(reservations)),
    playerIdMap: Object.freeze(Object.fromEntries([...dbPlayers.entries()].sort((a, b) => a[0].localeCompare(b[0])))),
  });
}

function normalizePreassignments(rows = [], controls = {}, guildSnapshot = {}) {
  const aliases = guildAliasMap(guildSnapshot);
  const dbPlayers = new Map(array(controls?.players)
    .map((row) => [text(row?.id), playerMemberId(row)])
    .filter(([id, memberId]) => id && memberId));
  return Object.freeze(array(rows).map((row) => ({
    slotId: text(row?.slot_id || row?.slotId),
    memberId: resolveMemberId(row?.player_id || row?.playerId || row?.memberId, aliases, dbPlayers),
  })).filter((row) => row.slotId && row.memberId));
}

function planCustomizationSummary(plan = {}, rules = [], preassignments = []) {
  const layout = object(plan?.phase_layout);
  const overrides = object(plan?.requirement_overrides);
  return Object.freeze({
    phaseLayout: Object.keys(layout).length > 0,
    requirementOverrides: Object.keys(overrides).length,
    ignoredMissions: array(plan?.ignored_missions).length,
    ignoredPlatoons: array(plan?.ignored_platoons).length,
    ignoredSlots: array(plan?.ignored_slots).length,
    groupingRules: array(rules).length,
    preassignments: array(preassignments).length,
  });
}

export function createTbStage9PlanPreviewService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const stateStore = options.stateStore || discordStateStore;
  const reservationStore = options.reservationStore || discordHardReservationStore;
  const versionService = options.versionService || tbAssignmentVersionService;
  const parityPlanner = options.parityPlanner || planGuildTbOperationsParity;
  const env = options.env || process.env;
  const config = options.discordConfig || discordTbConfig(env);
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const live = options.live || createDiscordTbLiveServices(env, {
    stateStore,
    reservationStore,
    store,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.guildRosterService ? { guildRosterService: options.guildRosterService } : {}),
  });

  async function readControlSnapshot(context) {
    let guildState = {};
    let reservationState = {};

    if (context.discordBound) {
      const stateStatus = typeof stateStore?.status === 'function' ? stateStore.status() : null;
      if (!stateStatus?.enabled || !stateStatus?.durable || typeof stateStore?.readGuild !== 'function') {
        throw serviceError('A verified Discord Guild is bound, but its durable planning state is unavailable.', 503, 'DISCORD_PLANNING_STATE_UNAVAILABLE');
      }
      guildState = await stateStore.readGuild(context.discordGuildId);
      if (!guildState) throw serviceError('Verified Discord Guild state was not found.', 409, 'DISCORD_GUILD_STATE_NOT_FOUND');

      const reservationStatus = typeof reservationStore?.status === 'function' ? reservationStore.status() : null;
      if (reservationStatus?.enabled || reservationStatus?.durable) {
        if (!reservationStatus?.enabled || !reservationStatus?.durable || typeof reservationStore?.readGuild !== 'function') {
          throw serviceError('Durable hard-reservation state is configured but unavailable.', 503, 'HARD_RESERVATION_STATE_UNAVAILABLE');
        }
        reservationState = await reservationStore.readGuild(context.discordGuildId) || {};
      }
    }

    const [players, memberControls, donationPreferences] = await Promise.all([
      store.select('players', {
        select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
        current_guild_id: `eq.${context.guildId}`,
        limit: 100,
      }),
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
      discordBound: context.discordBound === true,
      discordGuild: compactGuildState(guildState),
      hardReservations: compactReservationState(reservationState),
      players: Object.freeze(stableRows(players)),
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
        select: 'id,rule_type,priority,when_spec,then_spec,enabled',
        plan_id: `eq.${plan.id}`,
        guild_id: `eq.${context.guildId}`,
        enabled: 'eq.true',
        order: 'priority.asc',
        limit: 500,
      }),
      store.select('guild_tb_plan_preassignments', {
        select: 'id,slot_id,player_id',
        plan_id: `eq.${plan.id}`,
        limit: 500,
      }),
    ]);
    return Object.freeze({
      plan,
      groupingRules: Object.freeze(stableRows(rules)),
      preassignments: Object.freeze(stableRows(preassignments)),
    });
  }

  async function createPreview(contextInput = {}, input = {}) {
    const context = requireContext(contextInput);
    const phase = normalizeRotePhase(input.rotePhase || input.phase);
    const source = await requirePlan(context, input.planId);
    const sourcePlan = source.plan;
    const controlsBefore = await readControlSnapshot(context);
    const controlsBeforeHash = digest(controlsBefore);

    // The live service is reused only for canonical Guild roster, Operation requirements,
    // mission-safety protections and source freshness. A website-only request supplies no
    // Discord interaction and resolves through the explicit Ally Code fallback. If a verified
    // Discord Guild is bound, its durable controls are included and remain fail-closed.
    const planner = await live.buildPlan({
      allyCode: context.seedAllyCode,
      interaction: context.discordBound
        ? { ...object(input.interaction), guild_id: context.discordGuildId }
        : {},
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

    const effectiveControls = normalizePlanningControls(controlsBefore, planner?.guild, now().getTime());
    const preAssignments = normalizePreassignments(source.preassignments, controlsBefore, planner?.guild);
    const parityPlan = parityPlanner(planner?.guild, planner?.operations, {
      phaseLayout: object(sourcePlan.phase_layout),
      requirementOverrides: object(sourcePlan.requirement_overrides),
      ignoredMissions: array(sourcePlan.ignored_missions),
      ignoredPlatoons: array(sourcePlan.ignored_platoons),
      ignoredSlots: array(sourcePlan.ignored_slots),
      groupingRules: source.groupingRules,
      preAssignments,
      reservations: effectiveControls.reservations,
      preferences: effectiveControls.preferences,
      ignoredMembers: effectiveControls.ignoredMembers,
      protections: array(planner?.safety?.protections),
      maxPerTerritory: Number(planner?.plan?.maxPerTerritory || 10),
    });

    if (parityPlan?.parity?.previewReady === false) {
      throw serviceError(
        `The persisted ROTE plan has ${array(parityPlan?.parity?.unresolvedRequirements).length} unresolved requirement override(s). Resolve or ignore those slots before immutable preview creation.`,
        409,
        'TB_ASSIGNMENT_PARITY_PREVIEW_NOT_READY',
      );
    }

    const assignments = array(parityPlan?.assignments).filter((row) => text(row?.phase).toUpperCase() === phase);
    const unfilled = array(parityPlan?.unfilled).filter((row) => text(row?.phase).toUpperCase() === phase);
    const phaseProtections = array(planner?.safety?.protections).filter((row) => text(row?.phase).toUpperCase() === phase);
    const phaseRow = array(parityPlan?.phases).find((row) => text(row?.phase).toUpperCase() === phase) || {};
    const customization = planCustomizationSummary(sourcePlan, source.groupingRules, preAssignments);

    const plannerInputs = Object.freeze({
      contract: 'stage9-web-discord-parity-v2',
      sourceHydrationContract: 'stage8-discord-mission-safe-v1',
      planningMode: context.discordBound ? 'website-plus-discord-controls' : 'website-only',
      discordBound: context.discordBound,
      phase,
      guildBindingSource: text(planner?.guildBindingSource),
      redundancyTarget: Number(config?.redundancyTarget || 2),
      maxPerTerritory: Number(parityPlan?.maxPerTerritory || planner?.plan?.maxPerTerritory || 10),
      guildSnapshotHash: digest(planner?.guild || {}),
      operationRequirementsHash: digest(planner?.operations || {}),
      missionProtectionsHash: digest(array(planner?.safety?.protections)),
      durableControlsHash: controlsBeforeHash,
      effectivePlanningControlsHash: digest(effectiveControls),
      sourcePlanHash: digest({
        id: sourcePlan.id,
        updatedAt: sourcePlan.updated_at,
        phaseLayout: sourcePlan.phase_layout || {},
        requirementOverrides: sourcePlan.requirement_overrides || {},
        ignoredMissions: array(sourcePlan.ignored_missions),
        ignoredPlatoons: array(sourcePlan.ignored_platoons),
        ignoredSlots: array(sourcePlan.ignored_slots),
      }),
      groupingRulesHash: digest(source.groupingRules),
      preassignmentsHash: digest(preAssignments),
      parityOutputHash: digest({
        assignments,
        unfilled,
        lockIssues: array(parityPlan?.lockIssues),
        parity: object(parityPlan?.parity),
      }),
    });
    const inputFingerprint = digest(plannerInputs);
    const diagnostics = Object.freeze({
      plannerContract: plannerInputs.contract,
      sourceHydrationContract: plannerInputs.sourceHydrationContract,
      planningMode: plannerInputs.planningMode,
      discordBound: plannerInputs.discordBound,
      requestedPhase: phase,
      strategy: text(parityPlan?.strategy || planner?.plan?.strategy),
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
      customization,
      parity: Object.freeze({ ...object(parityPlan?.parity) }),
      planningControls: Object.freeze({
        preferences: effectiveControls.preferences.length,
        unavailableMembers: effectiveControls.ignoredMembers.length,
        hardReservations: effectiveControls.reservations.length,
        preassignments: preAssignments.length,
        discordBound: context.discordBound,
        sourceStage8: Object.freeze({ ...object(planner?.planningControls) }),
      }),
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
      source: 'stage9-immutable-web-discord-parity-preview',
      plan: Object.freeze({
        id: text(sourcePlan.id),
        name: text(sourcePlan.name),
        status: text(sourcePlan.status),
        updatedAt: text(sourcePlan.updated_at),
      }),
      phase,
      planningMode: diagnostics.planningMode,
      discordBound: diagnostics.discordBound,
      inputFingerprint,
      version: created.version,
      verification: created.verification,
      attempt: created.attempt,
      summary: diagnostics.phaseSummary,
      customization,
      parity: diagnostics.parity,
      controlsStable: true,
    });
  }

  return Object.freeze({
    createPreview,
    normalizePlanningControls,
    normalizePreassignments,
    readControlSnapshot,
    requirePlan,
  });
}

export const tbStage9PlanPreviewService = createTbStage9PlanPreviewService();