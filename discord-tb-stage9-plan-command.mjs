import { createHash } from 'node:crypto';
import { discordStage9OfficerContext } from './discord-stage9-officer-context.mjs';
import { createDiscordTbLiveServices } from './discord-tb-live.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { tbAssignmentVersionService } from './tb-assignment-version-service.mjs';
import { tbAssignmentPublishabilityService } from './tb-assignment-publishability-service.mjs';
import { tbAssignmentVersionCompareService } from './tb-assignment-version-compare-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const first = (value) => array(value)[0] || null;
const STAGE9_SUBCOMMANDS = new Set(['plan-preview', 'plan-status', 'plan-approve', 'plan-cancel', 'plan-diff']);

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function shortHash(value, length = 12) {
  const hash = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? `${hash.slice(0, length)}…` : 'invalid';
}

function fullHash(value) {
  const hash = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : '';
}

function helpCount(version = {}) {
  const explicit = version?.diagnostics?.safetySummary?.helpAssignments
    ?? version?.diagnostics?.helpAssignments
    ?? version?.diagnostics?.helpCount;
  if (Number.isFinite(Number(explicit))) return Math.max(0, Math.floor(Number(explicit)));
  return array(version.assignments).filter((row) => {
    const status = text(row?.safety?.status || 'SAFE').toUpperCase();
    return row?.safety?.help === true || row?.safety?.forced === true || status !== 'SAFE';
  }).length;
}

function lifecycle(version = {}) {
  if (version.cancelledAt || version.status === 'cancelled') return 'CANCELLED';
  if (version.supersededByRunId) return 'SUPERSEDED';
  if (version.approvedAt && text(version.approvedPlanHash).toLowerCase() === text(version.planHash).toLowerCase()) return 'APPROVED';
  return 'AWAITING APPROVAL';
}

function formatVersionLine(entry = {}) {
  const version = entry.version || {};
  const verification = entry.verification || {};
  return `• **v${Number(version.versionNumber || 0)}** · ${safe(version.rotePhase)} · \`${shortHash(version.planHash)}\` · **${lifecycle(version)}** · hash ${verification.valid ? '✅' : '❌'} · ${array(version.assignments).length} assigned / ${array(version.unfilled).length} unfilled / ${helpCount(version)} HELP`;
}

function optionValue(interaction = {}, name = '') {
  const subcommand = array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return array(subcommand?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

function requestedSubcommand(interaction = {}) {
  return text(array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2)?.name).toLowerCase();
}

function normalizePhase(value, required = false) {
  const phase = text(value).toUpperCase();
  if (!phase && !required) return '';
  if (!/^P[1-6]$/.test(phase)) {
    const error = new Error('ROTE phase must be P1 through P6.');
    error.code = 'INVALID_ROTE_PHASE';
    throw error;
  }
  return phase;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    result[key] = canonicalize(value[key]);
  }
  return result;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function assignmentFingerprintRow(row = {}) {
  return Object.freeze({
    id: text(row.id || row.slotId || row.slot_id),
    phase: text(row.phase),
    conflictId: text(row.conflictId || row.conflict_id),
    squadId: text(row.squadId || row.squad_id),
    baseId: text(row.baseId || row.base_id),
    memberId: text(row?.member?.playerId || row?.member?.allyCode || row?.member?.name),
    safetyStatus: text(row?.safety?.status),
    help: row?.safety?.help === true,
    locked: row?.locked === true,
  });
}

function unfilledFingerprintRow(row = {}) {
  return Object.freeze({
    id: text(row.id || row.slotId || row.slot_id),
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

function phaseRows(rows, phase) {
  return array(rows).filter((row) => text(row?.phase).toUpperCase() === phase);
}

function formatPreview(plan, result = {}) {
  const version = result.version || {};
  const verification = result.verification || {};
  const hash = fullHash(version.planHash);
  const lines = [
    `**SWGOH Command Center · Immutable ROTE Preview · ${safe(version.rotePhase)}**`,
    `Plan: **${safe(plan?.name, 'ROTE Operations Plan')}**`,
    `Version: **v${Number(version.versionNumber || 0)}** · **${lifecycle(version)}** · hash ${verification.valid ? '✅ VERIFIED' : '❌ INVALID'}`,
    `Version ID: \`${safe(version.id)}\``,
    `Plan hash: \`${hash || safe(version.planHash)}\``,
    `Assigned: **${array(version.assignments).length}** · Unfilled: **${array(version.unfilled).length}** · HELP/risk: **${helpCount(version)}**`,
    `Input fingerprint: \`${safe(version.inputFingerprint).slice(0, 16)}…\``,
    '',
    'Approval must reference this exact immutable version ID and full 64-character hash.',
    'Any new preview becomes a new version and cannot inherit this approval.',
    '',
    '_Stage 9 safety mode: no assignments were published and no DMs were sent._',
  ];
  return lines.join('\n').slice(0, 1900);
}

function formatStatus(context, plan, versions, phase) {
  const latest = versions[0] || null;
  const lines = [
    '**SWGOH Command Center · Immutable ROTE Plan Status**',
    `Guild: **${safe(context.guild.name)}** · Command Center role: **${safe(context.role)}**`,
    `Plan: **${safe(plan.name, 'ROTE Operations Plan')}** · ${safe(plan.status)} · Scope: **${phase || 'all phases'}**`,
    `Immutable versions shown: **${versions.length}**`,
  ];

  if (!latest) {
    lines.push('', 'No Stage 9 immutable assignment versions exist for this scope yet.');
  } else {
    lines.push('', '**Latest immutable version**', formatVersionLine(latest));
    lines.push(`ID: \`${safe(latest.version?.id)}\``);
    lines.push(`Full hash: \`${safe(latest.version?.planHash)}\``);
    if (versions.length > 1) {
      lines.push('', '**Recent version history**');
      for (const entry of versions.slice(1, 6)) lines.push(formatVersionLine(entry));
      if (versions.length > 6) lines.push(`• +${versions.length - 6} more in Command Center`);
    }
  }

  lines.push('', '_Read-only officer view. This command cannot publish assignments or send DMs._');
  return lines.join('\n').slice(0, 1900);
}

function formatApproval(plan, result = {}, publishability = null) {
  const version = result.version || {};
  const lines = [
    '**SWGOH Command Center · Immutable ROTE Approval**',
    `Plan: **${safe(plan?.name, 'ROTE Operations Plan')}** · ${safe(version.rotePhase)} v${Number(version.versionNumber || 0)}`,
    `Version ID: \`${safe(version.id)}\``,
    `Approved hash: \`${safe(version.planHash)}\``,
    `State: **${lifecycle(version)}**`,
    `Hash verification: **${result?.verification?.valid ? 'PASS' : 'FAIL'}**`,
    `Stage 10 publishability gate: **${publishability?.publishable === true ? 'PASS' : 'FAIL CLOSED'}**`,
    '',
    'This approval authorizes only this exact immutable version/hash. A newer version, cancellation, or hash mismatch invalidates it.',
    '',
    '_Approval only. No assignments were published and no DMs were sent._',
  ];
  return lines.join('\n').slice(0, 1900);
}

function formatCancellation(result = {}) {
  const version = result.version || {};
  const lines = [
    '**SWGOH Command Center · Immutable ROTE Version Cancelled**',
    `Phase/version: **${safe(version.rotePhase)} v${Number(version.versionNumber || 0)}**`,
    `Version ID: \`${safe(version.id)}\``,
    `State: **${lifecycle(version)}**`,
    version.cancellationReason ? `Reason: ${safe(version.cancellationReason)}` : '',
    `Hash still verifies immutable payload: **${result?.hashVerification?.valid ? 'YES' : 'NO'}**`,
    '',
    'Cancelled versions fail closed at the Stage 10 publishability gate.',
    '',
    '_No assignments were published and no DMs were sent._',
  ].filter(Boolean);
  return lines.join('\n').slice(0, 1900);
}

function formatDiff(result = {}) {
  const diff = result.diff || {};
  const summary = diff.summary || {};
  const from = diff.from || {};
  const to = diff.to || {};
  const helpDelta = Number(summary.helpDelta || 0);
  const lines = [
    `**SWGOH Command Center · Immutable ROTE Diff · ${safe(result.rotePhase)}**`,
    `Versions: **v${Number(from.versionNumber || 0)} → v${Number(to.versionNumber || 0)}**`,
    `Assigned: **${Number(from.assigned || 0)} → ${Number(to.assigned || 0)}** · Unfilled: **${Number(from.unfilled || 0)} → ${Number(to.unfilled || 0)}**`,
    `HELP/risk: **${Number(from.helpCount || 0)} → ${Number(to.helpCount || 0)}** (${helpDelta >= 0 ? '+' : ''}${helpDelta})`,
    `Changed donors: **${Number(summary.changedDonors || 0)}** · Added: **${Number(summary.addedAssignments || 0)}** · Removed: **${Number(summary.removedAssignments || 0)}**`,
    `Newly filled: **${Number(summary.newlyFilledSlots || 0)}** · Newly unfilled: **${Number(summary.newlyUnfilledSlots || 0)}**`,
  ];

  if (array(diff.changedDonors).length) {
    lines.push('', '**Changed donor preview**');
    for (const row of array(diff.changedDonors).slice(0, 6)) {
      lines.push(`• ${safe(row?.to?.name || row?.to?.baseId)} · **${safe(row?.from?.donorName || row?.from?.donorId)} → ${safe(row?.to?.donorName || row?.to?.donorId)}**`);
    }
    if (array(diff.changedDonors).length > 6) lines.push(`• +${array(diff.changedDonors).length - 6} more donor changes`);
  }

  lines.push('', '_Read-only immutable comparison. No assignments were published and no DMs were sent._');
  return lines.join('\n').slice(0, 1900);
}

export function isDiscordTbStage9PlanSubcommand(value) {
  return STAGE9_SUBCOMMANDS.has(text(value).toLowerCase());
}

export function createDiscordTbStage9PlanCommand(options = {}) {
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || discordStage9OfficerContext;
  const versionService = options.versionService || tbAssignmentVersionService;
  const publishabilityService = options.publishabilityService || tbAssignmentPublishabilityService;
  const compareService = options.compareService || tbAssignmentVersionCompareService;
  const liveServices = options.liveServices || createDiscordTbLiveServices(options.env || process.env, {
    store,
    ...(options.stateStore ? { stateStore: options.stateStore } : {}),
    ...(options.reservationStore ? { reservationStore: options.reservationStore } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const redundancyTarget = Math.max(1, Number(options.redundancyTarget || 2));

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

  async function requireCurrentPlan(context) {
    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) {
      const error = new Error('No active persisted ROTE plan exists yet. Create/save the ROTE Operations plan in Command Center before creating an immutable approval version.');
      error.code = 'TB_ASSIGNMENT_PLAN_REQUIRED';
      throw error;
    }
    return plan;
  }

  async function planPreview(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = normalizePhase(optionValue(interaction, 'phase'), true);
    const plan = await requireCurrentPlan(context);
    const snapshot = await liveServices.buildPlan({
      allyCode: context.seedAllyCode,
      redundancyTarget,
      phase,
      interaction,
    });
    const assignments = phaseRows(snapshot?.plan?.assignments, phase);
    const unfilled = phaseRows(snapshot?.plan?.unfilled, phase);
    const diagnostics = {
      safetySummary: {
        helpAssignments: helpCount({ assignments }),
        protectedUnits: Number(snapshot?.safety?.summary?.protectedUnits || 0),
        criticalProtections: Number(snapshot?.safety?.summary?.criticalProtections || 0),
      },
      planningControls: {
        preferenceCount: Number(snapshot?.planningControls?.preferenceCount || 0),
        unavailableMemberCount: Number(snapshot?.planningControls?.unavailableMemberCount || 0),
        hardReservationCount: Number(snapshot?.planningControls?.hardReservationCount || 0),
      },
      guildBindingSource: text(snapshot?.guildBindingSource),
      plannerSummary: snapshot?.plan?.summary || {},
    };
    const inputFingerprint = fingerprint({
      schemaVersion: 1,
      source: 'discord-stage9-live-planner-v1',
      guildId: context.guild.id,
      guildLastSyncedAt: context.guild.lastSyncedAt,
      planId: plan.id,
      planUpdatedAt: plan.updated_at,
      phase,
      planConfiguration: {
        phaseLayout: plan.phase_layout || {},
        requirementOverrides: plan.requirement_overrides || {},
        ignoredMissions: array(plan.ignored_missions),
        ignoredPlatoons: array(plan.ignored_platoons),
        ignoredSlots: array(plan.ignored_slots),
      },
      planningControls: diagnostics.planningControls,
      protections: phaseRows(snapshot?.safety?.protections, phase).map((row) => ({
        memberId: text(row?.memberId),
        baseId: text(row?.baseId),
        severity: Number(row?.severity || 0),
      })),
      assignments: assignments.map(assignmentFingerprintRow),
      unfilled: unfilled.map(unfilledFingerprintRow),
    });
    const result = await versionService.createVersion(context, {
      planId: plan.id,
      rotePhase: phase,
      inputFingerprint,
      assignments,
      unfilled,
      diagnostics,
      delivery: { mode: 'preview', published: false, dmsSent: false },
    });
    return formatPreview(plan, result);
  }

  async function planStatus(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = normalizePhase(optionValue(interaction, 'phase'));
    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) {
      return [
        '**SWGOH Command Center · Immutable ROTE Plan Status**',
        `Guild: **${safe(context.guild.name)}**`,
        'No active persisted ROTE plan exists yet.',
        '',
        '_Read-only. No assignments were published and no DMs were sent._',
      ].join('\n');
    }
    const result = await versionService.listVersions(context, {
      planId: plan.id,
      ...(phase ? { rotePhase: phase } : {}),
      limit: 10,
    });
    return formatStatus(context, plan, array(result.versions), phase);
  }

  async function planApprove(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const plan = await requireCurrentPlan(context);
    const runId = text(optionValue(interaction, 'version'));
    const hash = fullHash(optionValue(interaction, 'hash'));
    if (!runId) throw new Error('Immutable assignment version ID is required.');
    if (!hash) throw new Error('Approval requires the full 64-character plan hash shown by /tb plan-preview or /tb plan-status.');
    const approved = await versionService.approveVersion(context, { runId, planHash: hash });
    const publishability = await publishabilityService.assertPublishable(context, {
      runId,
      planId: plan.id,
      rotePhase: approved?.version?.rotePhase,
    });
    return formatApproval(plan, approved, publishability);
  }

  async function planCancel(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const runId = text(optionValue(interaction, 'version'));
    const reason = text(optionValue(interaction, 'reason'));
    if (!runId) throw new Error('Immutable assignment version ID is required.');
    return formatCancellation(await versionService.cancelVersion(context, { runId, reason }));
  }

  async function planDiff(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const fromRunId = text(optionValue(interaction, 'from'));
    const toRunId = text(optionValue(interaction, 'to'));
    if (!fromRunId || !toRunId) throw new Error('Both immutable assignment version IDs are required.');
    return formatDiff(await compareService.compareVersions(context, { fromRunId, toRunId }));
  }

  async function execute(interaction = {}) {
    const subcommand = requestedSubcommand(interaction);
    if (subcommand === 'plan-preview') return planPreview(interaction);
    if (subcommand === 'plan-status') return planStatus(interaction);
    if (subcommand === 'plan-approve') return planApprove(interaction);
    if (subcommand === 'plan-cancel') return planCancel(interaction);
    if (subcommand === 'plan-diff') return planDiff(interaction);
    throw new Error(`Unsupported Stage 9 /tb subcommand: ${subcommand || '(blank)'}`);
  }

  return Object.freeze({ execute, planPreview, planStatus, planApprove, planCancel, planDiff });
}

export const discordTbStage9PlanCommand = createDiscordTbStage9PlanCommand();
