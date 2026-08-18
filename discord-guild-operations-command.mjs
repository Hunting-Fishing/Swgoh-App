import { canonicalRosterService } from './canonical-roster-service.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { createDiscordTbLiveServices } from './discord-tb-live.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const MAX_CONTENT = 1900;
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';
const allyCode = (value) => { const v = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(v) ? v : ''; };

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}
function truncate(value) {
  const source = String(value || '');
  if (source.length <= MAX_CONTENT) return source;
  return `${source.slice(0, MAX_CONTENT - 70)}\n…more details are available in Command Center.`;
}
function number(value) { return new Intl.NumberFormat('en-US').format(Number(value || 0)); }
function displayAlly(value) {
  const code = allyCode(value);
  return code ? `${code.slice(0,3)}-${code.slice(3,6)}-${code.slice(6)}` : 'unknown';
}
function normalizedName(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function activeSubcommand(interaction = {}) {
  return array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2) || null;
}
function option(interaction, name) {
  return array(activeSubcommand(interaction)?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}
function commandName(interaction) { return text(interaction?.data?.name).toLowerCase(); }
export function guildCommandSubcommand(interaction) { return text(activeSubcommand(interaction)?.name || 'status').toLowerCase(); }

async function discordJson(url, config, fetchImpl = fetch) {
  if (!config?.botToken) throw new Error('Discord bot token is not configured on the server.');
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bot ${config.botToken}`, Accept: 'application/json', 'User-Agent': 'SWGOH-Command-Center (guild-operations-command)' },
    signal: AbortSignal.timeout(15_000),
  });
  const bodyText = await response.text();
  let body = null;
  try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`Discord API returned HTTP ${response.status}${body?.message ? `: ${safe(body.message)}` : ''}.`);
  return body;
}

async function resolveContext(discordGuildIdInput, services = {}) {
  const stateStore = services.stateStore || discordStateStore;
  const store = services.store || supabaseCoreStore;
  const discordGuildId = snowflake(discordGuildIdInput);
  if (!discordGuildId) throw new Error('This command must be run inside a Discord server.');
  const status = stateStore.status?.();
  if (!status?.enabled || !status?.durable) throw new Error('Durable Discord Guild state is unavailable. Complete server storage setup first.');
  const guildState = await stateStore.readGuild(discordGuildId);
  const seedAllyCode = allyCode(guildState?.swgohAllyCode);
  if (!seedAllyCode) throw new Error('This Discord server is not bound to a SWGOH Guild yet. Run /tb setup first.');
  const player = first(await store.select('players', { select: 'id,ally_code,current_guild_id', ally_code: `eq.${seedAllyCode}`, limit: 1 }));
  if (!player?.current_guild_id) throw new Error('The bound SWGOH Guild is not available in canonical persistence yet. Run /guild sync.');
  const guild = first(await store.select('guilds', { select: 'id,swgoh_guild_id,name,member_count,galactic_power,last_synced_at', id: `eq.${player.current_guild_id}`, limit: 1 }));
  if (!guild?.id) throw new Error('Canonical Guild identity is unavailable.');
  return { stateStore, store, discordGuildId, guildState, seedAllyCode, guild, seedPlayer: player };
}

async function statusCommand(interaction, config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const canonical = services.canonical || canonicalRosterService;
  const roster = await canonical.getGuildRosterByPlayer(context.seedAllyCode);
  const [destinations, controls] = await Promise.all([
    context.store.select('guild_discord_destinations', { select: 'id,destination_kind,external_id,display_name,verified,updated_at', guild_id: `eq.${context.guild.id}`, order: 'display_name.asc', limit: 100 }),
    context.store.select('guild_member_operation_controls', { select: 'player_id,available,ignored_until,ignore_reason,updated_at', guild_id: `eq.${context.guild.id}`, limit: 100 }),
  ]);
  const links = Object.values(context.guildState?.userLinks && typeof context.guildState.userLinks === 'object' ? context.guildState.userLinks : {});
  const linkedAllyCodes = new Set(links.map((row) => allyCode(row?.swgohAllyCode)).filter(Boolean));
  const linkedByPlayer = new Map(links.map((row) => [text(row?.playerId), row]).filter(([id]) => id));
  const controlByPersistentId = new Map(array(controls).map((row) => [text(row.player_id), row]));
  const now = Date.now();
  const ignored = array(roster.members).filter((member) => {
    const control = controlByPersistentId.get(text(member.persistentId));
    const until = Date.parse(control?.ignored_until || '');
    return control?.available === false || (Number.isFinite(until) && until > now);
  });
  const unregistered = array(roster.members).filter((member) => !linkedAllyCodes.has(allyCode(member.allyCode)) && !linkedByPlayer.has(text(member.playerId)));
  const verifiedChannels = array(destinations).filter((row) => row.destination_kind === 'channel' && row.verified === true);
  const lines = [
    `**SWGOH Command Center · ${safe(roster?.guild?.name || context.guild.name)} Guild Status**`,
    `Guild GP: **${number(roster?.guild?.galacticPower)}** · Members: **${number(roster?.members?.length)}** · Canonical sync: **${safe(roster?.fetchedAt, 'unknown')}**`,
    `Discord links: **${links.length}** · Unregistered: **${unregistered.length}** · Ignored now: **${ignored.length}**`,
    `Verified channels: **${verifiedChannels.length}**${verifiedChannels.length ? ` · ${verifiedChannels.slice(0,6).map((row) => `<#${row.external_id}>`).join(' ')}` : ''}`,
    '',
  ];
  if (ignored.length) {
    lines.push('**Ignored / unavailable**');
    for (const member of ignored.slice(0,8)) {
      const control = controlByPersistentId.get(text(member.persistentId));
      const until = control?.ignored_until ? new Date(control.ignored_until).toLocaleDateString('en-US', { timeZone: 'UTC' }) : 'until cleared';
      lines.push(`• **${safe(member.name)}** · ${displayAlly(member.allyCode)} · ${safe(until)}`);
    }
    if (ignored.length > 8) lines.push(`• +${ignored.length - 8} more`);
    lines.push('');
  }
  if (unregistered.length) {
    lines.push('**Unregistered Discord links**');
    for (const member of unregistered.slice(0,10)) lines.push(`• **${safe(member.name)}** · ${displayAlly(member.allyCode)}`);
    if (unregistered.length > 10) lines.push(`• +${unregistered.length - 10} more`);
  } else lines.push('**Registration:** all current Guild members are linked to Discord.');
  lines.push('', '_Read-only status. Mentions are suppressed._');
  return truncate(lines.join('\n'));
}

async function verifyChannelCommand(interaction, config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const requested = snowflake(option(interaction, 'channel'));
  const channelId = requested || snowflake(interaction.channel_id);
  if (!channelId) throw new Error('Choose a Discord channel or run /guild verify-channel inside the desired channel.');
  const channel = await discordJson(`${DISCORD_API}/channels/${channelId}`, config, services.fetch || fetch);
  if (snowflake(channel?.guild_id) !== context.discordGuildId) throw new Error('That Discord channel does not belong to this bound server.');
  if (![0,5,15].includes(Number(channel?.type))) throw new Error('That Discord channel type is not supported for assignment delivery.');
  const row = first(await context.store.upsert('guild_discord_destinations', [{
    guild_id: context.guild.id,
    destination_kind: 'channel',
    external_id: channelId,
    display_name: safe(channel?.name, `Discord channel ${channelId}`),
    verified: true,
    secret_ref: null,
    metadata: { discordGuildId: context.discordGuildId, verification: 'signed-discord-command-plus-channel-api', verifiedByDiscordUserId: snowflake(interaction?.member?.user?.id) },
    updated_at: new Date().toISOString(),
  }], { onConflict: 'guild_id,destination_kind,external_id' }));
  return truncate(`**SWGOH Command Center · Channel Verified**\n<#${channelId}> is now a verified assignment destination for **${safe(context.guild.name)}**.\nVerification used the signed Discord interaction plus Discord channel ownership API.\nDestination ID: \`${safe(row?.id)}\``);
}

async function unverifyChannelCommand(interaction, _config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const requested = snowflake(option(interaction, 'channel'));
  const channelId = requested || snowflake(interaction.channel_id);
  if (!channelId) throw new Error('Choose a Discord channel or run /guild unverify-channel inside the channel.');
  const matches = await context.store.select('guild_discord_destinations', {
    select: 'id,display_name,verified', guild_id: `eq.${context.guild.id}`, destination_kind: 'eq.channel', external_id: `eq.${channelId}`, limit: 1,
  });
  const row = first(matches);
  if (!row?.id) throw new Error('That channel is not registered as a Guild assignment destination.');
  await context.store.update('guild_discord_destinations', { id: `eq.${row.id}`, guild_id: `eq.${context.guild.id}` }, {
    verified: false,
    metadata: { unverifiedByDiscordUserId: snowflake(interaction?.member?.user?.id), unverifiedAt: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }, { returning: false });
  return `**SWGOH Command Center · Channel Unverified**\n<#${channelId}> will no longer be offered for assignment delivery. Historical delivery receipts are retained.`;
}

async function discordGuildMembers(context, config, services) {
  const body = await discordJson(`${DISCORD_API}/guilds/${context.discordGuildId}/members?limit=1000`, config, services.fetch || fetch);
  return array(body).filter((row) => row?.user && row.user.bot !== true);
}

function buildExactMatches(discordMembers, rosterMembers, guildState) {
  const alreadyLinkedDiscord = new Set(Object.keys(guildState?.userLinks || {}));
  const alreadyLinkedAlly = new Set(Object.values(guildState?.userLinks || {}).map((row) => allyCode(row?.swgohAllyCode)).filter(Boolean));
  const index = new Map();
  for (const member of rosterMembers) {
    if (alreadyLinkedAlly.has(allyCode(member.allyCode))) continue;
    const key = normalizedName(member.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(member);
  }
  const exact = [];
  const ambiguous = [];
  const unmatched = [];
  for (const discordMember of discordMembers) {
    const discordUserId = snowflake(discordMember?.user?.id);
    if (!discordUserId || alreadyLinkedDiscord.has(discordUserId)) continue;
    const candidates = [...new Set([
      normalizedName(discordMember?.nick), normalizedName(discordMember?.user?.global_name), normalizedName(discordMember?.user?.username),
    ].filter(Boolean))].flatMap((key) => index.get(key) || []);
    const unique = [...new Map(candidates.map((member) => [allyCode(member.allyCode), member])).values()];
    const discordName = safe(discordMember?.nick || discordMember?.user?.global_name || discordMember?.user?.username, discordUserId);
    if (unique.length === 1) exact.push({ discordUserId, discordName, member: unique[0] });
    else if (unique.length > 1) ambiguous.push({ discordUserId, discordName, candidates: unique });
    else unmatched.push({ discordUserId, discordName });
  }
  return { exact, ambiguous, unmatched };
}

async function registerMatesCommand(interaction, config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const canonical = services.canonical || canonicalRosterService;
  const roster = await canonical.getGuildRosterByPlayer(context.seedAllyCode);
  const discordMembers = await discordGuildMembers(context, config, services);
  const matched = buildExactMatches(discordMembers, array(roster.members), context.guildState);
  const action = text(option(interaction, 'action') || 'preview').toLowerCase();
  const applied = [];
  if (action === 'apply') {
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    for (const row of matched.exact) {
      const link = await context.stateStore.linkPlayer({
        discordGuildId: context.discordGuildId,
        discordUserId: row.discordUserId,
        swgohAllyCode: allyCode(row.member.allyCode),
        playerId: text(row.member.playerId),
        actorDiscordUserId,
      });
      applied.push(link);
    }
  }
  const lines = [
    '**SWGOH Command Center · Guild-Mate Registration**',
    `Mode: **${action === 'apply' ? 'APPLY EXACT MATCHES' : 'PREVIEW'}**`,
    `Exact unique: **${matched.exact.length}** · Ambiguous: **${matched.ambiguous.length}** · Unmatched Discord: **${matched.unmatched.length}** · Applied: **${applied.length}**`,
    '',
  ];
  for (const row of matched.exact.slice(0,8)) lines.push(`✅ **${safe(row.discordName)}** → **${safe(row.member.name)}** · ${displayAlly(row.member.allyCode)}`);
  for (const row of matched.ambiguous.slice(0,4)) lines.push(`⚠️ **${safe(row.discordName)}** → ${row.candidates.map((member) => `${safe(member.name)} ${displayAlly(member.allyCode)}`).join(' / ')}`);
  if (!matched.exact.length && !matched.ambiguous.length) lines.push('No new exact-name matches were found.');
  lines.push('', '_Only one exact normalized name match is eligible. Fuzzy and ambiguous matches are never auto-linked._');
  return truncate(lines.join('\n'));
}

async function ignoreCommand(interaction, _config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const canonical = services.canonical || canonicalRosterService;
  const roster = await canonical.getGuildRosterByPlayer(context.seedAllyCode);
  const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
  const targetDiscordUserId = snowflake(option(interaction, 'member')) || actorDiscordUserId;
  const days = Math.max(0, Math.min(365, Math.trunc(Number(option(interaction, 'days') ?? 0))));
  const reason = safe(option(interaction, 'reason'), '').slice(0, 500);
  const link = context.guildState?.userLinks?.[targetDiscordUserId];
  if (!link) throw new Error('That Discord member must be linked to a current SWGOH Guild member first.');
  const code = allyCode(link.swgohAllyCode);
  const member = array(roster.members).find((row) => allyCode(row.allyCode) === code);
  if (!member?.persistentId) throw new Error('The linked player is not present in the current canonical Guild roster.');
  const ignoredUntil = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  await context.store.upsert('guild_member_operation_controls', [{
    guild_id: context.guild.id,
    player_id: member.persistentId,
    available: true,
    ignored_until: ignoredUntil,
    ignore_reason: days > 0 ? (reason || 'Discord timed ignore') : null,
    source: 'discord-guild-command',
    updated_by_user_id: null,
    metadata: { actorDiscordUserId, targetDiscordUserId },
    updated_at: new Date().toISOString(),
  }], { onConflict: 'guild_id,player_id', returning: false });
  return days > 0
    ? `**SWGOH Command Center · Timed Ignore Set**\n**${safe(member.name)}** · ${displayAlly(member.allyCode)} is excluded from Operations assignments for **${days} day${days === 1 ? '' : 's'}**${reason ? ` · ${reason}` : ''}.\nExpiry: **${new Date(ignoredUntil).toUTCString()}**.`
    : `**SWGOH Command Center · Ignore Cleared**\n**${safe(member.name)}** · ${displayAlly(member.allyCode)} is eligible for Operations assignments again.`;
}

async function syncCommand(interaction, config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const live = services.live || createDiscordTbLiveServices(services.env || process.env, { stateStore: context.stateStore, ...(services.fetch ? { fetch: services.fetch } : {}) });
  const result = await live.syncGuild({ allyCode: context.seedAllyCode, interaction });
  const guild = result?.guild?.guild || result?.guild || {};
  return `**SWGOH Command Center · Guild Sync Complete**\nGuild: **${safe(guild.name || context.guild.name)}** · Members: **${number(result?.guild?.members?.length || guild.memberCount)}**\nSource: **${safe(result?.cache)}** · binding: **${safe(result?.guildBindingSource)}**\nUse /guild status to inspect registration and verified-channel state.`;
}

async function platoonReportCommand(interaction, config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const live = services.live || createDiscordTbLiveServices(services.env || process.env, { stateStore: context.stateStore, ...(services.fetch ? { fetch: services.fetch } : {}) });
  const result = await live.buildPlan({ allyCode: context.seedAllyCode, redundancyTarget: config.redundancyTarget, interaction });
  const assignments = array(result?.plan?.assignments);
  const unfilled = array(result?.plan?.unfilled);
  const protectedCount = Number(result?.safety?.summary?.protectedUnits || result?.safety?.protections?.length || 0);
  const lines = [
    `**SWGOH Command Center · ${safe(result?.guild?.guild?.name || result?.guild?.name || context.guild.name)} Platoon Report**`,
    `Assignments: **${assignments.length}** · Unfilled: **${unfilled.length}** · Protected units: **${protectedCount}**`,
    `Planner controls: **${Number(result?.planningControls?.preferenceCount || 0)} preferences** · **${Number(result?.planningControls?.unavailableMemberCount || 0)} unavailable** · **${Number(result?.planningControls?.hardReservationCount || 0)} hard reserves**`,
    '',
  ];
  if (unfilled.length) {
    lines.push('**Officer attention — unfilled requirements**');
    for (const row of unfilled.slice(0,12)) lines.push(`• ${safe(row.phase, '?')} · **${safe(row.name || row.baseId, 'unit')}** · ${safe(row.squadId || row.conflictId, 'Operation')}`);
    if (unfilled.length > 12) lines.push(`• +${unfilled.length - 12} more`);
  } else lines.push('✅ All currently scoped Operation requirements have legal donor assignments.');
  lines.push('', '_Mission protections and hard reserves remain authoritative._');
  return truncate(lines.join('\n'));
}

export async function executeDiscordGuildCommand(interaction, config, services = {}) {
  if (commandName(interaction) !== 'guild') throw new Error('Unsupported Discord Guild command.');
  const subcommand = guildCommandSubcommand(interaction);
  if (subcommand === 'status') return statusCommand(interaction, config, services);
  if (subcommand === 'verify-channel') return verifyChannelCommand(interaction, config, services);
  if (subcommand === 'unverify-channel') return unverifyChannelCommand(interaction, config, services);
  if (subcommand === 'register-mates') return registerMatesCommand(interaction, config, services);
  if (subcommand === 'ignore') return ignoreCommand(interaction, config, services);
  if (subcommand === 'sync') return syncCommand(interaction, config, services);
  if (subcommand === 'platoon-report') return platoonReportCommand(interaction, config, services);
  throw new Error(`Unknown /guild subcommand: ${subcommand}`);
}
