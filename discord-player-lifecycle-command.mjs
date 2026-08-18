import { discordStateStore } from './discord-state-store.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';
const allyCode = (value) => { const v = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(v) ? v : ''; };
const SELF_SOURCE = 'discord-player-self-service';

function safe(value, fallback = '—') {
  return text(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}
function displayAlly(value) {
  const code = allyCode(value);
  return code ? `${code.slice(0,3)}-${code.slice(3,6)}-${code.slice(6)}` : 'unknown';
}
function activeSubcommand(interaction = {}) {
  return array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2) || null;
}
function option(interaction, name) {
  return array(activeSubcommand(interaction)?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}
export function playerLifecycleSubcommand(interaction = {}) {
  if (text(interaction?.data?.name).toLowerCase() !== 'tb') return '';
  const sub = text(activeSubcommand(interaction)?.name).toLowerCase();
  return ['ignore','unregister'].includes(sub) ? sub : '';
}

async function resolveSelf(interaction, services = {}, { requireBoundGuild = true } = {}) {
  const stateStore = services.stateStore || discordStateStore;
  const store = services.store || supabaseCoreStore;
  const discordGuildId = snowflake(interaction?.guild_id);
  const discordUserId = snowflake(interaction?.member?.user?.id || interaction?.user?.id);
  if (!discordGuildId || !discordUserId) throw new Error('This player command must be run by a Discord member inside the bound server.');
  const status = stateStore.status?.();
  if (!status?.enabled || !status?.durable) throw new Error('Durable Discord player-link state is unavailable.');
  const guildState = await stateStore.readGuild(discordGuildId);
  const link = guildState?.userLinks?.[discordUserId];
  const code = allyCode(link?.swgohAllyCode);
  if (!code) throw new Error('Your Discord account is not linked to a SWGOH player in this server. Ask an officer to link you or use the registration workflow.');
  const player = first(await store.select('players', {
    select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
    ally_code: `eq.${code}`,
    limit: 1,
  }));
  if (!player?.id) {
    if (!requireBoundGuild) {
      return { stateStore, store, guildState, discordGuildId, discordUserId, link, player: { id: '', ally_code: code, name: code, current_guild_id: null } };
    }
    throw new Error('Your linked SWGOH player is not available in canonical persistence.');
  }
  if (requireBoundGuild) {
    if (!player.current_guild_id) throw new Error('Your linked SWGOH player is not a current canonical Guild member.');
    const seedCode = allyCode(guildState?.swgohAllyCode);
    if (seedCode) {
      const seed = first(await store.select('players', { select: 'id,current_guild_id', ally_code: `eq.${seedCode}`, limit: 1 }));
      if (seed?.current_guild_id && text(seed.current_guild_id) !== text(player.current_guild_id)) {
        throw new Error('Your linked player is no longer in the SWGOH Guild bound to this Discord server.');
      }
    }
  }
  return { stateStore, store, guildState, discordGuildId, discordUserId, link, player };
}

async function currentControl(context) {
  if (!context.player?.id || !context.player?.current_guild_id) return null;
  return first(await context.store.select('guild_member_operation_controls', {
    select: 'guild_id,player_id,available,ignored_until,ignore_reason,source,metadata,updated_at',
    guild_id: `eq.${context.player.current_guild_id}`,
    player_id: `eq.${context.player.id}`,
    limit: 1,
  }));
}

function activeOfficerControl(control) {
  if (!control || text(control.source) === SELF_SOURCE) return false;
  const ignoredUntil = Date.parse(control.ignored_until || '');
  return control.available === false || (Number.isFinite(ignoredUntil) && ignoredUntil > Date.now());
}

async function ignoreSelf(interaction, services) {
  const context = await resolveSelf(interaction, services, { requireBoundGuild: true });
  const days = Math.max(0, Math.min(365, Math.trunc(Number(option(interaction, 'days') ?? 0))));
  const reason = safe(option(interaction, 'reason'), '').slice(0, 200);
  const existing = await currentControl(context);

  if (activeOfficerControl(existing)) {
    const until = existing?.ignored_until && Number.isFinite(Date.parse(existing.ignored_until))
      ? new Date(existing.ignored_until).toUTCString()
      : 'until an officer clears it';
    return `**SWGOH Command Center · Officer Control Remains**\n**${safe(context.player.name)}** · ${displayAlly(context.player.ally_code)} already has an officer-managed Operations exclusion. Your self-service command cannot weaken or replace it.\nCurrent officer control: **${existing.available === false ? 'UNAVAILABLE' : `ignored until ${until}`}**. Contact an officer if the dates need to change.`;
  }

  const ignoredUntil = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  await context.store.upsert('guild_member_operation_controls', [{
    guild_id: context.player.current_guild_id,
    player_id: context.player.id,
    available: existing?.available === false ? false : true,
    ignored_until: ignoredUntil,
    ignore_reason: days > 0 ? (reason || 'Player self-service Discord ignore') : null,
    source: SELF_SOURCE,
    updated_by_user_id: null,
    metadata: {
      ...(existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {}),
      discordUserId: context.discordUserId,
      selfService: true,
    },
    updated_at: new Date().toISOString(),
  }], { onConflict: 'guild_id,player_id', returning: false });
  return days > 0
    ? `**SWGOH Command Center · Your Timed Ignore**\n**${safe(context.player.name)}** · ${displayAlly(context.player.ally_code)} is excluded from Operations assignments for **${days} day${days === 1 ? '' : 's'}**${reason ? ` · ${reason}` : ''}.\nExpiry: **${new Date(ignoredUntil).toUTCString()}**. Use \`/tb ignore days:0\` to clear it early.`
    : `**SWGOH Command Center · Your Ignore Cleared**\n**${safe(context.player.name)}** · ${displayAlly(context.player.ally_code)} is eligible for Operations assignments again.`;
}

async function unregisterSelf(interaction, services) {
  const context = await resolveSelf(interaction, services, { requireBoundGuild: false });
  const existing = await currentControl(context);
  if (text(existing?.source) === SELF_SOURCE) {
    await context.store.upsert('guild_member_operation_controls', [{
      guild_id: context.player.current_guild_id,
      player_id: context.player.id,
      available: true,
      ignored_until: null,
      ignore_reason: null,
      source: SELF_SOURCE,
      updated_by_user_id: null,
      metadata: {
        ...(existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {}),
        discordUserId: context.discordUserId,
        selfService: true,
        clearedOnDiscordUnregister: true,
      },
      updated_at: new Date().toISOString(),
    }], { onConflict: 'guild_id,player_id', returning: false });
  }
  const previous = await context.stateStore.unlinkPlayer({
    discordGuildId: context.discordGuildId,
    discordUserId: context.discordUserId,
    actorDiscordUserId: context.discordUserId,
  });
  const officerNote = activeOfficerControl(existing)
    ? '\nAn officer-managed Operations control for this player remains in force and was not removed.'
    : '';
  return `**SWGOH Command Center · Player Unregistered**\nYour Discord account is no longer linked to **${safe(context.player.name || context.link?.swgohAllyCode)}** · ${displayAlly(context.player.ally_code || context.link?.swgohAllyCode)} in this server.\nDiscord GIVE/KEEP and legacy availability controls tied to this Discord link were cleared. Your self-service timed ignore was cleared if present. Canonical Guild history and your Command Center account data were not deleted.${officerNote}\nPrevious link: ${displayAlly(previous?.swgohAllyCode || context.player.ally_code || context.link?.swgohAllyCode)}.`;
}

export async function executeDiscordPlayerLifecycleCommand(interaction, services = {}) {
  const subcommand = playerLifecycleSubcommand(interaction);
  if (subcommand === 'ignore') return ignoreSelf(interaction, services);
  if (subcommand === 'unregister') return unregisterSelf(interaction, services);
  throw new Error('Unsupported self-service player lifecycle command.');
}
