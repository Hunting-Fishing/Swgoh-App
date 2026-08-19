import { createHash } from 'node:crypto';
import { discordStage9OfficerContext } from './discord-stage9-officer-context.mjs';
import { createDiscordTbLiveServices } from './discord-tb-live.mjs';
import { createGuildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { canonicalJson, tbAssignmentVersionService } from './tb-assignment-version-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function optionValue(interaction = {}, name = '') {
  const subcommand = array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return array(subcommand?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

function normalizePhase(value) {
  const phase = text(value).toUpperCase();
  if (!/^P[1-6]$/.test(phase)) {
    const error = new Error('ROTE phase must be P1 through P6.');
    error.code = 'INVALID_ROTE_PHASE';
    throw error;
  }
  return phase;
}

function nonEmptyObject(value) {
  return Object.keys(object(value)).length > 0;
}

function helpAssignment(row = {}) {
  const status = text(row?.safety?.status || 'SAFE').toUpperCase();
  return row?.safety?.help === true || row?.safety?.forced === true || status !== 'SAFE';
}

function compactAssignment(row = {}) {
  return Object.freeze({
    slotId: text(row.id || row.slotId || row.slot_id),
    phase: text(row.phase),
    conflictId: text(row.conflictId || row.conflict_id),
    squadId: text(row.squadId || row.squad_id),
    baseId: text(row.baseId || row.base_id),
    memberId: text(row?.member?.playerId || row?.member?.allyCode || row?.member?.name),
    safetyStatus: text(row?.safety?.status || 'SAFE'),
    help: helpAssignment(row),
    locked: row?.locked === true,
  });
}

function compactUnfilled(row = {}) {
  return Object.freeze({
    slotId: text(row.id || row.slotId || row.slot_id),
    phase: text(row.phase),
    conflictId: text(row.conflictId || row.conflict_id),
    squadId: text(row.squadId || row.squad_id),
    baseId: text(row.baseId || row.base_id),
    eligibleOwners: Number(row.eligibleOwners || 0),
    availableOwners: Number(row.availableOwners || 0),
    safeOwners: Number(row.safeOwners || 0),
    locked: row?.locked === true,
  });
}

function fingerprint(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function phaseRows(rows, phase) {
  return array(rows).filter((row) => text(row?.phase).toUpperCase() === phase);
}

function formatPreview(context, plan, result, { createdBaseline = false } = {}) {
  const version = result?.version || {};
  const verification = result?.verification || {};
  const assigned = array(version.assignments).length;
  const unfilled = array(version.unfilled).length;
  const help = Number(version?.diagnostics?.safetySummary?.helpAssignments || 0);
  const hash = text(version.planHash).toLowerCase();
  const lines = [
    `**SWGOH Command Center · Immutable ROTE Plan Preview · ${safe(version.rotePhase)}**`,
    `Guild: **${safe(context?.guild?.name)}** · Plan: **${safe(plan?.name, 'ROTE Operations Plan')}**`,
    `Immutable version: **v${Number(version.versionNumber || 0)}** · hash ${verification.valid ? '✅ VERIFIED' : '❌ INVALID'}`,
    `Version ID: \`${safe(version.id)}\``,
    `Plan hash: \`${safe(hash)}\``,
    `Hash confirmation: \`${/^[0-9a-f]{64}$/.test(hash) ? hash.slice(0, 12) : 'invalid'}\``,
    `Assigned: **${assigned}** · Unfilled: **${unfilled}** · HELP/risk: **${help}**`,
  ];
  if (createdBaseline) lines.push('Persisted plan: **baseline ROTE approval plan created automatically**.');
  lines.push(
    '',
    `To approve this exact artifact: \`/tb plan-approve phase:${safe(version.rotePhase)} version:${Number(version.versionNumber || 0)} hash:${/^[0-9a-f]{64}$/.test(hash) ? hash.slice(0, 12) : 'invalid'}\``,
    'Any later immutable preview becomes a newer version. Approval never transfers to a changed version/hash.',
    '',
    '_Stage 9 safety mode: no assignments were published and no DMs were sent._',
  );
  return lines.join('\n').slice(0, 1900);
}

export function createDiscordTbStage9PlanPreviewCommand(options = {}) {
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || discordStage9OfficerContext;
  const versionService = options.versionService || tbAssignmentVersionService;
  const operationsService = options.operationsService || createGuildOperationsService({ store });
  const liveServices = options.liveServices || createDiscordTbLiveServices(options.env || process.env, {
    store,
    ...(options.stateStore ? { stateStore: options.stateStore } : {}),
    ...(options.reservationStore ? { reservationStore: options.reservationStore } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const redundancyTarget = Math.max(1, Math.min(10, Number(options.redundancyTarget || 2)));

  async function currentPlan(guildId) {
    return first(await store.select('guild_tb_plans', {
      select: 'id,guild_id,tb_key,name,status,phase_layout,requirement_overrides,ignored_missions,ignored_platoons,ignored_slots,delivery,metadata,updated_at',
      guild_id: `eq.${guildId}`,
      tb_key: 'eq.rote',
      status: 'neq.archived',
      order: 'updated_at.desc',
      limit: 1,
    }));
  }

  async function ensurePlan(context) {
    let plan = await currentPlan(context.guild.id);
    if (plan?.id) return { plan, createdBaseline: false };

    await operationsService.saveTbPlan(context.userId, context.seedAllyCode, {
      tbKey: 'rote',
      name: 'ROTE Discord Approval Baseline',
      status: 'draft',
      phaseLayout: {},
      requirementOverrides: {},
      ignoredMissions: [],
      ignoredPlatoons: [],
      ignoredSlots: [],
      delivery: { mode: 'preview', publishingEnabled: false, dmsEnabled: false },
      metadata: { source: 'discord-stage9-plan-preview', baseline: true },
    });
    plan = await currentPlan(context.guild.id);
    if (!plan?.id) throw new Error('The baseline ROTE approval plan could not be persisted.');
    return { plan, createdBaseline: true };
  }

  async function assertPlannerParity(plan) {
    const [rules, preassignments] = await Promise.all([
      store.select('guild_tb_grouping_rules', { select: 'id', plan_id: `eq.${plan.id}`, enabled: 'eq.true', limit: 1 }),
      store.select('guild_tb_plan_preassignments', { select: 'id', plan_id: `eq.${plan.id}`, limit: 1 }),
    ]);
    const custom = [];
    if (nonEmptyObject(plan.phase_layout)) custom.push('phase layout');
    if (nonEmptyObject(plan.requirement_overrides)) custom.push('requirement overrides');
    if (array(plan.ignored_missions).length) custom.push('ignored missions');
    if (array(plan.ignored_platoons).length) custom.push('ignored platoons');
    if (array(plan.ignored_slots).length) custom.push('ignored slots');
    if (array(rules).length) custom.push('grouping rules');
    if (array(preassignments).length) custom.push('preassignments');
    if (custom.length) {
      const error = new Error(`This persisted ROTE plan contains ${custom.join(', ')}. Discord immutable preview fails closed until those web-plan customizations are materialized by the same planner path.`);
      error.code = 'TB_STAGE9_PREVIEW_CUSTOM_PLAN_UNSUPPORTED';
      throw error;
    }
  }

  async function execute(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = normalizePhase(optionValue(interaction, 'phase'));
    const { plan, createdBaseline } = await ensurePlan(context);
    await assertPlannerParity(plan);

    const snapshot = await liveServices.buildPlan({
      allyCode: context.seedAllyCode,
      redundancyTarget,
      phase,
      interaction,
    });
    const assignments = phaseRows(snapshot?.plan?.assignments, phase);
    const unfilled = phaseRows(snapshot?.plan?.unfilled, phase);
    const protections = phaseRows(snapshot?.safety?.protections, phase);
    const helpAssignments = assignments.filter(helpAssignment).length;
    const diagnostics = Object.freeze({
      safetySummary: Object.freeze({
        protectedUnits: protections.length,
        criticalProtections: protections.filter((row) => Number(row?.severity || 0) >= 80).length,
        helpAssignments,
      }),
      planningControls: Object.freeze({
        preferenceCount: Number(snapshot?.planningControls?.preferenceCount || 0),
        unavailableMemberCount: Number(snapshot?.planningControls?.unavailableMemberCount || 0),
        hardReservationCount: Number(snapshot?.planningControls?.hardReservationCount || 0),
      }),
      guildBindingSource: text(snapshot?.guildBindingSource),
      plannerSummary: Object.freeze({
        assigned: assignments.length,
        unfilled: unfilled.length,
        helpAssignments,
      }),
    });

    const inputFingerprint = fingerprint({
      schemaVersion: 1,
      source: 'discord-stage9-live-planner-v1',
      guildId: context.guild.id,
      guildLastSyncedAt: context.guild.lastSyncedAt,
      planId: plan.id,
      planUpdatedAt: plan.updated_at,
      phase,
      redundancyTarget,
      planningControls: diagnostics.planningControls,
      protections: protections.map((row) => ({
        memberId: text(row?.memberId),
        baseId: text(row?.baseId),
        severity: Number(row?.severity || 0),
      })),
      assignments: assignments.map(compactAssignment),
      unfilled: unfilled.map(compactUnfilled),
    });

    const result = await versionService.createVersion(context, {
      planId: plan.id,
      rotePhase: phase,
      inputFingerprint,
      assignments,
      unfilled,
      diagnostics,
      delivery: { mode: 'preview', publishingEnabled: false, dmsEnabled: false },
    });
    if (result?.verification?.valid !== true) {
      throw new Error('The immutable ROTE preview was persisted but failed deterministic hash verification. Approval is blocked.');
    }
    return formatPreview(context, plan, result, { createdBaseline });
  }

  return Object.freeze({ execute, currentPlan, ensurePlan, assertPlannerParity });
}

export const discordTbStage9PlanPreviewCommand = createDiscordTbStage9PlanPreviewCommand();
