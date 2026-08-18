import { discordHardReservationStore } from './discord-hard-reservation-store.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();

function error(message, code = 'GUILD_UNBIND_FAILED') {
  const value = new Error(message);
  value.code = code;
  return value;
}

export async function unbindDiscordGuildIntegration(context, options = {}) {
  const store = options.store || context?.store || supabaseCoreStore;
  const stateStore = options.stateStore || context?.stateStore || discordStateStore;
  const reservationStore = options.reservationStore || discordHardReservationStore;
  const actorDiscordUserId = text(options.actorDiscordUserId);
  const timestamp = typeof options.now === 'function' ? options.now().toISOString() : nowIso();
  const guildId = text(context?.guild?.id);
  const discordGuildId = text(context?.discordGuildId);
  if (!guildId || !discordGuildId) throw error('A bound canonical Guild and Discord server are required.', 'GUILD_BINDING_REQUIRED');
  if (typeof stateStore?.unbindGuild !== 'function') throw error('Durable Discord state does not support safe Guild unbind yet.', 'UNBIND_PRIMITIVE_UNAVAILABLE');

  const [schedules, destinations] = await Promise.all([
    store.select('guild_operation_schedules', {
      select: 'id,status,stage,next_run_at,last_run_at', guild_id: `eq.${guildId}`, limit: 100,
    }),
    store.select('guild_discord_destinations', {
      select: 'id,destination_kind,external_id,display_name,verified', guild_id: `eq.${guildId}`, limit: 100,
    }),
  ]);
  const inFlight = array(schedules).filter((row) => ['syncing','planning','publishing'].includes(text(row.stage)));
  if (inFlight.length) {
    throw error(`Guild unregister is blocked while ${inFlight.length} scheduled Operation run${inFlight.length === 1 ? ' is' : 's are'} in flight. Retry after the current run finishes.`, 'SCHEDULE_IN_FLIGHT');
  }

  const activeSchedules = array(schedules).filter((row) => text(row.status) === 'active');
  const verifiedDestinations = array(destinations).filter((row) => row.verified === true);
  const guildState = context.guildState || await stateStore.readGuild(discordGuildId);
  const summary = {
    guildId,
    guildName: text(context?.guild?.name),
    discordGuildId,
    swgohAllyCode: text(context?.seedAllyCode || guildState?.swgohAllyCode),
    linkedPlayers: Object.keys(guildState?.userLinks || {}).length,
    donationPreferences: Object.keys(guildState?.memberPreferences || {}).length,
    memberAvailability: Object.keys(guildState?.memberAvailability || {}).length,
    activeSchedules: activeSchedules.length,
    verifiedDestinations: verifiedDestinations.length,
  };

  // Fail safe: server-side delivery and future scheduled execution are disabled
  // before Discord-only state is cleared. If a later durable-state write fails,
  // retrying is safe and no new assignment delivery remains armed.
  if (verifiedDestinations.length) {
    await store.update('guild_discord_destinations', { guild_id: `eq.${guildId}`, verified: 'eq.true' }, {
      verified: false,
      updated_at: timestamp,
    }, { returning: false });
  }
  if (activeSchedules.length) {
    await store.update('guild_operation_schedules', { guild_id: `eq.${guildId}`, status: 'eq.active' }, {
      status: 'paused',
      locked_at: null,
      locked_by: null,
      updated_at: timestamp,
    }, { returning: false });
  }
  const settings = await store.select('guild_operation_settings', { select: 'guild_id', guild_id: `eq.${guildId}`, limit: 1 });
  if (array(settings).length) {
    await store.update('guild_operation_settings', { guild_id: `eq.${guildId}` }, {
      default_delivery_mode: 'preview',
      default_discord_destination_id: null,
      include_mentions: false,
      send_dms: false,
      updated_at: timestamp,
    }, { returning: false });
  }

  await store.insert('guild_operations_audit_log', [{
    guild_id: guildId,
    actor_user_id: null,
    action: 'discord-guild.unregister',
    entity_type: 'discord_guild_binding',
    entity_id: discordGuildId,
    before_state: summary,
    after_state: { bound: false, destinationsVerified: 0, schedulesActive: 0 },
    metadata: { actorDiscordUserId, preservation: 'canonical-history-and-delivery-receipts-retained' },
    occurred_at: timestamp,
  }], { returning: false });

  let clearedHardReservations = 0;
  const reservationStatus = typeof reservationStore?.status === 'function' ? reservationStore.status() : null;
  if (reservationStatus?.enabled || reservationStatus?.durable) {
    if (!reservationStatus?.enabled || !reservationStatus?.durable || typeof reservationStore?.clearGuild !== 'function') {
      throw error('Durable Discord hard-reservation state cannot be safely cleared; Guild unregister stopped after delivery was disarmed.', 'HARD_RESERVATION_CLEAR_UNAVAILABLE');
    }
    const result = await reservationStore.clearGuild({ discordGuildId, actorDiscordUserId });
    clearedHardReservations = Number(result?.cleared || 0);
  }

  const previous = await stateStore.unbindGuild({ discordGuildId, actorDiscordUserId });
  return Object.freeze({
    unbound: true,
    guildId,
    guildName: summary.guildName,
    discordGuildId,
    disabledDestinations: verifiedDestinations.length,
    pausedSchedules: activeSchedules.length,
    clearedDiscordLinks: Number(previous?.linkedPlayers || summary.linkedPlayers),
    clearedHardReservations,
    preserved: Object.freeze([
      'canonical Guild identity and roster history',
      'Guild Intelligence daily/history data',
      'TB/TW saved plans and assignment runs in Supabase',
      'Discord delivery receipts and Operations audit history',
    ]),
  });
}
