import { discordStage9OfficerContext } from './discord-stage9-officer-context.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { tbStage9PlanPreviewService } from './tb-stage9-plan-preview-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const first = (value) => array(value)[0] || null;

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function optionValue(interaction = {}, name = '') {
  const subcommand = array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return array(subcommand?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

function shortId(value) {
  const id = text(value);
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id || '—';
}

export function createDiscordTbStage9PlanPreviewCommand(options = {}) {
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || discordStage9OfficerContext;
  const previewService = options.previewService || tbStage9PlanPreviewService;

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

  async function execute(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = text(optionValue(interaction, 'phase')).toUpperCase();
    if (!/^P[1-6]$/.test(phase)) throw new Error('ROTE phase P1 through P6 is required for immutable plan preview.');

    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) throw new Error('No active persisted ROTE plan exists yet. Create/save the ROTE plan in Command Center first.');

    const result = await previewService.createPreview(context, {
      planId: plan.id,
      phase,
      interaction,
    });
    const version = result?.version || {};
    const summary = result?.summary || {};
    const hash = text(version.planHash).toLowerCase();
    const fingerprint = text(result.inputFingerprint).toLowerCase();
    const confirmation = /^[0-9a-f]{64}$/.test(hash) ? hash.slice(0, 12) : '';
    const lines = [
      '**SWGOH Command Center · Immutable ROTE Plan Preview Created**',
      `Guild: **${safe(context.guild.name)}** · Plan: **${safe(plan.name, 'ROTE Operations Plan')}** · Phase: **${phase}**`,
      `Immutable version: **v${Number(version.versionNumber || 0)}** · ID: \`${shortId(version.id)}\``,
      `Assigned: **${Number(summary.assigned || 0)}** · Unfilled: **${Number(summary.unfilled || 0)}** · HELP/risk: **${Number(summary.helpAssignments || 0)}**`,
      `Payload hash: \`${hash || 'unavailable'}\``,
      `Input fingerprint: \`${fingerprint || 'unavailable'}\``,
      `Deterministic verification: **${result?.verification?.valid === true ? 'PASS ✅' : 'FAILED ❌'}** · controls stable: **${result?.controlsStable === true ? 'YES ✅' : 'NO ❌'}**`,
    ];

    if (version.supersedesRunId) lines.push(`Supersedes prior immutable version ID: \`${shortId(version.supersedesRunId)}\``);
    lines.push('', '**Status: AWAITING OFFICER APPROVAL**');
    if (confirmation) lines.push(`Approve this exact artifact with: \`/tb plan-approve phase:${phase} version:${Number(version.versionNumber || 0)} hash:${confirmation}\``);
    lines.push('', '**Stage 10 delivery remains locked.** This preview did not publish assignments and did not send member DMs.');
    return lines.join('\n').slice(0, 1950);
  }

  return Object.freeze({ execute });
}

export const discordTbStage9PlanPreviewCommand = createDiscordTbStage9PlanPreviewCommand();
