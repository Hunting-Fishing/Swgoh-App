import { discordStateStore } from './discord-state-store.mjs';
import { createGuildTbPlanVersionService } from './guild-tb-plan-version-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;

function snowflake(value) {
  const normalized = text(value);
  return /^\d{16,22}$/.test(normalized) ? normalized : '';
}

function allyCode(value) {
  const digits = text(value).replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : '';
}

function requireDurableState(stateStore) {
  const status = typeof stateStore?.status === 'function' ? stateStore.status() : null;
  if (!status?.enabled || !status?.durable || typeof stateStore?.readGuild !== 'function') {
    const error = new Error('Durable Discord Guild state is unavailable for immutable ROTE plan approval.');
    error.code = 'DISCORD_STATE_UNAVAILABLE';
    throw error;
  }
}

async function resolveDiscordOfficerPlanContext(interaction = {}, { stateStore, store }) {
  requireDurableState(stateStore);
  const discordGuildId = snowflake(interaction?.guild_id);
  const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
  if (!discordGuildId) throw new Error('A valid Discord Guild is required for ROTE plan approval.');
  if (!actorDiscordUserId) throw new Error('A valid Discord officer identity is required for ROTE plan approval.');

  const guildState = await stateStore.readGuild(discordGuildId);
  const seedAllyCode = allyCode(guildState?.swgohAllyCode);
  if (!seedAllyCode) throw new Error('This Discord server is not bound to a SWGOH Guild. Run /tb setup first.');

  const seed = first(await store.select('players', {
    select: 'id,ally_code,current_guild_id',
    ally_code: `eq.${seedAllyCode}`,
    limit: 1,
  }));
  if (!seed?.current_guild_id) throw new Error('The bound SWGOH Guild is not available in canonical persistence. Run /guild sync.');

  const guild = first(await store.select('guilds', {
    select: 'id,swgoh_guild_id,name,member_count,galactic_power,last_synced_at',
    id: `eq.${seed.current_guild_id}`,
    limit: 1,
  }));
  if (!guild?.id) throw new Error('Canonical Guild identity is unavailable for immutable ROTE plan approval.');

  let userId = '';
  try {
    const identity = first(await store.select('user_social_identities', {
      select: 'user_id,provider,provider_user_id',
      provider: 'eq.discord',
      provider_user_id: `eq.${actorDiscordUserId}`,
      limit: 1,
    }));
    userId = text(identity?.user_id);
  } catch {
    // A Discord officer does not need a linked web account for Stage 9. The
    // immutable record separately persists the Discord snowflake for audit.
    userId = '';
  }

  return Object.freeze({
    guild: Object.freeze({ ...guild }),
    userId,
    actorDiscordUserId,
    discordGuildId,
    seedAllyCode,
    role: 'discord-officer',
  });
}

export function createDiscordTbPlanVersionService(options = {}) {
  const stateStore = options.stateStore || discordStateStore;
  const store = options.store || supabaseCoreStore;
  const versions = options.versionService || createGuildTbPlanVersionService({ store });

  async function context(interaction) {
    return resolveDiscordOfficerPlanContext(interaction, { stateStore, store });
  }

  return Object.freeze({
    async createVersion(interaction, input = {}) {
      return versions.createVersionForContext(await context(interaction), input);
    },
    async listVersions(interaction, input = {}) {
      return versions.listVersionsForContext(await context(interaction), input);
    },
    async getVersion(interaction, runId) {
      return versions.getVersionForContext(await context(interaction), runId);
    },
    async approveVersion(interaction, runId, expectedHash, reason = '') {
      return versions.approveVersionForContext(await context(interaction), runId, expectedHash, reason);
    },
    async cancelVersion(interaction, runId, reason = '') {
      return versions.cancelVersionForContext(await context(interaction), runId, reason);
    },
    async compareVersions(interaction, fromRunId, toRunId) {
      return versions.compareVersionsForContext(await context(interaction), fromRunId, toRunId);
    },
    async assertPublishable(interaction, runId) {
      return versions.assertPublishableForContext(await context(interaction), runId);
    },
  });
}

export const discordTbPlanVersionService = createDiscordTbPlanVersionService();