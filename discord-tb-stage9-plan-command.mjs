import { discordStage9OfficerContext } from './discord-stage9-officer-context.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { tbAssignmentVersionCompareService } from './tb-assignment-version-compare-service.mjs';
import { tbAssignmentVersionService } from './tb-assignment-version-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const first = (value) => array(value)[0] || null;

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function shortHash(value) {
  const hash = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? `${hash.slice(0, 12)}…` : 'invalid';
}

function helpCount(version = {}) {
  const explicit = version?.diagnostics?.safetySummary?.helpAssignments
    ?? version?.diagnostics?.helpAssignments
    ?? version?.diagnostics?.helpCount;
  if (Number.isFinite(Number(explicit))) return Math.max(0, Math.floor(Number(explicit)));
  return array(version.assignments).filter((row) => row?.safety?.help === true).length;
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

function signed(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

export function createDiscordTbStage9PlanCommand(options = {}) {
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || discordStage9OfficerContext;
  const versionService = options.versionService || tbAssignmentVersionService;
  const compareService = options.compareService || tbAssignmentVersionCompareService;

  async function currentPlan(guildId) {
    return first(await store.select('guild_tb_plans', {
      select: 'id,guild_id,tb_key,name,status,updated_at',
      guild_id: `eq.${guildId}`,
      tb_key: 'eq.rote',
      status: 'neq.archived',
      order: 'updated_at.desc',
      limit: 1,
    }));
  }

  async function planStatus(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = text(optionValue(interaction, 'phase')).toUpperCase();
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
    const versions = array(result.versions);
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
      if (versions.length > 1) {
        lines.push('', '**Recent version history**');
        for (const entry of versions.slice(1, 6)) lines.push(formatVersionLine(entry));
        if (versions.length > 6) lines.push(`• +${versions.length - 6} more in Command Center`);
      }
    }

    lines.push('', '_Read-only officer view. This command cannot publish assignments or send DMs._');
    return lines.join('\n').slice(0, 1900);
  }

  async function resolveVersionReference(context, planId, phase, reference, cachedVersions = null) {
    const value = text(reference);
    if (!value) throw new Error('Both immutable version references are required.');
    if (!/^\d+$/.test(value)) return value;
    const versions = cachedVersions || array((await versionService.listVersions(context, { planId, rotePhase: phase, limit: 100 })).versions);
    const match = versions.find((entry) => Number(entry?.version?.versionNumber) === Number(value));
    if (!match?.version?.id) throw new Error(`Immutable ${phase} version v${value} was not found for the current ROTE plan.`);
    return match.version.id;
  }

  async function planDiff(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = text(optionValue(interaction, 'phase')).toUpperCase();
    const fromRef = text(optionValue(interaction, 'from'));
    const toRef = text(optionValue(interaction, 'to'));
    if (!phase) throw new Error('ROTE phase is required for an immutable version comparison.');
    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) throw new Error('No active persisted ROTE plan exists yet.');

    const needsVersionLookup = /^\d+$/.test(fromRef) || /^\d+$/.test(toRef);
    const versions = needsVersionLookup
      ? array((await versionService.listVersions(context, { planId: plan.id, rotePhase: phase, limit: 100 })).versions)
      : null;
    const fromRunId = await resolveVersionReference(context, plan.id, phase, fromRef, versions);
    const toRunId = await resolveVersionReference(context, plan.id, phase, toRef, versions);
    const result = await compareService.compareVersions(context, { fromRunId, toRunId });
    const diff = result.diff || {};
    const summary = diff.summary || {};
    const lines = [
      '**SWGOH Command Center · Immutable ROTE Plan Diff**',
      `Guild: **${safe(context.guild.name)}** · Plan: **${safe(plan.name, 'ROTE Operations Plan')}** · Phase: **${phase}**`,
      `From: **v${Number(diff?.from?.versionNumber || 0)}** \`${shortHash(diff?.from?.planHash)}\` → To: **v${Number(diff?.to?.versionNumber || 0)}** \`${shortHash(diff?.to?.planHash)}\``,
      '',
      `Changes: **${Number(summary.changedDonors || 0)} donor swaps** · **${Number(summary.addedAssignments || 0)} added** · **${Number(summary.removedAssignments || 0)} removed**`,
      `Slot state: **${Number(summary.newlyFilledSlots || 0)} newly filled** · **${Number(summary.newlyUnfilledSlots || 0)} newly unfilled** · HELP delta **${signed(summary.helpDelta)}**`,
    ];

    const changedDonors = array(diff.changedDonors);
    if (changedDonors.length) {
      lines.push('', '**Changed donors**');
      for (const row of changedDonors.slice(0, 6)) {
        lines.push(`• ${safe(row.slotKey)} · ${safe(row?.from?.donorName || row?.from?.donorId)} → **${safe(row?.to?.donorName || row?.to?.donorId)}**`);
      }
      if (changedDonors.length > 6) lines.push(`• +${changedDonors.length - 6} more donor changes`);
    }

    const newlyFilled = array(diff.newlyFilledSlots);
    const newlyUnfilled = array(diff.newlyUnfilledSlots);
    if (newlyFilled.length) lines.push('', `Newly filled: ${newlyFilled.slice(0, 6).map((row) => safe(row.slotKey)).join(', ')}`);
    if (newlyUnfilled.length) lines.push(`Newly unfilled: ${newlyUnfilled.slice(0, 6).map((row) => safe(row.slotKey)).join(', ')}`);

    lines.push('', '_Verified read-only diff. No assignments were published and no DMs were sent._');
    return lines.join('\n').slice(0, 1900);
  }

  async function execute(interaction = {}) {
    const subcommand = text(array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2)?.name).toLowerCase();
    if (subcommand === 'plan-status') return planStatus(interaction);
    if (subcommand === 'plan-diff') return planDiff(interaction);
    throw new Error(`Unsupported Stage 9 /tb subcommand: ${subcommand || '(blank)'}`);
  }

  return Object.freeze({ execute, planStatus, planDiff });
}

export const discordTbStage9PlanCommand = createDiscordTbStage9PlanCommand();
