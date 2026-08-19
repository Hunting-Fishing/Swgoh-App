import { discordStage9OfficerContext } from './discord-stage9-officer-context.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
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

export function createDiscordTbStage9PlanCommand(options = {}) {
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || discordStage9OfficerContext;
  const versionService = options.versionService || tbAssignmentVersionService;

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

  async function execute(interaction = {}) {
    const subcommand = text(array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2)?.name).toLowerCase();
    if (subcommand === 'plan-status') return planStatus(interaction);
    throw new Error(`Unsupported Stage 9 /tb subcommand: ${subcommand || '(blank)'}`);
  }

  return Object.freeze({ execute, planStatus });
}

export const discordTbStage9PlanCommand = createDiscordTbStage9PlanCommand();
