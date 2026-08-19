import { discordStateStore } from './discord-state-store.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const first = (value) => array(value)[0] || null;

function snowflake(value) {
  const candidate = text(value);
  return /^\d{16,22}$/.test(candidate) ? candidate : '';
}

function allyCode(value) {
  const candidate = text(value).replace(/\D/g, '');
  return /^\d{9}$/.test(candidate) ? candidate : '';
}

function contextError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function createDiscordStage9OfficerContextResolver(options = {}) {
  const stateStore = options.stateStore || discordStateStore;
  const store = options.store || supabaseCoreStore;

  async function resolve(interaction = {}) {
    const discordGuildId = snowflake(interaction?.guild_id);
    const discordUserId = snowflake(interaction?.member?.user?.id || interaction?.user?.id);
    if (!discordGuildId) throw contextError('Stage 9 plan commands must be run inside the bound Discord server.', 400, 'DISCORD_GUILD_REQUIRED');
    if (!discordUserId) throw contextError('Discord actor identity is unavailable.', 401, 'DISCORD_ACTOR_REQUIRED');

    const stateStatus = typeof stateStore?.status === 'function' ? stateStore.status() : null;
    if (!stateStatus?.enabled || !stateStatus?.durable || typeof stateStore?.readGuild !== 'function') {
      throw contextError('Durable Discord Guild binding is unavailable.', 503, 'DISCORD_GUILD_STATE_UNAVAILABLE');
    }

    const guildState = await stateStore.readGuild(discordGuildId);
    const seedAllyCode = allyCode(guildState?.swgohAllyCode);
    if (!seedAllyCode) throw contextError('This Discord server is not bound to a SWGOH Guild. Run /tb setup first.', 409, 'DISCORD_GUILD_NOT_BOUND');

    const socialIdentity = first(await store.select('user_social_identities', {
      select: 'user_id,provider,provider_user_id,display_name,last_seen_at',
      provider: 'eq.discord',
      provider_user_id: `eq.${discordUserId}`,
      limit: 1,
    }));
    const userId = text(socialIdentity?.user_id);
    if (!userId) {
      throw contextError(
        'Your Discord account is not linked to a signed-in SWGOH Command Center account. Sign in with Discord in Command Center before approving or cancelling immutable plans.',
        403,
        'COMMAND_CENTER_DISCORD_IDENTITY_REQUIRED',
      );
    }

    const seedPlayer = first(await store.select('players', {
      select: 'id,ally_code,current_guild_id',
      ally_code: `eq.${seedAllyCode}`,
      limit: 1,
    }));
    const guildId = text(seedPlayer?.current_guild_id);
    if (!guildId) throw contextError('The bound SWGOH Guild is not available in canonical persistence.', 409, 'BOUND_GUILD_NOT_PERSISTED');

    const guild = first(await store.select('guilds', {
      select: 'id,swgoh_guild_id,name,member_count,galactic_power,last_synced_at',
      id: `eq.${guildId}`,
      limit: 1,
    }));
    if (!guild?.id) throw contextError('Canonical Guild identity is unavailable.', 409, 'CANONICAL_GUILD_NOT_FOUND');

    const membership = first(await store.select('guild_user_memberships', {
      select: 'guild_id,user_id,player_id,role,status,joined_at,updated_at',
      guild_id: `eq.${guildId}`,
      user_id: `eq.${userId}`,
      status: 'eq.active',
      limit: 1,
    }));
    const role = text(membership?.role).toLowerCase();
    if (!membership || !['owner', 'officer'].includes(role)) {
      throw contextError(
        'Your linked Command Center account is not an active Guild owner/officer for this bound SWGOH Guild.',
        403,
        'COMMAND_CENTER_OFFICER_REQUIRED',
      );
    }

    return Object.freeze({
      guild: Object.freeze({
        id: text(guild.id),
        swgohGuildId: text(guild.swgoh_guild_id),
        name: text(guild.name),
        memberCount: Number(guild.member_count || 0),
        galacticPower: Number(guild.galactic_power || 0),
        lastSyncedAt: text(guild.last_synced_at),
      }),
      userId,
      role,
      membership: Object.freeze({ ...membership }),
      discordGuildId,
      discordUserId,
      discordDisplayName: text(socialIdentity?.display_name),
      seedAllyCode,
    });
  }

  return Object.freeze({ resolve });
}

export const discordStage9OfficerContext = createDiscordStage9OfficerContextResolver();
