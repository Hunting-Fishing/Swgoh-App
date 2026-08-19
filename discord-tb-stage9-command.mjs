import { createDiscordTbLiveServices } from './discord-tb-live.mjs';
import { createDiscordTbPlanVersionService } from './discord-tb-plan-version-service.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const MAX_CONTENT = 1900;
const STAGE9 = new Set(['plan-preview', 'plan-status', 'plan-approve', 'plan-cancel', 'plan-diff']);

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

function activeSubcommand(interaction = {}) {
  return array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2) || null;
}

function option(interaction, name) {
  return array(activeSubcommand(interaction)?.options)
    .find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

function phase(value) {
  const normalized = text(value).toUpperCase();
  return /^P[1-6]$/.test(normalized) ? normalized : '';
}

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function truncate(value) {
  const source = String(value || '');
  if (source.length <= MAX_CONTENT) return source;
  return `${source.slice(0, MAX_CONTENT - 80)}\n…more version detail is available in Command Center.`;
}

function shortHash(value, length = 16) {
  const hash = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash.slice(0, length) : safe(hash);
}

function approvalLabel(row = {}) {
  if (text(row.status).toLowerCase() === 'cancelled' || row.cancelled_at) return 'CANCELLED';
  if (row.superseded_by_run_id) return 'SUPERSEDED';
  if (text(row?.approval?.decision) === 'approved' && text(row?.approval?.plan_hash) === text(row.plan_hash)) return 'APPROVED';
  if (text(row?.approval?.decision) === 'revoked') return 'REVOKED';
  return 'UNAPPROVED';
}

function helpCount(assignments) {
  return array(assignments).filter((row) => {
    const status = text(row?.safety?.status || 'SAFE').toUpperCase();
    return row?.safety?.help === true || row?.safety?.forced === true || status !== 'SAFE';
  }).length;
}

function phaseRows(rows, selectedPhase) {
  return array(rows).filter((row) => text(row?.phase).toUpperCase() === selectedPhase);
}

function formatPreview(version = {}) {
  const assigned = array(version.assignments).length;
  const unfilled = array(version.unfilled).length;
  const risk = Number(version?.diagnostics?.helpAssignments ?? helpCount(version.assignments));
  const lines = [
    `**SWGOH Command Center · Immutable ROTE Preview · ${safe(version.rote_phase)}**`,
    `Version: **#${Number(version.version_number || 0)}** · State: **${approvalLabel(version)}**`,
    `Version ID: \`${safe(version.id)}\``,
    `Plan hash: \`${safe(version.plan_hash)}\``,
    `Confirm token: \`${shortHash(version.plan_hash, 16)}\``,
    `Assigned: **${assigned}** · Unfilled: **${unfilled}** · HELP/risk: **${risk}**`,
  ];
  if (version.supersedes_run_id) lines.push(`Supersedes: \`${safe(version.supersedes_run_id)}\``);
  lines.push('', 'Approval is bound to this exact hash. Any changed planner output becomes a different version/hash.');
  lines.push('_Stage 9 safety mode: no assignments were published and no DMs were sent._');
  return truncate(lines.join('\n'));
}

function formatStatus(rows = [], selectedPhase = '') {
  const lines = [
    `**SWGOH Command Center · Immutable ROTE Versions${selectedPhase ? ` · ${selectedPhase}` : ''}**`,
    `Stored versions shown: **${rows.length}**`,
  ];
  if (!rows.length) {
    lines.push('', 'No immutable Stage 9 assignment previews exist for this scope yet.');
  } else {
    lines.push('');
    for (const row of rows.slice(0, 8)) {
      lines.push(`• **${safe(row.rote_phase)} #${Number(row.version_number || 0)}** · **${approvalLabel(row)}** · hash \`${shortHash(row.plan_hash, 12)}\` · ID \`${safe(row.id)}\``);
    }
    if (rows.length > 8) lines.push(`• +${rows.length - 8} more versions`);
  }
  lines.push('', '_Read-only version ledger. Publishing and DMs remain disabled._');
  return truncate(lines.join('\n'));
}

function formatApproval(result = {}, publishability = null) {
  const run = result.run || {};
  const lines = [
    '**SWGOH Command Center · ROTE Version Approved**',
    `Phase/version: **${safe(run.rote_phase)} #${Number(run.version_number || 0)}**`,
    `Version ID: \`${safe(run.id)}\``,
    `Approved hash: \`${safe(run.plan_hash)}\``,
    `Decision: **${result.idempotent ? 'ALREADY APPROVED' : 'APPROVED'}**`,
    `Publishability safety gate: **${publishability?.publishable === true ? 'PASS' : 'NOT EVALUATED'}**`,
    '',
    'This approval authorizes only this exact immutable hash. A newer/superseding version invalidates it for publishing.',
    '_Stage 9 does not publish assignments or send DMs._',
  ];
  return truncate(lines.join('\n'));
}

function formatCancellation(result = {}) {
  return truncate([
    '**SWGOH Command Center · ROTE Version Cancelled**',
    `Phase/version: **${safe(result.rote_phase)} #${Number(result.version_number || 0)}**`,
    `Version ID: \`${safe(result.id)}\``,
    `State: **CANCELLED**${result.idempotent ? ' · already cancelled' : ''}`,
    result.cancel_reason ? `Reason: ${safe(result.cancel_reason)}` : '',
    '',
    'Cancelled versions fail closed and cannot pass the Stage 10 publishability gate.',
    '_No assignments were published and no DMs were sent._',
  ].filter(Boolean).join('\n'));
}

function formatDiff(delta = {}) {
  const lines = [
    `**SWGOH Command Center · ROTE Version Diff · #${Number(delta.fromVersion || 0)} → #${Number(delta.toVersion || 0)}**`,
    `Changed donors: **${array(delta.changedDonors).length}** · Added assignments: **${array(delta.addedAssignments).length}** · Removed: **${array(delta.removedAssignments).length}**`,
    `Newly filled: **${array(delta.newlyFilled).length}** · Newly unfilled: **${array(delta.newlyUnfilled).length}**`,
    `HELP/risk: **${Number(delta?.risk?.from || 0)} → ${Number(delta?.risk?.to || 0)} (${Number(delta?.risk?.delta || 0) >= 0 ? '+' : ''}${Number(delta?.risk?.delta || 0)})**`,
  ];
  if (array(delta.changedDonors).length) {
    lines.push('', '**Changed donor preview**');
    for (const row of array(delta.changedDonors).slice(0, 6)) {
      lines.push(`• ${safe(row?.to?.phase)} · ${safe(row?.to?.unitName || row?.to?.baseId)}: **${safe(row?.from?.donorName || row?.from?.donorId)} → ${safe(row?.to?.donorName || row?.to?.donorId)}**`);
    }
  }
  lines.push('', '_Read-only immutable version comparison. No publishing or DMs._');
  return truncate(lines.join('\n'));
}

export function isDiscordTbStage9Subcommand(value) {
  return STAGE9.has(text(value).toLowerCase());
}

export async function executeDiscordTbStage9Command(interaction, config, services = {}) {
  const subcommand = text(activeSubcommand(interaction)?.name).toLowerCase();
  if (!STAGE9.has(subcommand)) throw new Error(`Unsupported Stage 9 /tb subcommand: ${subcommand || 'unknown'}`);
  if (services.authorizedAsOfficer !== true) throw new Error('Stage 9 immutable plan commands require Discord officer authorization.');

  const stateStore = services.stateStore || discordStateStore;
  const store = services.store || supabaseCoreStore;
  const versionService = services.planVersionService || createDiscordTbPlanVersionService({ stateStore, store });

  if (subcommand === 'plan-preview') {
    const selectedPhase = phase(option(interaction, 'phase'));
    if (!selectedPhase) throw new Error('Choose a ROTE phase from P1 through P6 for /tb plan-preview.');
    const live = typeof services.buildPlan === 'function'
      ? services
      : createDiscordTbLiveServices(services.env || process.env, {
        stateStore,
        store,
        ...(typeof services.fetch === 'function' ? { fetch: services.fetch } : {}),
      });
    const snapshot = await live.buildPlan({
      allyCode: config.pilotAllyCode,
      redundancyTarget: config.redundancyTarget,
      phase: selectedPhase,
      interaction,
    });
    const assignments = phaseRows(snapshot?.plan?.assignments, selectedPhase);
    const unfilled = phaseRows(snapshot?.plan?.unfilled, selectedPhase);
    const diagnostics = {
      helpAssignments: helpCount(assignments),
      protectedUnits: Number(snapshot?.safety?.summary?.protectedUnits || 0),
      criticalProtections: Number(snapshot?.safety?.summary?.criticalProtections || 0),
      preferenceCount: Number(snapshot?.planningControls?.preferenceCount || 0),
      unavailableMemberCount: Number(snapshot?.planningControls?.unavailableMemberCount || 0),
      hardReservationCount: Number(snapshot?.planningControls?.hardReservationCount || 0),
      guildBindingSource: safe(snapshot?.guildBindingSource, 'unknown'),
    };
    const version = await versionService.createVersion(interaction, {
      phase: selectedPhase,
      assignments,
      unfilled,
      diagnostics,
    });
    const stored = typeof versionService.getVersion === 'function'
      ? await versionService.getVersion(interaction, version.id)
      : version;
    return formatPreview(stored);
  }

  if (subcommand === 'plan-status') {
    const selectedPhase = phase(option(interaction, 'phase'));
    const rows = await versionService.listVersions(interaction, {
      ...(selectedPhase ? { phase: selectedPhase } : {}),
      limit: 20,
    });
    return formatStatus(rows, selectedPhase);
  }

  if (subcommand === 'plan-approve') {
    const runId = text(option(interaction, 'version'));
    const hash = text(option(interaction, 'hash')).toLowerCase();
    const reason = text(option(interaction, 'reason'));
    if (!runId) throw new Error('Choose an immutable version ID for /tb plan-approve.');
    if (!hash) throw new Error('Paste at least the first 12 characters of the displayed plan hash.');
    const approved = await versionService.approveVersion(interaction, runId, hash, reason);
    const publishability = typeof versionService.assertPublishable === 'function'
      ? await versionService.assertPublishable(interaction, runId)
      : null;
    return formatApproval(approved, publishability);
  }

  if (subcommand === 'plan-cancel') {
    const runId = text(option(interaction, 'version'));
    const reason = text(option(interaction, 'reason'));
    if (!runId) throw new Error('Choose an immutable version ID for /tb plan-cancel.');
    return formatCancellation(await versionService.cancelVersion(interaction, runId, reason));
  }

  const fromRunId = text(option(interaction, 'from'));
  const toRunId = text(option(interaction, 'to'));
  if (!fromRunId || !toRunId) throw new Error('Both from and to immutable version IDs are required for /tb plan-diff.');
  return formatDiff(await versionService.compareVersions(interaction, fromRunId, toRunId));
}