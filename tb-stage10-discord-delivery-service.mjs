import { createHash } from 'node:crypto';
import { discordStage9OfficerContext } from './discord-stage9-officer-context.mjs';
import { guildOperationsDiscordDelivery } from './guild-operations-discord-delivery.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';
import { tbAssignmentPublishabilityService } from './tb-assignment-publishability-service.mjs';
import { tbAssignmentVersionService } from './tb-assignment-version-service.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_CONTENT = 1800;
const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;

function serviceError(message, status = 409, code = 'STAGE10_DELIVERY_REJECTED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function sha(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function shortHash(value) {
  const hash = text(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? `${hash.slice(0, 12)}…` : 'invalid';
}

function snowflake(value) {
  const candidate = text(value);
  return /^\d{16,22}$/.test(candidate) ? candidate : '';
}

function allyCode(value) {
  const digits = text(value).replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : '';
}

function splitLines(lines, max = MAX_CONTENT) {
  const chunks = [];
  let current = '';
  for (const raw of lines) {
    const line = String(raw ?? '');
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > max) {
      if (current) chunks.push(current);
      current = line;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['SWGOH Command Center · approved ROTE assignment delivery'];
}

function helpCount(artifact = {}) {
  return array(artifact.assignments).filter((row) => row?.safety?.help === true).length;
}

function memberKey(row = {}) {
  const playerId = text(row?.member?.playerId);
  const code = allyCode(row?.member?.allyCode);
  const name = safe(row?.member?.name, '').toLowerCase();
  return playerId ? `player:${playerId}` : code ? `ally:${code}` : name ? `name:${name}` : '';
}

function linkedUsersFromBinding(binding = {}) {
  const byPlayerId = new Map();
  const byAllyCode = new Map();
  for (const [discordUserIdRaw, link] of Object.entries(object(binding?.guildState?.userLinks))) {
    const discordUserId = snowflake(discordUserIdRaw);
    if (!discordUserId) continue;
    const playerId = text(link?.playerId);
    const code = allyCode(link?.swgohAllyCode);
    if (playerId) byPlayerId.set(playerId, discordUserId);
    if (code) byAllyCode.set(code, discordUserId);
  }
  return Object.freeze({ byPlayerId, byAllyCode });
}

function discordUserForAssignment(row = {}, links = {}) {
  const playerId = text(row?.member?.playerId);
  const code = allyCode(row?.member?.allyCode);
  return (playerId && links.byPlayerId?.get(playerId)) || (code && links.byAllyCode?.get(code)) || '';
}

function mentionCoverage(assignments = [], links = {}) {
  const members = new Map();
  for (const row of array(assignments)) {
    const key = memberKey(row);
    if (!key || members.has(key)) continue;
    members.set(key, Object.freeze({
      key,
      name: safe(row?.member?.name, allyCode(row?.member?.allyCode) || 'member'),
      discordUserId: discordUserForAssignment(row, links),
    }));
  }
  const values = [...members.values()];
  const linked = values.filter((row) => Boolean(row.discordUserId));
  const unlinked = values.filter((row) => !row.discordUserId);
  const audienceRows = values
    .map((row) => `${row.key}|${row.discordUserId || 'unlinked'}`)
    .sort((a, b) => a.localeCompare(b));
  return Object.freeze({
    assignedMembers: values.length,
    linkedMembers: linked.length,
    unlinkedMembers: unlinked.length,
    linkedDiscordUserIds: Object.freeze(linked.map((row) => row.discordUserId).sort()),
    unlinkedNames: Object.freeze(unlinked.map((row) => row.name).sort((a, b) => a.localeCompare(b))),
    audienceFingerprint: sha(audienceRows.join('\n')),
  });
}

function mentionIdsInContent(content = '') {
  const ids = new Set();
  for (const match of String(content).matchAll(/<@(\d{16,22})>/g)) ids.add(match[1]);
  return [...ids];
}

function renderApprovedArtifact(artifact = {}, guildName = '', binding = {}, includeMentions = true) {
  const links = linkedUsersFromBinding(binding);
  const assignments = array(artifact.assignments).slice().sort((a, b) =>
    safe(a.phase).localeCompare(safe(b.phase))
      || safe(a.squadId || a.conflictId).localeCompare(safe(b.squadId || b.conflictId))
      || safe(a.name || a.baseId).localeCompare(safe(b.name || b.baseId))
  );
  const coverage = mentionCoverage(assignments, links);
  const lines = [
    '**SWGOH Command Center · APPROVED ROTE Operation Assignments**',
    `Guild: **${safe(guildName)}** · Phase: **${safe(artifact.rotePhase)}** · Immutable: **v${Number(artifact.versionNumber || 0)}**`,
    `Approved artifact: \`${shortHash(artifact.planHash)}\``,
    `Assigned: **${assignments.length}** · Unfilled: **${array(artifact.unfilled).length}** · HELP/risk: **${helpCount(artifact)}**`,
    includeMentions
      ? `Member @mentions: **ON** · linked assigned members: **${coverage.linkedMembers}/${coverage.assignedMembers}** · unlinked: **${coverage.unlinkedMembers}**`
      : 'Member @mentions: **OFF** · names only',
    '',
  ];
  for (const row of assignments) {
    const status = row?.safety?.help === true ? ' · ⚠️ HELP' : '';
    const discordUserId = includeMentions ? discordUserForAssignment(row, links) : '';
    const member = discordUserId
      ? `<@${discordUserId}>`
      : `**${safe(row?.member?.name, row?.member?.allyCode || 'member')}**`;
    lines.push(`• ${safe(row.squadId || row.conflictId, 'Operation')} · **${safe(row.name || row.baseId, 'unit')}** → ${member}${status}`);
  }
  const unfilled = array(artifact.unfilled);
  if (unfilled.length) {
    lines.push('', '**Unfilled · officer attention**');
    for (const row of unfilled.slice(0, 20)) {
      lines.push(`• ${safe(row.squadId || row.conflictId, 'Operation')} · **${safe(row.name || row.baseId, 'unit')}**`);
    }
    if (unfilled.length > 20) lines.push(`• +${unfilled.length - 20} more unfilled slots in Command Center`);
  }
  lines.push('', includeMentions
    ? '_Immutable officer-approved artifact. Linked members are mentionable; each linked member is notification-allowlisted at most once across this delivery. Member DMs remain disabled._'
    : '_Immutable officer-approved artifact. Member mentions and DMs are disabled for this delivery._');

  const seenPingUsers = new Set();
  const chunks = splitLines(lines).map((content) => {
    const present = includeMentions ? mentionIdsInContent(content) : [];
    const allowedUsers = present.filter((userId) => !seenPingUsers.has(userId));
    for (const userId of allowedUsers) seenPingUsers.add(userId);
    return Object.freeze({
      content,
      allowedUsers: Object.freeze(allowedUsers),
      contentHash: sha(content),
    });
  });
  return Object.freeze({ chunks: Object.freeze(chunks), coverage });
}

function optionValue(interaction = {}, name = '') {
  const subcommand = array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  return array(subcommand?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

function mentionPolicy(interaction = {}) {
  const raw = text(optionValue(interaction, 'mentions')).toLowerCase();
  if (!raw) return true;
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  throw serviceError('Mentions must be ON or OFF.', 400, 'STAGE10_MENTION_POLICY_INVALID');
}

function requestedChannel(interaction = {}) {
  const raw = text(optionValue(interaction, 'channel'));
  if (!raw) return '';
  const channelId = snowflake(raw);
  if (!channelId) throw serviceError('Selected Discord channel ID is invalid.', 400, 'STAGE10_CHANNEL_INVALID');
  return channelId;
}

export function stage10DeliveryConfig(env = process.env) {
  return Object.freeze({
    enabled: boolEnv(env.DISCORD_STAGE10_TB_CHANNEL_ENABLED, false),
    botToken: text(env.DISCORD_BOT_TOKEN),
    requestTimeoutMs: Math.max(5000, Math.min(30000, Number(env.DISCORD_DELIVERY_TIMEOUT_MS || 15000))),
  });
}

export function createTbStage10DiscordDeliveryService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const contextResolver = options.contextResolver || discordStage9OfficerContext;
  const versionService = options.versionService || tbAssignmentVersionService;
  const publishability = options.publishability || tbAssignmentPublishabilityService;
  const destinationService = options.destinationService || guildOperationsDiscordDelivery;
  const fetchImpl = options.fetch || fetch;
  const env = options.env || process.env;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

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

  async function resolveVersion(context, planId, phase, versionNumber) {
    const versions = array((await versionService.listVersions(context, {
      planId,
      rotePhase: phase,
      limit: 100,
    })).versions);
    const match = versions.find((entry) => Number(entry?.version?.versionNumber || 0) === Number(versionNumber));
    if (!match?.version?.id) throw serviceError(`Immutable ${phase} version v${versionNumber} was not found for the current ROTE plan.`, 404, 'TB_ASSIGNMENT_VERSION_NOT_FOUND');
    return match;
  }

  async function readVerifiedDestination(context, binding, channelId) {
    const destination = first(await store.select('guild_discord_destinations', {
      select: '*',
      guild_id: `eq.${context.guild.id}`,
      destination_kind: 'eq.channel',
      external_id: `eq.${channelId}`,
      verified: 'eq.true',
      limit: 1,
    }));
    if (!destination?.id) {
      throw serviceError('Selected Discord channel is not a durable verified Guild destination. Verify it with /guild verify-channel first.', 409, 'VERIFIED_DESTINATION_REQUIRED');
    }
    if (snowflake(destination?.metadata?.discordGuildId) !== snowflake(binding.discordGuildId)) {
      throw serviceError('Selected verified channel does not belong to the currently bound Discord server.', 409, 'CHANNEL_GUILD_MISMATCH');
    }
    const channelType = destination?.metadata?.channelType;
    if (channelType !== undefined && channelType !== null && ![0, 5].includes(Number(channelType))) {
      throw serviceError('Stage 10 assignment delivery supports verified text or announcement channels only.', 409, 'UNSUPPORTED_CHANNEL_TYPE');
    }
    return destination;
  }

  async function verifiedChannel(context, requestedChannelId = '') {
    const synced = await destinationService.syncVerifiedDestinations(context.guild.id);
    const binding = synced?.binding;
    if (!binding || text(binding.discordGuildId) !== text(context.discordGuildId)) {
      throw serviceError('The SWGOH Guild does not have a verified Discord binding for this server.', 409, 'DISCORD_GUILD_NOT_VERIFIED');
    }

    const selectedChannelId = requestedChannelId || snowflake(binding?.guildState?.commandChannelId);
    if (!selectedChannelId) {
      throw serviceError('No verified Guild command channel is configured. Run signed /tb setup or select a verified channel before Stage 10 delivery.', 409, 'VERIFIED_DESTINATION_REQUIRED');
    }

    let destination = array(synced?.destinations).find((row) =>
      row?.verified === true
      && text(row?.destination_kind) === 'channel'
      && snowflake(row?.external_id) === selectedChannelId
      && snowflake(row?.metadata?.discordGuildId) === snowflake(context.discordGuildId)
    );
    if (!destination?.id || requestedChannelId) {
      destination = await readVerifiedDestination(context, binding, selectedChannelId);
    }
    if (!destination?.id) {
      throw serviceError('The configured Discord channel is not a durable verified Guild destination.', 409, 'VERIFIED_DESTINATION_REQUIRED');
    }
    return Object.freeze({ binding, destination, channelId: selectedChannelId });
  }

  function idempotencyKey(artifact, destination, includeMentions) {
    return sha(`stage10|tb|${artifact.id}|${artifact.planHash}|${destination.id}|discord-channel|mentions:${includeMentions ? 'true' : 'false'}|dms:false`);
  }

  async function receiptsFor(key) {
    return array(await store.select('guild_operations_delivery_receipts', {
      select: '*',
      idempotency_key: `eq.${key}`,
      delivery_kind: 'eq.discord_channel',
      recipient_key: 'eq.public',
      order: 'chunk_index.asc',
      limit: 100,
    }));
  }

  async function receiptForChunk(key, chunkIndex) {
    return first(await store.select('guild_operations_delivery_receipts', {
      select: '*',
      idempotency_key: `eq.${key}`,
      delivery_kind: 'eq.discord_channel',
      recipient_key: 'eq.public',
      chunk_index: `eq.${chunkIndex}`,
      limit: 1,
    }));
  }

  function assertAudienceStable(receipts, currentFingerprint, includeMentions) {
    if (!includeMentions || !array(receipts).length) return;
    for (const receipt of array(receipts)) {
      const previous = text(receipt?.request_metadata?.audienceFingerprint);
      if (previous && previous !== currentFingerprint) {
        throw serviceError('The Discord member-link registry changed after this mention delivery began. Delivery stopped to prevent a mixed notification audience; create a new reviewed delivery after reconciling the existing receipts.', 409, 'STAGE10_MENTION_AUDIENCE_CHANGED');
      }
    }
  }

  async function claimChunk(context, artifact, destination, key, chunkIndex, chunk, includeMentions, audienceFingerprint) {
    let existing = await receiptForChunk(key, chunkIndex);
    if (existing?.status === 'delivered') {
      const previousAudience = text(existing?.request_metadata?.audienceFingerprint);
      if (includeMentions && previousAudience && previousAudience !== audienceFingerprint) {
        throw serviceError('The linked-member mention audience changed for an already-delivered chunk. Delivery stopped fail-closed.', 409, 'STAGE10_MENTION_AUDIENCE_CHANGED');
      }
      const previousHash = text(existing?.request_metadata?.contentHash);
      if (previousHash && previousHash !== chunk.contentHash) {
        throw serviceError('This exact artifact/destination already has delivered receipts for different rendered mention content. Delivery stopped to prevent a mixed or duplicate post set.', 409, 'STAGE10_DELIVERY_CONTENT_CHANGED');
      }
      return { receipt: existing, reused: true };
    }
    if (existing?.status === 'sending') {
      throw serviceError('This exact delivery chunk is already in progress. No duplicate send was attempted.', 409, 'STAGE10_DELIVERY_IN_PROGRESS');
    }
    if (existing?.status === 'failed') {
      throw serviceError('A prior attempt for this exact chunk failed or became ambiguous. Review delivery-status before any retry.', 409, 'STAGE10_DELIVERY_RETRY_REQUIRES_REVIEW');
    }

    const row = {
      guild_id: context.guild.id,
      run_type: 'tb',
      run_id: artifact.id,
      destination_id: destination.id,
      delivery_kind: 'discord_channel',
      recipient_key: 'public',
      chunk_index: chunkIndex,
      idempotency_key: key,
      status: 'sending',
      request_metadata: {
        stage: 10,
        immutable: true,
        versionNumber: Number(artifact.versionNumber || 0),
        planHash: artifact.planHash,
        rotePhase: artifact.rotePhase,
        contentLength: chunk.content.length,
        contentHash: chunk.contentHash,
        mentions: includeMentions,
        mentionUsers: array(chunk.allowedUsers).length,
        audienceFingerprint: includeMentions ? audienceFingerprint : null,
        memberDms: false,
      },
      attempted_at: now().toISOString(),
      updated_at: now().toISOString(),
    };
    try {
      const created = first(await store.insert('guild_operations_delivery_receipts', [row]));
      if (!created?.id) throw new Error('delivery receipt insert returned no durable row');
      return { receipt: created, reused: false };
    } catch (error) {
      existing = await receiptForChunk(key, chunkIndex);
      if (existing?.status === 'delivered') return { receipt: existing, reused: true };
      if (existing?.status === 'sending') {
        throw serviceError('Another request claimed this exact delivery chunk. No duplicate send was attempted.', 409, 'STAGE10_DELIVERY_IN_PROGRESS');
      }
      throw serviceError(`Stage 10 could not durably claim the delivery chunk: ${safe(error?.message, 'receipt write failed')}`, 503, 'STAGE10_DELIVERY_RECEIPT_CLAIM_FAILED');
    }
  }

  async function requestDiscord(channelId, content, config, allowedUsers = [], attempt = 0) {
    if (!config.botToken) throw serviceError('Discord bot token is unavailable for Stage 10 delivery.', 503, 'DISCORD_BOT_TOKEN_MISSING');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const users = [...new Set(array(allowedUsers).map(snowflake).filter(Boolean))].slice(0, 100);
      const response = await fetchImpl(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${config.botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          allowed_mentions: { parse: [], users, replied_user: false },
        }),
        signal: controller.signal,
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (response.status === 429 && attempt < 2) {
        const seconds = Math.max(0.25, Math.min(10, Number(payload?.retry_after || response.headers.get('retry-after') || 1)));
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        return requestDiscord(channelId, content, config, users, attempt + 1);
      }
      if (!response.ok) {
        throw serviceError(`Discord returned HTTP ${response.status}: ${safe(payload?.message, 'channel delivery failed')}`, 502, 'STAGE10_DISCORD_DELIVERY_FAILED');
      }
      return Object.freeze({ status: response.status, payload });
    } catch (error) {
      if (error?.name === 'AbortError') throw serviceError('Discord Stage 10 delivery timed out; receipt is retained for manual review.', 504, 'STAGE10_DISCORD_DELIVERY_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function finalizeDelivered(receipt, result) {
    const updated = first(await store.update('guild_operations_delivery_receipts', { id: `eq.${receipt.id}` }, {
      status: 'delivered',
      external_message_id: text(result?.payload?.id) || null,
      external_channel_id: text(result?.payload?.channel_id) || null,
      http_status: Number(result?.status || 0) || null,
      error_message: null,
      response_metadata: { stage: 10, immutable: true, type: result?.payload?.type, flags: result?.payload?.flags },
      delivered_at: now().toISOString(),
      updated_at: now().toISOString(),
    }));
    if (!updated?.id) {
      throw serviceError('Discord accepted a Stage 10 message but its durable receipt could not be finalized. Delivery is locked for manual reconciliation to prevent duplicates.', 503, 'STAGE10_DELIVERY_RECEIPT_FINALIZE_FAILED');
    }
    return updated;
  }

  async function markFailed(receipt, error) {
    try {
      await store.update('guild_operations_delivery_receipts', { id: `eq.${receipt.id}` }, {
        status: 'failed',
        http_status: Number(error?.status || 0) || null,
        error_message: safe(error?.message, 'delivery failed').slice(0, 1000),
        updated_at: now().toISOString(),
      }, { returning: false });
    } catch {
      // Keep a prior sending claim fail-closed if failure bookkeeping itself is unavailable.
    }
  }

  async function resolvePublishable(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = text(optionValue(interaction, 'phase')).toUpperCase();
    const versionNumber = Number(optionValue(interaction, 'version') || 0);
    if (!/^P[1-6]$/.test(phase) || !Number.isInteger(versionNumber) || versionNumber < 1) {
      throw serviceError('A valid ROTE phase and immutable version number are required.', 400, 'STAGE10_VERSION_REQUIRED');
    }
    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) throw serviceError('No active persisted ROTE plan exists for this Guild.', 404, 'ROTE_PLAN_NOT_FOUND');
    const selected = await resolveVersion(context, plan.id, phase, versionNumber);
    const runId = selected.version.id;
    const approved = await publishability.assertPublishable(context, { runId, planId: plan.id, rotePhase: phase });
    const includeMentions = mentionPolicy(interaction);
    const selectedChannelId = requestedChannel(interaction);
    const verified = await verifiedChannel(context, selectedChannelId);
    return Object.freeze({ context, phase, versionNumber, plan, selected, approved, includeMentions, ...verified });
  }

  async function preview(interaction = {}) {
    const resolved = await resolvePublishable(interaction);
    const artifact = resolved.approved.artifact;
    const rendered = renderApprovedArtifact(artifact, resolved.context.guild.name, resolved.binding, resolved.includeMentions);
    const key = idempotencyKey(artifact, resolved.destination, resolved.includeMentions);
    const receipts = await receiptsFor(key);
    assertAudienceStable(receipts, rendered.coverage.audienceFingerprint, resolved.includeMentions);
    const delivered = receipts.filter((row) => row.status === 'delivered').length;
    const config = stage10DeliveryConfig(env);
    return Object.freeze({
      mode: 'preview',
      context: resolved.context,
      plan: resolved.plan,
      artifact,
      destination: resolved.destination,
      channelId: resolved.channelId,
      chunks: rendered.chunks,
      mentionCoverage: rendered.coverage,
      includeMentions: resolved.includeMentions,
      idempotencyKey: key,
      receipts: Object.freeze(receipts),
      delivered,
      deliveryEnabled: config.enabled,
    });
  }

  async function auditHashRejection(context, artifact, provided) {
    await store.insert('guild_tb_assignment_decisions', [{
      guild_id: context.guild.id,
      run_id: artifact.id,
      decision: 'publishability_rejected',
      actor_user_id: context.userId,
      plan_hash: artifact.planHash,
      reason: 'Stage 10 hash confirmation did not match the approved immutable artifact.',
      metadata: { code: 'STAGE10_HASH_CONFIRMATION_MISMATCH', providedPrefix: text(provided).slice(0, 64) },
    }], { returning: false });
  }

  function validateConfirmation(artifact, inputHash) {
    const confirmation = text(inputHash).toLowerCase();
    if (!/^[0-9a-f]{12,64}$/.test(confirmation)) return false;
    return artifact.planHash.toLowerCase().startsWith(confirmation);
  }

  async function publish(interaction = {}) {
    const action = text(optionValue(interaction, 'action')).toLowerCase();
    if (action !== 'publish') throw serviceError('Stage 10 network delivery requires action:PUBLISH.', 400, 'STAGE10_PUBLISH_ACTION_REQUIRED');
    const confirm = text(optionValue(interaction, 'confirm')).toUpperCase();
    if (confirm !== 'PUBLISH') throw serviceError('Explicit confirm:PUBLISH is required before any Discord assignment post.', 400, 'STAGE10_EXPLICIT_CONFIRMATION_REQUIRED');

    const resolved = await resolvePublishable(interaction);
    const artifact = resolved.approved.artifact;
    const inputHash = text(optionValue(interaction, 'hash'));
    if (!validateConfirmation(artifact, inputHash)) {
      await auditHashRejection(resolved.context, artifact, inputHash);
      throw serviceError('Hash confirmation does not match the selected approved immutable assignment version.', 409, 'STAGE10_HASH_CONFIRMATION_MISMATCH');
    }

    const config = stage10DeliveryConfig(env);
    if (!config.enabled) {
      throw serviceError('Stage 10 channel publishing is disabled by DISCORD_STAGE10_TB_CHANNEL_ENABLED.', 409, 'STAGE10_CHANNEL_DELIVERY_DISABLED');
    }
    if (!config.botToken) throw serviceError('Discord bot token is unavailable for Stage 10 delivery.', 503, 'DISCORD_BOT_TOKEN_MISSING');

    const rendered = renderApprovedArtifact(artifact, resolved.context.guild.name, resolved.binding, resolved.includeMentions);
    const chunks = rendered.chunks;
    const key = idempotencyKey(artifact, resolved.destination, resolved.includeMentions);
    const existingReceipts = await receiptsFor(key);
    assertAudienceStable(existingReceipts, rendered.coverage.audienceFingerprint, resolved.includeMentions);
    const results = [];

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      // Re-check the exact approval/lifecycle immediately before every external Discord request.
      const recheck = await publishability.assertPublishable(resolved.context, {
        runId: artifact.id,
        planId: resolved.plan.id,
        rotePhase: resolved.phase,
      });
      if (!validateConfirmation(recheck.artifact, inputHash)) {
        throw serviceError('The immutable hash changed during Stage 10 delivery. Delivery stopped fail-closed.', 409, 'STAGE10_HASH_CHANGED_DURING_DELIVERY');
      }
      const destinationRecheck = await verifiedChannel(resolved.context, resolved.channelId);
      if (text(destinationRecheck.destination?.id) !== text(resolved.destination?.id)) {
        throw serviceError('The verified Discord destination changed during Stage 10 delivery. Delivery stopped fail-closed.', 409, 'STAGE10_DESTINATION_CHANGED_DURING_DELIVERY');
      }
      const reRendered = renderApprovedArtifact(artifact, resolved.context.guild.name, destinationRecheck.binding, resolved.includeMentions);
      if (resolved.includeMentions && reRendered.coverage.audienceFingerprint !== rendered.coverage.audienceFingerprint) {
        throw serviceError('The Discord member-link registry changed during Stage 10 delivery. Delivery stopped before sending another chunk.', 409, 'STAGE10_MENTION_AUDIENCE_CHANGED');
      }

      const chunk = chunks[chunkIndex];
      const claim = await claimChunk(
        resolved.context,
        artifact,
        resolved.destination,
        key,
        chunkIndex,
        chunk,
        resolved.includeMentions,
        rendered.coverage.audienceFingerprint,
      );
      if (claim.reused) {
        results.push(Object.freeze({ receipt: claim.receipt, reused: true }));
        continue;
      }

      try {
        const response = await requestDiscord(resolved.channelId, chunk.content, config, chunk.allowedUsers);
        const receipt = await finalizeDelivered(claim.receipt, response);
        results.push(Object.freeze({ receipt, reused: false }));
      } catch (error) {
        await markFailed(claim.receipt, error);
        throw error;
      }
    }

    const deliveredAt = now().toISOString();
    const reused = results.filter((row) => row.reused).length;
    await store.insert('guild_operations_audit_log', [{
      guild_id: resolved.context.guild.id,
      actor_user_id: resolved.context.userId,
      action: 'tb-immutable.publish',
      entity_type: 'guild_tb_assignment_run',
      entity_id: artifact.id,
      metadata: {
        stage: 10,
        phase: artifact.rotePhase,
        versionNumber: artifact.versionNumber,
        planHash: artifact.planHash,
        destinationId: resolved.destination.id,
        channelId: resolved.channelId,
        chunks: chunks.length,
        reusedChunks: reused,
        newMessages: chunks.length - reused,
        includeMentions: resolved.includeMentions,
        linkedMentionMembers: rendered.coverage.linkedMembers,
        assignedMembers: rendered.coverage.assignedMembers,
        mentionAudienceFingerprint: rendered.coverage.audienceFingerprint,
        memberDms: false,
        idempotencyKey: key,
      },
      occurred_at: deliveredAt,
    }], { returning: false });

    return Object.freeze({
      mode: 'published',
      context: resolved.context,
      plan: resolved.plan,
      artifact,
      destination: resolved.destination,
      channelId: resolved.channelId,
      includeMentions: resolved.includeMentions,
      mentionCoverage: rendered.coverage,
      idempotencyKey: key,
      chunks: chunks.length,
      reusedChunks: reused,
      newMessages: chunks.length - reused,
      receipts: Object.freeze(results.map((row) => row.receipt)),
      memberDms: 0,
    });
  }

  async function status(interaction = {}) {
    const context = await contextResolver.resolve(interaction);
    const phase = text(optionValue(interaction, 'phase')).toUpperCase();
    const versionNumber = Number(optionValue(interaction, 'version') || 0);
    if (!/^P[1-6]$/.test(phase) || !Number.isInteger(versionNumber) || versionNumber < 1) {
      throw serviceError('A valid ROTE phase and immutable version number are required.', 400, 'STAGE10_VERSION_REQUIRED');
    }
    const plan = await currentPlan(context.guild.id);
    if (!plan?.id) throw serviceError('No active persisted ROTE plan exists for this Guild.', 404, 'ROTE_PLAN_NOT_FOUND');
    const selected = await resolveVersion(context, plan.id, phase, versionNumber);
    const artifact = selected.version;
    const includeMentions = mentionPolicy(interaction);
    const verified = await verifiedChannel(context, requestedChannel(interaction));
    const key = idempotencyKey(artifact, verified.destination, includeMentions);
    const receipts = await receiptsFor(key);
    const coverage = mentionCoverage(artifact.assignments, linkedUsersFromBinding(verified.binding));
    assertAudienceStable(receipts, coverage.audienceFingerprint, includeMentions);
    return Object.freeze({
      mode: 'status',
      context,
      plan,
      artifact,
      verification: selected.verification,
      destination: verified.destination,
      channelId: verified.channelId,
      includeMentions,
      mentionCoverage: coverage,
      idempotencyKey: key,
      receipts: Object.freeze(receipts),
    });
  }

  return Object.freeze({ preview, publish, status });
}

export const tbStage10DiscordDeliveryService = createTbStage10DiscordDeliveryService();
