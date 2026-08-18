import { createHash } from 'node:crypto';
import { discordStateStore } from './discord-state-store.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_CONTENT = 1850;
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';
const allyCode = (value) => { const digits = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(digits) ? digits : ''; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1','true','yes','on'].includes(String(value).trim().toLowerCase());
}

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sha(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function safeLine(value, fallback = '') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function splitLines(lines, max = MAX_CONTENT) {
  const chunks = [];
  let current = '';
  for (const raw of lines) {
    const line = String(raw ?? '');
    if (line.length > max) {
      if (current) { chunks.push(current); current = ''; }
      for (let offset = 0; offset < line.length; offset += max) chunks.push(line.slice(offset, offset + max));
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > max) {
      if (current) chunks.push(current);
      current = line;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['SWGOH Command Center assignment update.'];
}

function memberKey(row = {}) {
  return text(row?.member?.playerId || row?.member?.allyCode || row?.member?.name);
}

function memberAllyCode(row = {}) {
  return allyCode(row?.member?.allyCode);
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
  return { byPlayerId, byAllyCode };
}

function discordUserForAssignment(row, links) {
  const playerId = text(row?.member?.playerId);
  const code = memberAllyCode(row);
  return (playerId && links.byPlayerId.get(playerId)) || (code && links.byAllyCode.get(code)) || '';
}

function mentionOrName(row, links, includeMentions) {
  const userId = discordUserForAssignment(row, links);
  if (includeMentions && userId) return `<@${userId}>`;
  return `**${safeLine(row?.member?.name, memberAllyCode(row) || 'member')}**`;
}

function tbPublicLines(run, binding, options = {}) {
  const links = linkedUsersFromBinding(binding);
  const rows = array(run?.assignments).slice().sort((a,b) =>
    safeLine(a.phase).localeCompare(safeLine(b.phase)) || safeLine(a.squadId || a.conflictId).localeCompare(safeLine(b.squadId || b.conflictId)) || safeLine(a.name || a.baseId).localeCompare(safeLine(b.name || b.baseId))
  );
  const lines = [
    '**SWGOH Command Center · ROTE Operation Assignments**',
    `Preview fingerprint: \`${safeLine(run?.input_fingerprint).slice(0,16)}\``,
    `Assigned: **${rows.length}** · Unfilled: **${array(run?.unfilled).length}**`,
    '',
  ];
  let previousPhase = '';
  for (const row of rows) {
    const phase = safeLine(row.phase, '?');
    if (phase !== previousPhase) {
      if (previousPhase) lines.push('');
      lines.push(`**${phase}**`);
      previousPhase = phase;
    }
    const safety = row?.safety?.help ? ' ⚠️ HELP' : row?.safety?.preference === 'give' ? ' ✅ GIVE' : row?.locked ? ' 🔒' : '';
    lines.push(`• ${safeLine(row.squadId || row.conflictId, 'Operation')} · **${safeLine(row.name || row.baseId, 'unit')}** → ${mentionOrName(row, links, options.includeMentions)}${safety}`);
  }
  if (array(run?.unfilled).length) {
    lines.push('', '**Unfilled / officer attention**');
    for (const row of array(run.unfilled).slice(0,20)) lines.push(`• ${safeLine(row.phase,'?')} · ${safeLine(row.squadId || row.conflictId,'Operation')} · **${safeLine(row.name || row.baseId,'unit')}**`);
    if (array(run.unfilled).length > 20) lines.push(`• +${array(run.unfilled).length - 20} more unfilled slots in Command Center`);
  }
  lines.push('', '_Generated from a persisted, mission-safe officer preview. Re-run preview after any Guild roster or plan change._');
  return lines;
}

function twPublicLines(run, binding, options = {}) {
  const links = linkedUsersFromBinding(binding);
  const rows = array(run?.assignments).slice().sort((a,b) => Number(a.priority||99)-Number(b.priority||99) || safeLine(a.zoneName).localeCompare(safeLine(b.zoneName)) || safeLine(a.teamName).localeCompare(safeLine(b.teamName)));
  const lines = [
    '**SWGOH Command Center · Territory War Defense Assignments**',
    `Preview fingerprint: \`${safeLine(run?.input_fingerprint).slice(0,16)}\``,
    `Assigned teams: **${rows.length}** · Unfilled: **${array(run?.unfilled).length}**`,
    '',
  ];
  let previousZone = '';
  for (const row of rows) {
    const zone = `P${Number(row.priority||1)} · ${safeLine(row.zoneName,'Territory')}`;
    if (zone !== previousZone) {
      if (previousZone) lines.push('');
      lines.push(`**${zone}**`);
      previousZone = zone;
    }
    lines.push(`• **${safeLine(row.teamName,'Defense team')}** → ${mentionOrName(row, links, options.includeMentions)}`);
  }
  if (array(run?.unfilled).length) {
    lines.push('', '**Unfilled / officer attention**');
    for (const row of array(run.unfilled).slice(0,20)) lines.push(`• P${Number(row.priority||1)} · ${safeLine(row.zoneName,'Territory')} · **${safeLine(row.teamName,'team')}**`);
  }
  lines.push('', '_Generated from the saved TW defense strategy. A member never reuses the same unit across assigned defense teams._');
  return lines;
}

function memberDmLines(runType, rows, run) {
  const name = safeLine(rows[0]?.member?.name, 'Guild member');
  const lines = [
    `**SWGOH Command Center · ${runType === 'tb' ? 'Your ROTE Assignments' : 'Your TW Defense Assignments'}**`,
    `Player: **${name}**`,
    `Preview fingerprint: \`${safeLine(run?.input_fingerprint).slice(0,16)}\``,
    '',
  ];
  if (runType === 'tb') {
    for (const row of rows) lines.push(`• ${safeLine(row.phase,'?')} · ${safeLine(row.squadId || row.conflictId,'Operation')} · **${safeLine(row.name || row.baseId,'unit')}**${row?.safety?.help?' · ⚠️ HELP':''}`);
  } else {
    for (const row of rows) lines.push(`• P${Number(row.priority||1)} · ${safeLine(row.zoneName,'Territory')} · **${safeLine(row.teamName,'Defense team')}**`);
  }
  lines.push('', '_Officer assignment from SWGOH Command Center._');
  return lines;
}

export function guildOperationsDiscordConfig(env = process.env) {
  return Object.freeze({
    deliveryEnabled: boolEnv(env.DISCORD_TB_DELIVERY_ENABLED, false),
    botToken: text(env.DISCORD_BOT_TOKEN),
    webhookUrl: text(env.DISCORD_TB_WEBHOOK_URL),
    requestTimeoutMs: Math.max(5000, Math.min(30000, Number(env.DISCORD_DELIVERY_TIMEOUT_MS || 15000))),
    maxRetries: Math.max(0, Math.min(4, Number(env.DISCORD_DELIVERY_MAX_RETRIES || 2))),
    previewMaxAgeMs: Math.max(60_000, Math.min(24*60*60*1000, Number(env.GUILD_OPERATIONS_PREVIEW_MAX_AGE_MS || 30*60*1000))),
  });
}

export function createGuildOperationsDiscordDelivery(options = {}) {
  const store = options.store || supabaseCoreStore;
  const stateStore = options.stateStore || discordStateStore;
  const fetchImpl = options.fetch || fetch;
  const env = options.env || process.env;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  async function selectOne(table, query) {
    const rows = await store.select(table, { ...query, limit: 1 });
    return array(rows)[0] || null;
  }

  async function resolveBinding(guildId) {
    if (!stateStore?.status?.()?.enabled || typeof stateStore.readState !== 'function') return null;
    const state = await stateStore.readState();
    for (const [discordGuildIdRaw, guildState] of Object.entries(object(state?.guilds))) {
      const discordGuildId = snowflake(discordGuildIdRaw);
      const seed = allyCode(guildState?.swgohAllyCode);
      if (!discordGuildId || !seed) continue;
      const player = await selectOne('players', { select: 'id,current_guild_id,ally_code', ally_code: `eq.${seed}` });
      if (text(player?.current_guild_id) !== text(guildId)) continue;
      return Object.freeze({ discordGuildId, guildState });
    }
    return null;
  }

  async function syncVerifiedDestinations(guildId) {
    const binding = await resolveBinding(guildId);
    if (!binding) return { binding: null, destinations: [] };
    const rows = [];
    const channelId = snowflake(binding.guildState?.commandChannelId);
    if (channelId) {
      rows.push({
        guild_id: guildId,
        destination_kind: 'channel',
        external_id: channelId,
        display_name: safeLine(binding.guildState?.commandChannelName, 'Discord TB Command Channel'),
        verified: true,
        secret_ref: null,
        metadata: { discordGuildId: binding.discordGuildId, verification: 'durable-discord-tb-setup', live: true },
        updated_at: now().toISOString(),
      });
    }
    const config = guildOperationsDiscordConfig(env);
    if (config.webhookUrl) {
      rows.push({
        guild_id: guildId,
        destination_kind: 'webhook',
        external_id: 'server-webhook-default',
        display_name: 'Command Center Server Webhook',
        verified: true,
        secret_ref: 'env:DISCORD_TB_WEBHOOK_URL',
        metadata: { discordGuildId: binding.discordGuildId, verification: 'server-secret-and-guild-binding', live: true },
        updated_at: now().toISOString(),
      });
    }
    const destinations = [];
    for (const row of rows) {
      const result = await store.upsert('guild_discord_destinations', [row], { onConflict: 'guild_id,destination_kind,external_id' });
      if (array(result)[0]) destinations.push(array(result)[0]);
    }
    return { binding, destinations };
  }

  async function requestDiscord(path, body, config, attempt = 0) {
    if (!config.botToken) throw httpError('Discord bot token is not configured for delivery.', 503, 'DISCORD_BOT_TOKEN_MISSING');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetchImpl(`${DISCORD_API}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bot ${config.botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (response.status === 429 && attempt < config.maxRetries) {
        const seconds = Math.max(0.25, Math.min(10, Number(payload?.retry_after || response.headers.get('retry-after') || 1)));
        await sleep(seconds * 1000);
        return requestDiscord(path, body, config, attempt + 1);
      }
      if (!response.ok) throw httpError(`Discord API returned HTTP ${response.status}: ${safeLine(payload?.message,'delivery failed')}`, 502, 'DISCORD_DELIVERY_FAILED');
      return { status: response.status, payload };
    } catch (error) {
      if (error?.name === 'AbortError') throw httpError('Discord delivery timed out.', 504, 'DISCORD_DELIVERY_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestWebhook(url, body, config, attempt = 0) {
    const target = new URL(url);
    target.searchParams.set('wait','true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetchImpl(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (response.status === 429 && attempt < config.maxRetries) {
        const seconds = Math.max(0.25, Math.min(10, Number(payload?.retry_after || response.headers.get('retry-after') || 1)));
        await sleep(seconds * 1000);
        return requestWebhook(url, body, config, attempt + 1);
      }
      if (!response.ok) throw httpError(`Discord webhook returned HTTP ${response.status}: ${safeLine(payload?.message,'delivery failed')}`, 502, 'DISCORD_WEBHOOK_FAILED');
      return { status: response.status, payload };
    } catch (error) {
      if (error?.name === 'AbortError') throw httpError('Discord webhook delivery timed out.', 504, 'DISCORD_WEBHOOK_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function receiptDelivered(idempotencyKey, deliveryKind, recipientKey, chunkIndex) {
    return selectOne('guild_operations_delivery_receipts', {
      select: '*',
      idempotency_key: `eq.${idempotencyKey}`,
      delivery_kind: `eq.${deliveryKind}`,
      recipient_key: `eq.${recipientKey}`,
      chunk_index: `eq.${chunkIndex}`,
      status: 'eq.delivered',
    });
  }

  async function deliverChunk({ context, runType, runId, destination, kind, recipientKey, chunkIndex, idempotencyKey, content, allowedUsers = [], send }) {
    const existing = await receiptDelivered(idempotencyKey, kind, recipientKey, chunkIndex);
    if (existing) return { receipt: existing, reused: true };
    const base = {
      guild_id: context.guild.id,
      run_type: runType,
      run_id: runId,
      destination_id: destination?.id || null,
      delivery_kind: kind,
      recipient_key: recipientKey,
      chunk_index: chunkIndex,
      idempotency_key: idempotencyKey,
      status: 'sending',
      request_metadata: { contentLength: content.length, allowedUsers: allowedUsers.length },
      attempted_at: now().toISOString(),
      updated_at: now().toISOString(),
    };
    const created = array(await store.upsert('guild_operations_delivery_receipts', [base], { onConflict: 'idempotency_key,delivery_kind,recipient_key,chunk_index' }))[0];
    try {
      const result = await send();
      const updated = array(await store.update('guild_operations_delivery_receipts', { id: `eq.${created.id}` }, {
        status: 'delivered',
        external_message_id: text(result?.payload?.id) || null,
        external_channel_id: text(result?.payload?.channel_id) || null,
        http_status: Number(result?.status || 0) || null,
        error_message: null,
        response_metadata: { type: result?.payload?.type, flags: result?.payload?.flags },
        delivered_at: now().toISOString(),
        updated_at: now().toISOString(),
      }))[0];
      return { receipt: updated || created, reused: false };
    } catch (error) {
      await store.update('guild_operations_delivery_receipts', { id: `eq.${created.id}` }, {
        status: 'failed',
        http_status: Number(error?.status || 0) || null,
        error_message: safeLine(error?.message,'delivery failed').slice(0,1000),
        updated_at: now().toISOString(),
      }, { returning: false });
      throw error;
    }
  }

  async function loadRun(context, runType, runId) {
    const table = runType === 'tb' ? 'guild_tb_assignment_runs' : 'guild_tw_defense_runs';
    const run = await selectOne(table, { select: '*', id: `eq.${runId}`, guild_id: `eq.${context.guild.id}` });
    if (!run) throw httpError('Assignment preview run was not found in this Guild.', 404, 'ASSIGNMENT_RUN_NOT_FOUND');
    const publishReady = runType === 'tb' ? run?.diagnostics?.parity?.publishReady === true : run?.diagnostics?.publishReady === true;
    if (!publishReady) throw httpError('This preview is not publish-ready. Resolve shortages, invalid requirements, or lock conflicts and preview again.', 409, 'PREVIEW_NOT_PUBLISH_READY');
    if (!text(run.input_fingerprint)) throw httpError('Preview fingerprint is missing. Generate a new preview.', 409, 'PREVIEW_FINGERPRINT_MISSING');
    const age = now().getTime() - Date.parse(run.created_at || 0);
    const config = guildOperationsDiscordConfig(env);
    if (!Number.isFinite(age) || age < 0 || age > config.previewMaxAgeMs) throw httpError('This preview is stale. Generate a fresh preview before publishing.', 409, 'PREVIEW_STALE');
    if (run.source_guild_synced_at && context.guild.last_synced_at && Date.parse(context.guild.last_synced_at) > Date.parse(run.source_guild_synced_at) + 1000) {
      throw httpError('The Guild roster changed after this preview. Generate a fresh preview before publishing.', 409, 'GUILD_CHANGED_AFTER_PREVIEW');
    }
    return { table, run };
  }

  async function publish(context, input = {}) {
    const runType = text(input.runType).toLowerCase();
    const runId = text(input.runId);
    if (!['tb','tw'].includes(runType) || !/^[0-9a-f-]{36}$/i.test(runId)) throw httpError('A valid TB/TW preview run is required.', 400, 'INVALID_ASSIGNMENT_RUN');
    const config = guildOperationsDiscordConfig(env);
    if (!config.deliveryEnabled) throw httpError('Discord assignment publishing is disabled by the server safety gate.', 409, 'DISCORD_DELIVERY_DISABLED');
    const { table, run } = await loadRun(context, runType, runId);
    const { binding } = await syncVerifiedDestinations(context.guild.id);
    if (!binding) throw httpError('No verified Discord ↔ SWGOH Guild binding exists. Run signed /tb setup in Discord first.', 409, 'DISCORD_GUILD_NOT_VERIFIED');

    const destinationId = text(input.destinationId);
    const destination = destinationId ? await selectOne('guild_discord_destinations', {
      select: '*', id: `eq.${destinationId}`, guild_id: `eq.${context.guild.id}`, verified: 'eq.true',
    }) : null;
    if (!destination) throw httpError('Choose a verified Guild Discord destination.', 409, 'VERIFIED_DESTINATION_REQUIRED');
    const destinationDiscordGuildId = snowflake(destination?.metadata?.discordGuildId);
    if (!destinationDiscordGuildId || destinationDiscordGuildId !== binding.discordGuildId) throw httpError('Destination does not match the verified Discord Guild binding.', 409, 'DESTINATION_GUILD_MISMATCH');

    const includeMentions = input.includeMentions === true;
    const sendDms = input.sendDms === true;
    const baseIdempotency = sha(`${runType}|${runId}|${run.input_fingerprint}|${destination.id}|${includeMentions}|${sendDms}`);
    const publicLines = runType === 'tb' ? tbPublicLines(run,binding,{includeMentions}) : twPublicLines(run,binding,{includeMentions});
    const chunks = splitLines(publicLines);
    const links = linkedUsersFromBinding(binding);
    const publicReceipts = [];

    for (let i=0;i<chunks.length;i+=1) {
      const content = chunks[i];
      const mentioned = includeMentions ? [...new Set(array(run.assignments).map((row)=>discordUserForAssignment(row,links)).filter(Boolean))].slice(0,100) : [];
      const body = { content, allowed_mentions: includeMentions ? { users: mentioned, parse: [] } : { parse: [] } };
      if (destination.destination_kind === 'channel') {
        const channelId = snowflake(destination.external_id);
        if (!channelId || channelId !== snowflake(binding.guildState?.commandChannelId)) throw httpError('Verified channel no longer matches the signed Guild command channel.',409,'VERIFIED_CHANNEL_CHANGED');
        publicReceipts.push(await deliverChunk({ context,runType,runId,destination,kind:'discord_channel',recipientKey:'public',chunkIndex:i,idempotencyKey:baseIdempotency,content,allowedUsers:mentioned,send:()=>requestDiscord(`/channels/${channelId}/messages`,body,config) }));
      } else if (destination.destination_kind === 'webhook') {
        if (destination.secret_ref !== 'env:DISCORD_TB_WEBHOOK_URL' || !config.webhookUrl) throw httpError('Server webhook secret is unavailable.',503,'WEBHOOK_SECRET_UNAVAILABLE');
        publicReceipts.push(await deliverChunk({ context,runType,runId,destination,kind:'webhook',recipientKey:'public',chunkIndex:i,idempotencyKey:baseIdempotency,content,allowedUsers:mentioned,send:()=>requestWebhook(config.webhookUrl,body,config) }));
      } else throw httpError('Unsupported verified destination type.',400,'INVALID_DESTINATION_KIND');
    }

    const dmReceipts = [];
    const dmFailures = [];
    if (sendDms) {
      const groups = new Map();
      for (const row of array(run.assignments)) {
        const key = memberKey(row);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key,[]);
        groups.get(key).push(row);
      }
      let ordinal = 0;
      for (const rows of groups.values()) {
        const discordUserId = discordUserForAssignment(rows[0],links);
        if (!discordUserId) continue;
        ordinal += 1;
        try {
          const dm = await requestDiscord('/users/@me/channels',{recipient_id:discordUserId},config);
          const channelId = snowflake(dm?.payload?.id);
          if (!channelId) throw httpError('Discord did not return a DM channel.',502,'DISCORD_DM_CHANNEL_FAILED');
          const dmChunks = splitLines(memberDmLines(runType,rows,run));
          for (let i=0;i<dmChunks.length;i+=1) {
            const content = dmChunks[i];
            dmReceipts.push(await deliverChunk({ context,runType,runId,destination,kind:'dm',recipientKey:discordUserId,chunkIndex:i,idempotencyKey:baseIdempotency,content,allowedUsers:[],send:()=>requestDiscord(`/channels/${channelId}/messages`,{content,allowed_mentions:{parse:[]}},config) }));
          }
        } catch (error) {
          dmFailures.push({ discordUserId, error: safeLine(error?.message,'DM delivery failed') });
        }
      }
    }

    const deliveredAt = now().toISOString();
    const delivery = {
      mode: destination.destination_kind === 'channel' ? 'discord_channel' : 'webhook',
      destinationId: destination.id,
      includeMentions,
      sendDms,
      publicMessages: publicReceipts.length,
      memberDms: dmReceipts.length,
      dmFailures: dmFailures.length,
      published: true,
      publishedAt: deliveredAt,
      idempotencyKey: baseIdempotency,
    };
    await store.update(table,{id:`eq.${runId}`,guild_id:`eq.${context.guild.id}`},{status:'published',published_at:deliveredAt,delivery},{returning:false});
    await store.insert('guild_operations_audit_log',[{
      guild_id: context.guild.id,
      actor_user_id: context.userId,
      action: `${runType}-run.publish`,
      entity_type: runType === 'tb' ? 'guild_tb_assignment_run' : 'guild_tw_defense_run',
      entity_id: runId,
      metadata: { ...delivery, dmFailureRecipients: dmFailures.map((row)=>row.discordUserId) },
      occurred_at: deliveredAt,
    }],{returning:false});

    return Object.freeze({ runType,runId,status:'published',delivery,dmFailures:Object.freeze(dmFailures) });
  }

  return Object.freeze({
    config: () => guildOperationsDiscordConfig(env),
    resolveBinding,
    syncVerifiedDestinations,
    publish,
  });
}

export const guildOperationsDiscordDelivery = createGuildOperationsDiscordDelivery();
