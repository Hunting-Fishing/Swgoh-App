import { discordStateStore } from './discord-state-store.mjs';
import {
  guildOperationsDiscordConfig,
  guildOperationsDiscordDelivery,
} from './guild-operations-discord-delivery.mjs';
import { guildOperationsService } from './guild-operations-service.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const first = (value) => array(value)[0] || null;
const allyCode = (value) => {
  const digits = text(value).replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : '';
};
const baseId = (value) => text(value).toUpperCase();
const preference = (value) => {
  const normalized = text(value).toLowerCase();
  return normalized === 'give' || normalized === 'keep' ? normalized : '';
};
const timestamp = (value) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

function safeDestination(row = {}) {
  return Object.freeze({
    id: text(row.id),
    kind: text(row.destination_kind),
    externalId: text(row.external_id),
    displayName: text(row.display_name),
    verified: row.verified === true,
    updatedAt: text(row.updated_at),
  });
}

function safeSchedule(row = {}) {
  return Object.freeze({
    id: text(row.id),
    runType: text(row.run_type),
    name: text(row.name),
    status: text(row.status),
    stage: text(row.stage),
    nextRunAt: text(row.next_run_at),
    lastRunAt: text(row.last_run_at),
    lastError: text(row.last_error),
  });
}

function safeReceipt(row = {}) {
  return Object.freeze({
    id: text(row.id),
    runType: text(row.run_type),
    deliveryKind: text(row.delivery_kind),
    recipientKey: text(row.recipient_key),
    status: text(row.status),
    externalChannelId: text(row.external_channel_id),
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    errorMessage: text(row.error_message),
    attemptedAt: text(row.attempted_at),
    deliveredAt: text(row.delivered_at),
  });
}

function resolvePlayer(row, maps) {
  const direct = text(row?.player_id || row?.playerId || row?.memberId);
  const code = allyCode(row?.ally_code || row?.allyCode || row?.swgohAllyCode);
  return maps.byId.get(direct)
    || maps.bySwgohId.get(direct)
    || (code ? maps.byAllyCode.get(code) : null)
    || null;
}

function buildDonationReport({ canonicalRows, discordRows, players }) {
  const maps = {
    byId: new Map(),
    bySwgohId: new Map(),
    byAllyCode: new Map(),
  };
  for (const player of players) {
    const id = text(player.id);
    const swgohId = text(player.swgoh_player_id);
    const code = allyCode(player.ally_code);
    if (id) maps.byId.set(id, player);
    if (swgohId) maps.bySwgohId.set(swgohId, player);
    if (code) maps.byAllyCode.set(code, player);
  }

  const merged = new Map();
  // Player Discord preferences are loaded first. Canonical Command Center officer
  // preferences are loaded second and intentionally win identical player/unit keys,
  // matching the live planner's current precedence rule.
  for (const row of discordRows) {
    const player = resolvePlayer(row, maps);
    const unit = baseId(row?.baseId || row?.base_id);
    const pref = preference(row?.preference);
    if (!player?.id || !unit || !pref) continue;
    merged.set(`${player.id}|${unit}`, {
      player,
      baseId: unit,
      preference: pref,
      source: 'discord-player',
      updatedAt: text(row?.updatedAt || row?.updated_at),
    });
  }
  for (const row of canonicalRows) {
    const player = resolvePlayer(row, maps);
    const unit = baseId(row?.base_id || row?.baseId);
    const pref = preference(row?.preference);
    if (!player?.id || !unit || !pref) continue;
    merged.set(`${player.id}|${unit}`, {
      player,
      baseId: unit,
      preference: pref,
      source: text(row?.source) || 'command-center-web',
      updatedAt: text(row?.updated_at || row?.updatedAt),
    });
  }

  const grouped = new Map();
  for (const row of merged.values()) {
    const id = text(row.player.id);
    if (!grouped.has(id)) {
      grouped.set(id, {
        playerId: id,
        allyCode: allyCode(row.player.ally_code),
        name: text(row.player.name),
        give: 0,
        keep: 0,
        sources: new Set(),
        units: [],
        lastUpdatedAt: '',
      });
    }
    const group = grouped.get(id);
    group[row.preference] += 1;
    group.sources.add(row.source);
    group.units.push(Object.freeze({
      baseId: row.baseId,
      preference: row.preference,
      source: row.source,
      updatedAt: row.updatedAt,
    }));
    if (timestamp(row.updatedAt) > timestamp(group.lastUpdatedAt)) group.lastUpdatedAt = row.updatedAt;
  }

  const members = [...grouped.values()]
    .map((row) => Object.freeze({
      playerId: row.playerId,
      allyCode: row.allyCode,
      name: row.name,
      give: row.give,
      keep: row.keep,
      overrideCount: row.give + row.keep,
      sources: Object.freeze([...row.sources].sort()),
      units: Object.freeze(row.units.sort((a, b) => a.baseId.localeCompare(b.baseId))),
      lastUpdatedAt: row.lastUpdatedAt,
    }))
    .sort((a, b) => b.overrideCount - a.overrideCount || a.name.localeCompare(b.name));

  return Object.freeze({
    memberCount: members.length,
    overrideCount: members.reduce((sum, row) => sum + row.overrideCount, 0),
    giveCount: members.reduce((sum, row) => sum + row.give, 0),
    keepCount: members.reduce((sum, row) => sum + row.keep, 0),
    members: Object.freeze(members),
  });
}

export function createGuildIntegrationReportService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const operations = options.operations || guildOperationsService;
  const delivery = options.delivery || guildOperationsDiscordDelivery;
  const stateStore = options.stateStore || discordStateStore;
  const env = options.env || process.env;

  async function report(userId, lookupAllyCode) {
    const context = await operations.requireOfficer(userId, lookupAllyCode);
    const guildId = text(context.guild.id);
    const [destinationsRaw, schedulesRaw, receiptsRaw, playersRaw, canonicalPrefsRaw, auditsRaw] = await Promise.all([
      store.select('guild_discord_destinations', {
        select: 'id,destination_kind,external_id,display_name,verified,updated_at',
        guild_id: `eq.${guildId}`,
        order: 'display_name.asc',
        limit: 100,
      }),
      store.select('guild_operation_schedules', {
        select: 'id,run_type,name,status,stage,next_run_at,last_run_at,last_error',
        guild_id: `eq.${guildId}`,
        order: 'next_run_at.asc',
        limit: 100,
      }),
      store.select('guild_operations_delivery_receipts', {
        select: 'id,run_type,delivery_kind,recipient_key,status,external_channel_id,http_status,error_message,attempted_at,delivered_at',
        guild_id: `eq.${guildId}`,
        order: 'attempted_at.desc',
        limit: 50,
      }),
      store.select('players', {
        select: 'id,ally_code,swgoh_player_id,name,current_guild_id',
        current_guild_id: `eq.${guildId}`,
        order: 'name.asc',
        limit: 100,
      }),
      store.select('guild_unit_donation_preferences', {
        select: 'player_id,base_id,preference,source,updated_at',
        guild_id: `eq.${guildId}`,
        order: 'updated_at.desc',
        limit: 500,
      }),
      store.select('guild_operations_audit_log', {
        select: 'id,action,entity_type,entity_id,occurred_at',
        guild_id: `eq.${guildId}`,
        order: 'occurred_at.desc',
        limit: 10,
      }),
    ]);

    const stateStatus = typeof stateStore?.status === 'function' ? stateStore.status() : {};
    const binding = stateStatus?.enabled && stateStatus?.durable && typeof delivery?.resolveBinding === 'function'
      ? await delivery.resolveBinding(guildId).catch(() => null)
      : null;
    const guildState = binding?.discordGuildId && typeof stateStore?.readGuild === 'function'
      ? await stateStore.readGuild(binding.discordGuildId).catch(() => null)
      : null;

    const destinations = array(destinationsRaw).map(safeDestination);
    const schedules = array(schedulesRaw).map(safeSchedule);
    const receipts = array(receiptsRaw).map(safeReceipt);
    const players = array(playersRaw);
    const discordPreferences = Object.values(object(guildState?.memberPreferences));
    const donations = buildDonationReport({
      canonicalRows: array(canonicalPrefsRaw),
      discordRows: discordPreferences,
      players,
    });

    const config = guildOperationsDiscordConfig(env);
    const verifiedDestinations = destinations.filter((row) => row.verified);
    const activeSchedules = schedules.filter((row) => row.status === 'active');
    const pausedSchedules = schedules.filter((row) => row.status === 'paused');
    const inFlightSchedules = schedules.filter((row) => ['syncing', 'planning', 'publishing'].includes(row.stage));
    const erroredSchedules = schedules.filter((row) => Boolean(row.lastError));
    const deliveredReceipts = receipts.filter((row) => row.status === 'delivered');
    const failedReceipts = receipts.filter((row) => row.status === 'failed');
    const linkedMembers = Object.keys(object(guildState?.userLinks)).length;
    const currentMembers = players.length;

    return Object.freeze({
      source: 'guild-integration-intelligence-v1',
      guild: Object.freeze({
        id: guildId,
        name: text(context.guild.name),
        memberCount: currentMembers || Number(context.guild.member_count || 0),
        galacticPower: Number(context.guild.galactic_power || 0),
        lastSyncedAt: text(context.guild.last_synced_at),
      }),
      authorization: Object.freeze({ role: text(context.role), officer: true }),
      discord: Object.freeze({
        bound: Boolean(binding?.discordGuildId),
        discordGuildId: text(binding?.discordGuildId),
        commandChannelId: text(guildState?.commandChannelId),
        officerRoleCount: array(guildState?.officerRoleIds).length,
        durableState: stateStatus?.enabled === true && stateStatus?.durable === true,
        botConfigured: Boolean(config.botToken),
        deliveryEnabled: config.deliveryEnabled === true,
        linkedMemberCount: linkedMembers,
        unlinkedMemberCount: Math.max(0, currentMembers - linkedMembers),
      }),
      destinations: Object.freeze({
        total: destinations.length,
        verified: verifiedDestinations.length,
        rows: Object.freeze(destinations),
      }),
      schedules: Object.freeze({
        total: schedules.length,
        active: activeSchedules.length,
        paused: pausedSchedules.length,
        inFlight: inFlightSchedules.length,
        errors: erroredSchedules.length,
        nextRunAt: text(activeSchedules.find((row) => row.nextRunAt)?.nextRunAt),
        rows: Object.freeze(schedules),
      }),
      delivery: Object.freeze({
        recentAttempts: receipts.length,
        delivered: deliveredReceipts.length,
        failed: failedReceipts.length,
        latest: first(receipts),
        rows: Object.freeze(receipts),
      }),
      donations,
      recentAudit: Object.freeze(array(auditsRaw).map((row) => Object.freeze({
        id: text(row.id),
        action: text(row.action),
        entityType: text(row.entity_type),
        entityId: text(row.entity_id),
        occurredAt: text(row.occurred_at),
      }))),
    });
  }

  return Object.freeze({ report });
}

export const guildIntegrationReportService = createGuildIntegrationReportService();
