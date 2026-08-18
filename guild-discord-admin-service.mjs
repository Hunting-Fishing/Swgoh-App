import { canonicalRosterService } from './canonical-roster-service.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { guildOperationsDiscordConfig, guildOperationsDiscordDelivery } from './guild-operations-discord-delivery.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const first = (value) => array(value)[0] || null;
const snowflake = (value, label = 'Discord ID') => {
  const id = text(value);
  if (!/^\d{16,22}$/.test(id)) {
    const error = new Error(`${label} is invalid.`); error.status = 400; error.code = 'INVALID_DISCORD_ID'; throw error;
  }
  return id;
};
function httpError(message, status, code) { const error = new Error(message); error.status = status; error.code = code; return error; }
function normName(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function safeDestination(row) {
  return Object.freeze({
    id: text(row?.id), kind: text(row?.destination_kind), externalId: text(row?.external_id), displayName: text(row?.display_name),
    verified: row?.verified === true, metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}, updatedAt: text(row?.updated_at),
  });
}

export function createGuildDiscordAdminService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const operations = options.operations || guildOperationsService;
  const delivery = options.delivery || guildOperationsDiscordDelivery;
  const stateStore = options.stateStore || discordStateStore;
  const canonical = options.canonical || canonicalRosterService;
  const fetchImpl = options.fetch || fetch;
  const env = options.env || process.env;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  function config() { return guildOperationsDiscordConfig(env); }
  async function binding(context) {
    const resolved = await delivery.resolveBinding(context.guild.id);
    if (!resolved?.discordGuildId) throw httpError('This Command Center Guild is not durably bound to a Discord server. Run /tb setup first.', 409, 'DISCORD_GUILD_NOT_BOUND');
    return resolved;
  }
  async function discord(path) {
    const cfg = config();
    if (!cfg.botToken) throw httpError('Discord bot token is not configured on the server.', 503, 'DISCORD_BOT_NOT_CONFIGURED');
    const response = await fetchImpl(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${cfg.botToken}`, Accept: 'application/json', 'User-Agent': 'SWGOH-Command-Center (discord-admin)' },
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    const raw = await response.text();
    let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    if (!response.ok) throw httpError(`Discord API returned HTTP ${response.status}.`, response.status === 404 ? 404 : 502, 'DISCORD_API_FAILED');
    return body;
  }
  async function listDestinations(guildId) {
    return array(await store.select('guild_discord_destinations', {
      select: 'id,destination_kind,external_id,display_name,verified,metadata,updated_at', guild_id: `eq.${guildId}`, order: 'display_name.asc', limit: 100,
    })).map(safeDestination);
  }

  async function status(userId, allyCode) {
    const context = await operations.requireOfficer(userId, allyCode);
    const bound = await binding(context).catch(() => null);
    const guildState = bound && stateStore.status?.().enabled ? await stateStore.readGuild(bound.discordGuildId).catch(() => null) : null;
    const destinations = await listDestinations(context.guild.id);
    const currentMembers = await store.select('guild_members_current', { select: 'player_id', guild_id: `eq.${context.guild.id}`, limit: 100 });
    const linked = Object.values(guildState?.userLinks || {});
    return Object.freeze({
      source: 'verified-discord-guild-admin',
      discordGuildId: text(bound?.discordGuildId),
      bound: Boolean(bound),
      commandChannelId: text(guildState?.commandChannelId),
      officerRoleIds: Object.freeze(array(guildState?.officerRoleIds)),
      destinations: Object.freeze(destinations),
      memberCount: array(currentMembers).length,
      linkedMemberCount: linked.length,
      unlinkedMemberCount: Math.max(0, array(currentMembers).length - linked.length),
      botConfigured: Boolean(config().botToken),
    });
  }

  async function verifyChannel(userId, allyCode, channelIdInput) {
    const context = await operations.requireOfficer(userId, allyCode);
    const bound = await binding(context);
    const channelId = snowflake(channelIdInput, 'Discord channel ID');
    const channel = await discord(`/channels/${channelId}`);
    if (text(channel?.guild_id) !== text(bound.discordGuildId)) throw httpError('That Discord channel is not inside the Guild-bound Discord server.', 409, 'CHANNEL_GUILD_MISMATCH');
    if (![0,5,15].includes(Number(channel?.type))) throw httpError('Only Discord text, announcement, or forum channels can be verified for assignment delivery.', 409, 'UNSUPPORTED_CHANNEL_TYPE');
    const row = first(await store.upsert('guild_discord_destinations', [{
      guild_id: context.guild.id,
      destination_kind: 'channel',
      external_id: channelId,
      display_name: text(channel?.name) || `Discord channel ${channelId}`,
      verified: true,
      secret_ref: null,
      metadata: { discordGuildId: bound.discordGuildId, verification: 'discord-api-channel-ownership', channelType: Number(channel?.type), verifiedByUserId: userId },
      updated_at: now().toISOString(),
    }], { onConflict: 'guild_id,destination_kind,external_id' }));
    return safeDestination(row);
  }

  async function unverifyChannel(userId, allyCode, destinationIdInput) {
    const context = await operations.requireOfficer(userId, allyCode);
    const destinationId = text(destinationIdInput);
    const row = first(await store.select('guild_discord_destinations', { select: '*', id: `eq.${destinationId}`, guild_id: `eq.${context.guild.id}`, destination_kind: 'eq.channel', limit: 1 }));
    if (!row) throw httpError('Verified Discord destination was not found in this Guild.', 404, 'DESTINATION_NOT_FOUND');
    const updated = first(await store.update('guild_discord_destinations', { id: `eq.${destinationId}`, guild_id: `eq.${context.guild.id}` }, {
      verified: false,
      metadata: { ...(row.metadata || {}), unverifiedByUserId: userId, unverifiedAt: now().toISOString() },
      updated_at: now().toISOString(),
    }));
    return safeDestination(updated);
  }

  async function discordMembers(discordGuildId) {
    const all = [];
    let after = '';
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ limit: '1000' });
      if (after) query.set('after', after);
      const batch = array(await discord(`/guilds/${discordGuildId}/members?${query}`));
      all.push(...batch);
      if (batch.length < 1000) break;
      after = text(batch[batch.length - 1]?.user?.id);
      if (!after) break;
    }
    return all;
  }

  async function matchGuildmates(userId, allyCode, { apply = false } = {}) {
    const context = await operations.requireOfficer(userId, allyCode);
    const bound = await binding(context);
    const [guildBody, members] = await Promise.all([
      canonical.getGuildRosterByPlayer(allyCode), discordMembers(bound.discordGuildId),
    ]);
    const roster = array(guildBody?.members);
    const byName = new Map();
    for (const member of roster) {
      const key = normName(member?.name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(member);
    }
    const existingState = await stateStore.readGuild(bound.discordGuildId);
    const alreadyLinkedDiscord = new Set(Object.keys(existingState?.userLinks || {}));
    const alreadyLinkedAllies = new Set(Object.values(existingState?.userLinks || {}).map((row) => text(row?.swgohAllyCode)).filter(Boolean));
    const exact = [];
    const ambiguous = [];
    const unmatched = [];
    for (const discordMember of members) {
      const discordUserId = text(discordMember?.user?.id);
      if (!discordUserId || discordMember?.user?.bot || alreadyLinkedDiscord.has(discordUserId)) continue;
      const names = [...new Set([discordMember?.nick, discordMember?.user?.global_name, discordMember?.user?.username].map(normName).filter(Boolean))];
      const matches = [...new Map(names.flatMap((name) => array(byName.get(name))).map((member) => [text(member?.allyCode), member])).values()]
        .filter((member) => !alreadyLinkedAllies.has(text(member?.allyCode)));
      if (matches.length === 1) exact.push({ discordUserId, discordName: text(discordMember?.nick || discordMember?.user?.global_name || discordMember?.user?.username), member: matches[0] });
      else if (matches.length > 1) ambiguous.push({ discordUserId, discordName: text(discordMember?.nick || discordMember?.user?.username), candidates: matches.map((m) => ({ name: text(m.name), allyCode: text(m.allyCode) })) });
      else unmatched.push({ discordUserId, discordName: text(discordMember?.nick || discordMember?.user?.global_name || discordMember?.user?.username) });
    }
    const applied = [];
    if (apply) {
      for (const row of exact) {
        const code = text(row.member?.allyCode).replace(/\D/g, '');
        const playerId = text(row.member?.playerId || row.member?.id);
        if (!/^\d{9}$/.test(code)) continue;
        await stateStore.linkPlayer({ discordGuildId: bound.discordGuildId, discordUserId: row.discordUserId, swgohAllyCode: code, playerId, actorDiscordUserId: '' });
        applied.push({ discordUserId: row.discordUserId, discordName: row.discordName, playerName: text(row.member?.name), allyCode: code });
      }
    }
    return Object.freeze({
      source: 'exact-normalized-discord-roster-match',
      apply,
      exact: Object.freeze(exact.map((row) => ({ discordUserId: row.discordUserId, discordName: row.discordName, playerName: text(row.member?.name), allyCode: text(row.member?.allyCode) }))),
      ambiguous: Object.freeze(ambiguous),
      unmatchedCount: unmatched.length,
      applied: Object.freeze(applied),
      safety: 'Only unambiguous exact normalized name matches are eligible for automatic linking. Fuzzy matches are never auto-linked.',
    });
  }

  return Object.freeze({ status, verifyChannel, unverifyChannel, matchGuildmates });
}

export const guildDiscordAdminService = createGuildDiscordAdminService();
