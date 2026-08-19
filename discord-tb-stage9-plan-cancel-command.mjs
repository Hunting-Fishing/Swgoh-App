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

function optionValue(interaction = {}, name = '') {
  const subcommand = array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return array(subcommand?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

export function createDiscordTbStage9PlanCancelCommand(options = {}) {
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

  async function resolveVersionReference(context, planId, phase, reference) {
    const value = text(reference);
    if (!value) throw new Error('An immutable version reference is required.');
    if (!/^\d+$/.test(value)) return value;
    const versions = array((await versionService.listVersions(context, { planId, rotePhase: phase, limit: 100 })).versions);
    const match = versions.find((entry) => Number(entry?.version?.versionNumber) === Number(value));
    if (!match?.version?.id) throw new Error(`Immutable ${phase} version v${value} was not found for the current ROTE plan.`);
    return match.version.id;
  }

  async function execute(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = text(optionValue(interaction, 'phase')).toUpperCase();
    const versionRef = text(optionValue(interaction, 'version'));
    const reason = text(optionValue(interaction, 'reason')).slice(0, 300);
    if (!phase) throw new Error('ROTE phase is required for immutable plan cancellation.');

    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) throw new Error('No active persisted ROTE plan exists yet.');
    const runId = await resolveVersionReference(context, plan.id, phase, versionRef);
    const selected = await versionService.getVersion(context, { runId });
    const version = selected?.version || {};

    if (text(version.planId) !== text(plan.id)) throw new Error('The selected immutable version does not belong to the current ROTE plan.');
    if (text(version.rotePhase).toUpperCase() !== phase) throw new Error(`The selected immutable version belongs to ${safe(version.rotePhase)}, not ${phase}.`);
    if (selected?.verification?.valid !== true) throw new Error('The selected immutable version failed deterministic hash verification and cannot be cancelled through Discord.');

    const cancelled = await versionService.cancelVersion(context, { runId, reason });
    const result = cancelled?.version || version;
    const hashValid = cancelled?.hashVerification?.valid !== false;
    return [
      '**SWGOH Command Center · Immutable ROTE Plan Cancelled**',
      `Guild: **${safe(context.guild.name)}** · Plan: **${safe(plan.name, 'ROTE Operations Plan')}** · Phase: **${phase}**`,
      `Cancelled: **v${Number(result.versionNumber || 0)}** · hash \`${shortHash(result.planHash)}\` · payload hash ${hashValid ? '✅' : '❌'}`,
      `Reason: ${safe(result.cancellationReason || reason, 'No reason supplied')}`,
      `Cancellation actor: linked Command Center **${safe(context.role)}** account`,
      '',
      'The immutable assignment payload was not edited. This version is now fail-closed for future Stage 10 delivery.',
      '_No assignments were published and no DMs were sent._',
    ].join('\n').slice(0, 1900);
  }

  return Object.freeze({ execute });
}

export const discordTbStage9PlanCancelCommand = createDiscordTbStage9PlanCancelCommand();
