import { tbStage10DiscordDeliveryService } from './tb-stage10-discord-delivery-service.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function shortHash(value) {
  const hash = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? `${hash.slice(0, 12)}…` : 'invalid';
}

function shortKey(value) {
  const key = text(value);
  return key ? `${key.slice(0, 12)}…` : '—';
}

function optionValue(interaction = {}, name = '') {
  const subcommand = array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return array(subcommand?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

function subcommand(interaction = {}) {
  return text(array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2)?.name).toLowerCase();
}

function lifecycle(version = {}) {
  if (version.cancelledAt || version.status === 'cancelled') return 'CANCELLED';
  if (version.supersededByRunId) return 'SUPERSEDED';
  if (version.approvedAt && text(version.approvedPlanHash).toLowerCase() === text(version.planHash).toLowerCase()) return 'APPROVED';
  return 'AWAITING APPROVAL';
}

function formatPreview(result = {}) {
  const artifact = result.artifact || {};
  const destination = result.destination || {};
  const existing = Number(result.delivered || 0);
  const lines = [
    '**SWGOH Command Center · Stage 10 ROTE Delivery Preview**',
    `Guild: **${safe(result?.context?.guild?.name)}** · Phase: **${safe(artifact.rotePhase)}** · Immutable: **v${Number(artifact.versionNumber || 0)}**`,
    `Approved hash: \`${shortHash(artifact.planHash)}\` · publishability: **PASS ✅**`,
    `Artifact: **${array(artifact.assignments).length} assigned** · **${array(artifact.unfilled).length} unfilled**`,
    `Verified destination: **${safe(destination.display_name, 'Guild command channel')}** · channel \`${safe(result.channelId)}\``,
    `Channel messages required: **${array(result.chunks).length}** · already delivered for this exact artifact: **${existing}**`,
    `Idempotency: \`${shortKey(result.idempotencyKey)}\``,
    '',
    result.deliveryEnabled
      ? '**Safety gate: ARMED** · publishing still requires action:PUBLISH + exact hash + confirm:PUBLISH.'
      : '**Safety gate: LOCKED** · DISCORD_STAGE10_TB_CHANNEL_ENABLED is not enabled.',
    '**Member mentions: OFF · Member DMs: OFF · Webhook fallback: OFF**',
    '',
    `Publish only this exact artifact with: \`/tb plan-delivery action:PUBLISH phase:${safe(artifact.rotePhase)} version:${Number(artifact.versionNumber || 0)} hash:${text(artifact.planHash).slice(0, 12)} confirm:PUBLISH\``,
    '',
    '_Read-only preview. No Discord assignment messages were sent._',
  ];
  return lines.join('\n').slice(0, 1900);
}

function formatPublished(result = {}) {
  const artifact = result.artifact || {};
  const replay = Number(result.newMessages || 0) === 0 && Number(result.reusedChunks || 0) > 0;
  const lines = [
    `**SWGOH Command Center · Stage 10 ROTE ${replay ? 'Idempotent Replay' : 'Channel Delivery Complete'}**`,
    `Guild: **${safe(result?.context?.guild?.name)}** · Phase: **${safe(artifact.rotePhase)}** · Immutable: **v${Number(artifact.versionNumber || 0)}**`,
    `Approved hash: \`${shortHash(artifact.planHash)}\``,
    `Verified channel: \`${safe(result.channelId)}\``,
    `Chunks: **${Number(result.chunks || 0)}** · new messages: **${Number(result.newMessages || 0)}** · reused receipts: **${Number(result.reusedChunks || 0)}**`,
    `Idempotency: \`${shortKey(result.idempotencyKey)}\``,
    '**Member mentions: OFF · Member DMs sent: 0 · Webhook fallback: OFF**',
    '',
    replay
      ? '_The exact approved artifact was already delivered. No duplicate Discord messages were sent._'
      : '_Delivery receipts were persisted for every channel message. Automatic/proactive publishing remains disabled._',
  ];
  return lines.join('\n').slice(0, 1900);
}

function formatStatus(result = {}) {
  const artifact = result.artifact || {};
  const receipts = array(result.receipts);
  const counts = receipts.reduce((acc, row) => {
    const key = text(row?.status) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const lines = [
    '**SWGOH Command Center · Stage 10 ROTE Delivery Status**',
    `Guild: **${safe(result?.context?.guild?.name)}** · Phase: **${safe(artifact.rotePhase)}** · Immutable: **v${Number(artifact.versionNumber || 0)}**`,
    `Lifecycle: **${lifecycle(artifact)}** · hash ${result?.verification?.valid ? '✅' : '❌'} \`${shortHash(artifact.planHash)}\``,
    `Verified channel: \`${safe(result.channelId)}\` · idempotency \`${shortKey(result.idempotencyKey)}\``,
    `Receipts: **${receipts.length}** · delivered **${Number(counts.delivered || 0)}** · sending **${Number(counts.sending || 0)}** · failed **${Number(counts.failed || 0)}**`,
  ];
  if (receipts.length) {
    lines.push('', '**Durable channel receipts**');
    for (const row of receipts.slice(0, 8)) {
      lines.push(`• chunk ${Number(row.chunk_index || 0) + 1} · **${safe(row.status)}** · message \`${safe(row.external_message_id)}\``);
    }
    if (receipts.length > 8) lines.push(`• +${receipts.length - 8} more receipts`);
  } else {
    lines.push('', 'No Stage 10 delivery receipts exist for this exact immutable artifact and destination.');
  }
  lines.push('', '_Read-only receipt view. This command cannot publish or send DMs._');
  return lines.join('\n').slice(0, 1900);
}

export function createDiscordTbStage10Command(options = {}) {
  const service = options.service || tbStage10DiscordDeliveryService;

  async function execute(interaction = {}) {
    const name = subcommand(interaction);
    if (name === 'delivery-status') return formatStatus(await service.status(interaction));
    if (name === 'plan-delivery') {
      const action = text(optionValue(interaction, 'action')).toLowerCase();
      if (action === 'preview') return formatPreview(await service.preview(interaction));
      if (action === 'publish') return formatPublished(await service.publish(interaction));
      throw new Error('Stage 10 plan-delivery requires action:PREVIEW or action:PUBLISH.');
    }
    const error = new Error('Unknown Stage 10 ROTE delivery command.');
    error.status = 404;
    error.code = 'STAGE10_SUBCOMMAND_NOT_FOUND';
    throw error;
  }

  return Object.freeze({ execute });
}

export const discordTbStage10Command = createDiscordTbStage10Command();
