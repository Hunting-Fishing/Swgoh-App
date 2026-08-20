import { canonicalRosterService } from './canonical-roster-service.mjs';
import { unbindDiscordGuildIntegration } from './discord-guild-unbind-service.mjs';
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
  if (!response.ok) {
    const error = new Error(`Discord API returned HTTP ${response.status}${body?.message ? `: ${safe(body.message)}` : ''}.`);
    error.status = Number(response.status || 0);
    error.discordCode = body?.code;
    throw error;
  }
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
  try {
    const body = await discordJson(`${DISCORD_API}/guilds/${context.discordGuildId}/members?limit=1000`, config, services.fetch || fetch);
    const members = array(body).filter((row) => row?.user);
    const humans = members.filter((row) => row.user.bot !== true);
    return Object.freeze({
      humans: Object.freeze(humans),
      totalScanned: members.length,
      botsSkipped: members.length - humans.length,
    });
  } catch (error) {
    if (Number(error?.status) === 403) {
      throw new Error('Discord denied access to the server member roster. Enable SERVER MEMBERS INTENT for SWGOH Command Center in Discord Developer Portal → Bot → Privileged Gateway Intents, then retry /guild register-mates.');
    }
    throw error;
  }
}

function buildExactMatches(discordMembers, rosterMembers, guildState) {
  const links = guildState?.userLinks && typeof guildState.userLinks === 'object' ? guildState.userLinks : {};
  const alreadyLinkedDiscord = new Set(Object.keys(links));
  const alreadyLinkedAlly = new Set(Object.values(links).map((row) => allyCode(row?.swgohAllyCode)).filter(Boolean));
  const alreadyLinkedPlayer = new Set(Object.values(links).map((row) => text(row?.playerId)).filter(Boolean));
  const currentRoster = array(rosterMembers);
  const currentAlly = new Set(currentRoster.map((row) => allyCode(row?.allyCode)).filter(Boolean));
  const currentPlayer = new Set(currentRoster.map((row) => text(row?.playerId)).filter(Boolean));
  const humanDiscordIds = new Set(array(discordMembers).map((row) => snowflake(row?.user?.id)).filter(Boolean));

  const currentLinkedRoster = currentRoster.filter((member) =>
    alreadyLinkedAlly.has(allyCode(member?.allyCode)) || alreadyLinkedPlayer.has(text(member?.playerId))
  );
  const unlinkedRoster = currentRoster.filter((member) =>
    !alreadyLinkedAlly.has(allyCode(member?.allyCode)) && !alreadyLinkedPlayer.has(text(member?.playerId))
  );
  const staleLinks = Object.entries(links).filter(([, link]) => {
    const code = allyCode(link?.swgohAllyCode);
    const playerId = text(link?.playerId);
    return !(code && currentAlly.has(code)) && !(playerId && currentPlayer.has(playerId));
  });
  const linkedDiscordPresent = [...alreadyLinkedDiscord].filter((id) => humanDiscordIds.has(id)).length;
  const linkedDiscordMissing = Math.max(0, alreadyLinkedDiscord.size - linkedDiscordPresent);
  const availableDiscord = array(discordMembers).filter((row) => {
    const discordUserId = snowflake(row?.user?.id);
    return discordUserId && !alreadyLinkedDiscord.has(discordUserId);
  });

  const index = new Map();
  for (const member of unlinkedRoster) {
    const key = normalizedName(member.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(member);
  }
  const exact = [];
  const ambiguous = [];
  const unmatched = [];
  for (const discordMember of availableDiscord) {
    const discordUserId = snowflake(discordMember?.user?.id);
    if (!discordUserId) continue;
    const candidates = [...new Set([
      normalizedName(discordMember?.nick), normalizedName(discordMember?.user?.global_name), normalizedName(discordMember?.user?.username),
    ].filter(Boolean))].flatMap((key) => index.get(key) || []);
    const unique = [...new Map(candidates.map((member) => [allyCode(member.allyCode), member])).values()];
    const discordName = safe(discordMember?.nick || discordMember?.user?.global_name || discordMember?.user?.username, discordUserId);
    if (unique.length === 1) exact.push({ discordUserId, discordName, member: unique[0] });
    else if (unique.length > 1) ambiguous.push({ discordUserId, discordName, candidates: unique });
    else unmatched.push({ discordUserId, discordName });
  }
  return Object.freeze({
    exact: Object.freeze(exact),
    ambiguous: Object.freeze(ambiguous),
    unmatched: Object.freeze(unmatched),
    unlinkedRoster: Object.freeze(unlinkedRoster),
    staleLinks: Object.freeze(staleLinks),
    inventory: Object.freeze({
      rosterMembers: currentRoster.length,
      linkedSwgohMembers: currentLinkedRoster.length,
      unlinkedSwgohMembers: unlinkedRoster.length,
      durableLinks: alreadyLinkedDiscord.size,
      linkedDiscordPresent,
      linkedDiscordMissing,
      availableDiscordHumans: availableDiscord.length,
      staleLinks: staleLinks.length,
    }),
  });
}

async function registerMatesCommand(interaction, config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const canonical = services.canonical || canonicalRosterService;
  const roster = await canonical.getGuildRosterByPlayer(context.seedAllyCode);
  const discordInventory = await discordGuildMembers(context, config, services);
  const matched = buildExactMatches(discordInventory.humans, array(roster.members), context.guildState);
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

  const projectedLinked = Math.min(matched.inventory.rosterMembers, matched.inventory.linkedSwgohMembers + applied.length);
  const projectedUnlinked = Math.max(0, matched.inventory.rosterMembers - projectedLinked);
  const coverage = matched.inventory.rosterMembers
    ? `${projectedLinked}/${matched.inventory.rosterMembers} (${Math.round((projectedLinked / matched.inventory.rosterMembers) * 100)}%)`
    : '0/0';
  const lines = [
    '**SWGOH Command Center · Guild-Mate Registration**',
    `Mode: **${action === 'apply' ? 'APPLY EXACT MATCHES' : 'PREVIEW'}**`,
    `Guild roster: **${matched.inventory.rosterMembers}** · linked: **${projectedLinked}** · unlinked: **${projectedUnlinked}** · stale links: **${matched.inventory.staleLinks}**`,
    `Discord humans scanned: **${discordInventory.humans.length}** · already linked here: **${matched.inventory.linkedDiscordPresent}** · available to match: **${matched.inventory.availableDiscordHumans}** · bots skipped: **${discordInventory.botsSkipped}**`,
    `Exact suggestions: **${matched.exact.length}** · ambiguous: **${matched.ambiguous.length}** · unmatched Discord: **${matched.unmatched.length}** · applied: **${applied.length}**`,
    `Guild mention-link coverage: **${coverage}**`,
    '',
  ];
  for (const row of matched.exact.slice(0,8)) lines.push(`✅ **${safe(row.discordName)}** → **${safe(row.member.name)}** · ${displayAlly(row.member.allyCode)}`);
  for (const row of matched.ambiguous.slice(0,4)) lines.push(`⚠️ **${safe(row.discordName)}** → ${row.candidates.map((member) => `${safe(member.name)} ${displayAlly(member.allyCode)}`).join(' / ')}`);

  if (!matched.exact.length && !matched.ambiguous.length) {
    if (!matched.inventory.availableDiscordHumans && projectedUnlinked > 0) {
      lines.push(`No unlinked Discord humans are currently available to auto-match. **${projectedUnlinked} SWGOH Guild members remain unlinked.**`);
      lines.push('Use `/tb link member:<Discord user> ally_code:<Ally Code>` for explicit officer pairing as those Discord members are available.');
    } else if (matched.inventory.availableDiscordHumans > 0) {
      lines.push('No new exact-name matches were found among the currently unlinked Discord humans.');
    } else if (!projectedUnlinked) {
      lines.push('✅ All current SWGOH Guild members are linked to Discord.');
    }
  }

  if (matched.unlinkedRoster.length) {
    lines.push('', '**SWGOH members still unlinked**');
    for (const member of matched.unlinkedRoster.slice(0,6)) lines.push(`• **${safe(member.name)}** · ${displayAlly(member.allyCode)}`);
    if (matched.unlinkedRoster.length > 6) lines.push(`• +${matched.unlinkedRoster.length - 6} more`);
  }
  if (matched.inventory.linkedDiscordMissing) {
    lines.push('', `⚠️ Durable Discord links not present in the current human member scan: **${matched.inventory.linkedDiscordMissing}**.`);
  }
  if (matched.staleLinks.length) {
    lines.push(`⚠️ Durable links whose SWGOH player is no longer in the current Guild roster: **${matched.staleLinks.length}**.`);
  }
  lines.push('', '_Preview never mutates. APPLY links only one-to-one exact normalized matches. Fuzzy and ambiguous matches are never auto-linked._');
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

async function donationReportCommand(interaction, _config, services) {
  const context = await resolveContext(interaction.guild_id, services);
  const canonical = services.canonical || canonicalRosterService;
  const roster = await canonical.getGuildRosterByPlayer(context.seedAllyCode);
  const stored = await context.store.select('guild_unit_donation_preferences', {
    select: 'player_id,base_id,preference,source,updated_at',
    guild_id: `eq.${context.guild.id}`,
    order: 'player_id.asc,base_id.asc',
    limit: 500,
  });
  const byPersistent = new Map(array(roster.members).map((member) => [text(member.persistentId), member]));
  const byAlly = new Map(array(roster.members).map((member) => [allyCode(member.allyCode), member]).filter(([code]) => code));
  const rows = new Map();
  for (const pref of array(stored)) {
    const member = byPersistent.get(text(pref.player_id));
    const baseId = text(pref.base_id).toUpperCase();
    const preference = text(pref.preference).toLowerCase();
    if (!member || !baseId || !['give','keep'].includes(preference)) continue;
    rows.set(`${allyCode(member.allyCode)}|${baseId}`, { member, baseId, preference });
  }
  for (const pref of Object.values(context.guildState?.memberPreferences && typeof context.guildState.memberPreferences === 'object' ? context.guildState.memberPreferences : {})) {
    const member = byAlly.get(allyCode(pref?.swgohAllyCode));
    const baseId = text(pref?.baseId).toUpperCase();
    const preference = text(pref?.preference).toLowerCase();
    if (!member || !baseId || !['give','keep'].includes(preference)) continue;
    const key = `${allyCode(member.allyCode)}|${baseId}`;
    if (!rows.has(key)) rows.set(key, { member, baseId, preference });
  }
  const grouped = new Map();
  for (const row of rows.values()) {
    const code = allyCode(row.member.allyCode);
    if (!grouped.has(code)) grouped.set(code, { member: row.member, give: 0, keep: 0, units: [] });
    const group = grouped.get(code);
    group[row.preference] += 1;
    group.units.push(row);
  }
  const groups = [...grouped.values()].sort((a,b) => (b.give + b.keep) - (a.give + a.keep) || safe(a.member.name).localeCompare(safe(b.member.name)));
  const totalGive = groups.reduce((sum, row) => sum + row.give, 0);
  const totalKeep = groups.reduce((sum, row) => sum + row.keep, 0);
  const lines = [
    `**SWGOH Command Center · ${safe(roster?.guild?.name || context.guild.name)} Donation Preferences**`,
    `Members with preferences: **${groups.length}** · GIVE: **${totalGive}** · KEEP: **${totalKeep}** · Unit overrides: **${rows.size}**`,
    '',
  ];
  if (!groups.length) lines.push('No explicit GIVE/KEEP preferences are currently stored.');
  for (const group of groups.slice(0,18)) {
    lines.push(`• **${safe(group.member.name)}** · ${displayAlly(group.member.allyCode)} · GIVE **${group.give}** · KEEP **${group.keep}**`);
  }
  if (groups.length > 18) lines.push(`• +${groups.length - 18} more members in Command Center`);
  lines.push('', '_Report merges canonical Command Center preferences with durable Discord preferences; duplicate member/unit overrides are counted once._');
  return truncate(lines.join('\n'));
}

async function unregisterGuildCommand(interaction, _config, services) {
  if (text(option(interaction, 'confirm')).toUpperCase() !== 'UNREGISTER') {
    throw new Error('Guild unregister requires the explicit UNREGISTER confirmation choice.');
  }
  const context = await resolveContext(interaction.guild_id, services);
  const actorDiscordUserId = snowflake(interaction?.member?.user?.id || interaction?.user?.id);
  const result = await unbindDiscordGuildIntegration(context, {
    store: context.store,
    stateStore: context.stateStore,
    reservationStore: services.reservationStore,
    actorDiscordUserId,
  });
  return truncate([
    `**SWGOH Command Center · ${safe(result.guildName)} Discord Integration Unregistered**`,
    `Verified destinations disabled: **${number(result.disabledDestinations)}**`,
    `Scheduled Operations paused: **${number(result.pausedSchedules)}**`,
    `Discord player links cleared: **${number(result.clearedDiscordLinks)}**`,
    `Discord hard reserves cleared: **${number(result.clearedHardReservations)}**`,
    '',
    '**Preserved:** canonical Guild Intelligence/history, saved TB/TW plans and assignment runs, delivery receipts, and Operations audit history.',
    'This Discord server is now fail-closed and cannot use the pilot Guild fallback. Run `/tb setup` to bind a Guild again.',
  ].join('\n'));
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
  if (subcommand === 'donation-report') return donationReportCommand(interaction, config, services);
  if (subcommand === 'unregister') return unregisterGuildCommand(interaction, config, services);
  if (subcommand === 'sync') return syncCommand(interaction, config, services);
  if (subcommand === 'platoon-report') return platoonReportCommand(interaction, config, services);
  throw new Error(`Unknown /guild subcommand: ${subcommand}`);
}