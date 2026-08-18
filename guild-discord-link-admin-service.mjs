import { discordStateStore } from './discord-state-store.mjs';
import { guildOperationsDiscordConfig, guildOperationsDiscordDelivery } from './guild-operations-discord-delivery.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const DISCORD_API = 'https://discord.com/api/v10';
const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function snowflake(value, label = 'Discord user ID') {
  const id = text(value);
  if (!/^\d{16,22}$/.test(id)) throw httpError(`${label} is invalid.`, 400, 'INVALID_DISCORD_ID');
  return id;
}
function allyCode(value) {
  const code = text(value).replace(/\D/g, '');
  if (!/^\d{9}$/.test(code)) throw httpError('A valid 9-digit SWGOH Ally Code is required.', 400, 'INVALID_ALLY_CODE');
  return code;
}
function normalizeAlly(value) {
  const code = text(value).replace(/\D/g, '');
  return /^\d{9}$/.test(code) ? code : '';
}
function displayName(member = {}) {
  return text(member?.nick || member?.user?.global_name || member?.user?.username || member?.user?.id);
}
function safeLink(link = {}, player = null, discordMember = null, discordChecked = false) {
  const currentGuildMember = Boolean(player?.id);
  const discordMemberPresent = discordChecked ? Boolean(discordMember?.user?.id) : null;
  const reasons = [];
  if (!currentGuildMember) reasons.push('SWGOH player is no longer a current Guild member');
  if (discordChecked && !discordMemberPresent) reasons.push('Discord user is no longer in the bound server');
  return Object.freeze({
    discordUserId: text(link.discordUserId),
    discordDisplayName: discordMember ? displayName(discordMember) : '',
    swgohAllyCode: normalizeAlly(link.swgohAllyCode),
    playerId: text(link.playerId),
    playerName: text(player?.name),
    currentGuildMember,
    discordMemberPresent,
    stale: !currentGuildMember || discordMemberPresent === false,
    staleReasons: Object.freeze(reasons),
    linkedAt: text(link.linkedAt),
    updatedAt: text(link.updatedAt),
  });
}

export function createGuildDiscordLinkAdminService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const operations = options.operations || guildOperationsService;
  const delivery = options.delivery || guildOperationsDiscordDelivery;
  const stateStore = options.stateStore || discordStateStore;
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  function requireDurableState() {
    const status = typeof stateStore?.status === 'function' ? stateStore.status() : {};
    if (!status?.enabled || !status?.durable || typeof stateStore?.readGuild !== 'function') {
      throw httpError('Durable Discord Guild state is unavailable.', 503, 'DISCORD_STATE_NOT_DURABLE');
    }
    return status;
  }

  async function binding(context) {
    requireDurableState();
    const resolved = typeof delivery?.resolveBinding === 'function'
      ? await delivery.resolveBinding(context.guild.id)
      : null;
    if (!resolved?.discordGuildId) {
      throw httpError('This Command Center Guild is not durably bound to a Discord server. Run /tb setup first.', 409, 'DISCORD_GUILD_NOT_BOUND');
    }
    return resolved;
  }

  async function discord(path) {
    const config = guildOperationsDiscordConfig(env);
    if (!config.botToken) throw httpError('Discord bot token is not configured on the server.', 503, 'DISCORD_BOT_NOT_CONFIGURED');
    const response = await fetchImpl(`${DISCORD_API}${path}`, {
      headers: {
        Authorization: `Bot ${config.botToken}`,
        Accept: 'application/json',
        'User-Agent': 'SWGOH-Command-Center (manual-link-admin)',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (!response.ok) {
      if (response.status === 404) throw httpError('That Discord user is not in the bound Discord server.', 404, 'DISCORD_MEMBER_NOT_FOUND');
      throw httpError(`Discord API returned HTTP ${response.status}.`, 502, 'DISCORD_API_FAILED');
    }
    return body;
  }

  async function discordMembers(discordGuildId) {
    const config = guildOperationsDiscordConfig(env);
    if (!config.botToken) return { checked: false, members: [] };
    const result = [];
    let after = '';
    for (let page = 0; page < 10; page += 1) {
      const query = new URLSearchParams({ limit: '1000' });
      if (after) query.set('after', after);
      const batch = array(await discord(`/guilds/${discordGuildId}/members?${query}`));
      result.push(...batch.filter((row) => row?.user?.bot !== true));
      if (batch.length < 1000) break;
      after = text(batch[batch.length - 1]?.user?.id);
      if (!after) break;
    }
    return { checked: true, members: result };
  }

  async function currentPlayers(context) {
    return array(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
      current_guild_id: `eq.${context.guild.id}`,
      order: 'name.asc',
      limit: 100,
    }));
  }

  function playerMaps(players) {
    const byAlly = new Map();
    const bySwgohId = new Map();
    for (const player of players) {
      const code = normalizeAlly(player.ally_code);
      const swgohId = text(player.swgoh_player_id);
      if (code) byAlly.set(code, player);
      if (swgohId) bySwgohId.set(swgohId, player);
    }
    return { byAlly, bySwgohId };
  }

  async function list(userId, lookupAllyCode) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const bound = await binding(context);
    const guildState = await stateStore.readGuild(bound.discordGuildId);
    const [players, discordResult] = await Promise.all([
      currentPlayers(context),
      discordMembers(bound.discordGuildId).catch(() => ({ checked: false, members: [] })),
    ]);
    const maps = playerMaps(players);
    const discordMap = new Map(array(discordResult.members).map((row) => [text(row?.user?.id), row]).filter(([id]) => id));
    const links = Object.values(object(guildState?.userLinks)).map((link) => {
      const code = normalizeAlly(link?.swgohAllyCode);
      const player = maps.byAlly.get(code) || maps.bySwgohId.get(text(link?.playerId)) || null;
      const discordMember = discordMap.get(text(link?.discordUserId)) || null;
      return safeLink(link, player, discordMember, discordResult.checked === true);
    }).sort((a, b) => Number(b.stale) - Number(a.stale) || a.playerName.localeCompare(b.playerName) || a.discordUserId.localeCompare(b.discordUserId));

    const linkedCurrentPlayerIds = new Set(links.filter((row) => row.currentGuildMember).map((row) => row.swgohAllyCode));
    const stale = links.filter((row) => row.stale);
    const discordMissing = links.filter((row) => row.discordMemberPresent === false);
    const swgohMissing = links.filter((row) => row.currentGuildMember === false);
    return Object.freeze({
      source: 'durable-discord-manual-link-admin-v1',
      discordGuildId: text(bound.discordGuildId),
      discordMembershipChecked: discordResult.checked === true,
      total: links.length,
      current: links.length - stale.length,
      stale: stale.length,
      discordMissing: discordMissing.length,
      swgohMissing: swgohMissing.length,
      unlinkedCurrentMembers: Math.max(0, players.length - linkedCurrentPlayerIds.size),
      links: Object.freeze(links),
    });
  }

  async function currentGuildPlayer(context, code) {
    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
      ally_code: `eq.${code}`,
      current_guild_id: `eq.${context.guild.id}`,
      limit: 1,
    }));
    if (!player?.id) throw httpError('That Ally Code is not a current member of this SWGOH Guild.', 409, 'PLAYER_NOT_CURRENT_GUILD_MEMBER');
    const membership = first(await store.select('guild_members_current', {
      select: 'player_id',
      guild_id: `eq.${context.guild.id}`,
      player_id: `eq.${player.id}`,
      limit: 1,
    }));
    if (!membership) throw httpError('That Ally Code is not present in the canonical current Guild membership.', 409, 'PLAYER_NOT_CURRENT_GUILD_MEMBER');
    return player;
  }

  async function audit(context, action, discordUserId, beforeState, afterState) {
    await store.insert('guild_operations_audit_log', [{
      guild_id: context.guild.id,
      actor_user_id: context.userId,
      action,
      entity_type: 'discord_player_link',
      entity_id: discordUserId,
      before_state: beforeState,
      after_state: afterState,
      metadata: { source: 'command-center-web-manual-link-admin' },
      occurred_at: now().toISOString(),
    }], { returning: false });
  }

  async function link(userId, lookupAllyCode, input = {}) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const bound = await binding(context);
    const discordUserId = snowflake(input.discordUserId);
    const code = allyCode(input.swgohAllyCode);
    const player = await currentGuildPlayer(context, code);
    const member = await discord(`/guilds/${bound.discordGuildId}/members/${discordUserId}`);
    if (text(member?.user?.id) !== discordUserId || member?.user?.bot === true) {
      throw httpError('That Discord account is not an eligible human member of the bound server.', 409, 'DISCORD_MEMBER_NOT_ELIGIBLE');
    }
    const guildState = await stateStore.readGuild(bound.discordGuildId);
    const before = guildState?.userLinks?.[discordUserId] || null;
    const stored = await stateStore.linkPlayer({
      discordGuildId: bound.discordGuildId,
      discordUserId,
      swgohAllyCode: code,
      playerId: text(player.swgoh_player_id) || code,
      actorDiscordUserId: '',
    });
    const result = safeLink(stored, player, member, true);
    await audit(context, 'discord-player-link.manual', discordUserId, before, result);
    return result;
  }

  async function unlink(userId, lookupAllyCode, input = {}) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const bound = await binding(context);
    const discordUserId = snowflake(input.discordUserId);
    const guildState = await stateStore.readGuild(bound.discordGuildId);
    const before = guildState?.userLinks?.[discordUserId] || null;
    if (!before) throw httpError('That Discord user does not have a durable SWGOH player link in this server.', 404, 'PLAYER_LINK_NOT_FOUND');
    const removed = await stateStore.unlinkPlayer({
      discordGuildId: bound.discordGuildId,
      discordUserId,
      actorDiscordUserId: '',
    });
    await audit(context, 'discord-player-link.manual-unlink', discordUserId, before, null);
    return Object.freeze({
      removed: true,
      discordUserId,
      swgohAllyCode: normalizeAlly(removed?.swgohAllyCode),
      playerId: text(removed?.playerId),
    });
  }

  return Object.freeze({ list, link, unlink });
}

export const guildDiscordLinkAdminService = createGuildDiscordLinkAdminService();
