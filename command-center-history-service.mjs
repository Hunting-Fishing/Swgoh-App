import { supabaseCoreStore } from "./supabase-core-store.mjs";
import { buildGuildActivityCommand } from "./guild-activity-command.mjs";

const DEFAULT_PLAYER_EVENTS = 100;
const DEFAULT_GUILD_EVENTS = 200;
const DEFAULT_SNAPSHOTS = 90;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeAllyCode(value) {
  const allyCode = clean(value).replace(/\D/g, "");
  if (!/^\d{9}$/.test(allyCode)) {
    const error = new Error("A valid 9-digit Ally Code is required.");
    error.status = 400;
    throw error;
  }
  return allyCode;
}

function boundedLimit(value, fallback, max) {
  const parsed = Math.floor(finite(value, fallback));
  return Math.max(1, Math.min(max, parsed || fallback));
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  throw error;
}

function snapshotRow(row = {}) {
  return Object.freeze({
    capturedAt: clean(row.captured_at),
    galacticPower: finite(row.galactic_power),
    characterPower: finite(row.character_power),
    shipPower: finite(row.ship_power),
    characterCount: finite(row.character_count),
    shipCount: finite(row.ship_count),
    galacticLegendCount: finite(row.gl_count),
    gear13Count: finite(row.gear_13_count),
    relic5PlusCount: finite(row.relic_5_plus_count),
    relic7PlusCount: finite(row.relic_7_plus_count),
    relic9Count: finite(row.relic_9_count),
    sevenStarShipCount: finite(row.seven_star_ship_count),
    zetaCount: nullableFinite(row.zeta_count),
    omicronCount: nullableFinite(row.omicron_count),
    ultimateCount: nullableFinite(row.ultimate_count),
    omegaUpgradeCount: nullableFinite(row.omega_upgrade_count),
    sourceSyncRunId: clean(row.source_sync_run_id),
  });
}

function guildSnapshotRow(row = {}) {
  return Object.freeze({
    ...snapshotRow(row),
    memberCount: finite(row.member_count),
    hydratedMemberCount: finite(row.hydrated_member_count),
  });
}

function currentPlayerRow(row = {}) {
  return Object.freeze({
    playerId: clean(row.id),
    swgohPlayerId: clean(row.swgoh_player_id),
    allyCode: clean(row.ally_code),
    name: clean(row.name),
    galacticPower: finite(row.galactic_power),
    lastSyncedAt: clean(row.last_synced_at),
  });
}

function delta(previous, next, key) {
  const before = nullableFinite(previous?.[key]);
  const after = nullableFinite(next?.[key]);
  return before === null || after === null ? null : after - before;
}

function booleanDelta(previous, next, key) {
  if (!hasOwn(previous, key) || !hasOwn(next, key)) return null;
  const before = previous[key] === true;
  const after = next[key] === true;
  return before === after ? 0 : after ? 1 : -1;
}

function progressionEvent(row = {}, catalog = {}, player = {}) {
  const previous = asObject(row.previous_state);
  const next = asObject(row.new_state);
  const changedFields = asArray(row.changed_fields).map(clean).filter((field) => field && field !== "metadata");
  const catalogMeta = asObject(catalog.metadata);
  return Object.freeze({
    id: finite(row.id),
    playerId: clean(row.player_id),
    playerName: clean(player.name),
    allyCode: clean(player.ally_code),
    guildId: clean(row.guild_id),
    baseId: clean(row.base_id),
    unitName: clean(catalog.name || row.base_id),
    unitType: clean(catalog.combat_type).toLowerCase() === "ship" ? "Ship" : "Character",
    image: clean(catalog.image_url || catalogMeta.image),
    eventType: clean(row.event_type),
    changedAt: clean(row.changed_at),
    changedFields: Object.freeze(changedFields),
    previous: Object.freeze({
      rarity: nullableFinite(previous.rarity),
      level: nullableFinite(previous.level),
      gearLevel: nullableFinite(previous.gearLevel),
      relicTier: nullableFinite(previous.relicTier),
      galacticPower: nullableFinite(previous.galacticPower),
      zetaCount: nullableFinite(previous.zetaCount),
      omicronCount: nullableFinite(previous.omicronCount),
      ultimateUnlocked: hasOwn(previous, "ultimateUnlocked") ? previous.ultimateUnlocked === true : null,
    }),
    current: Object.freeze({
      rarity: nullableFinite(next.rarity),
      level: nullableFinite(next.level),
      gearLevel: nullableFinite(next.gearLevel),
      relicTier: nullableFinite(next.relicTier),
      galacticPower: nullableFinite(next.galacticPower),
      zetaCount: nullableFinite(next.zetaCount),
      omicronCount: nullableFinite(next.omicronCount),
      ultimateUnlocked: hasOwn(next, "ultimateUnlocked") ? next.ultimateUnlocked === true : null,
    }),
    delta: Object.freeze({
      rarity: delta(previous, next, "rarity"),
      level: delta(previous, next, "level"),
      gearLevel: delta(previous, next, "gearLevel"),
      relicTier: delta(previous, next, "relicTier"),
      galacticPower: delta(previous, next, "galacticPower"),
      zetaCount: delta(previous, next, "zetaCount"),
      omicronCount: delta(previous, next, "omicronCount"),
      ultimateUnlocked: booleanDelta(previous, next, "ultimateUnlocked"),
    }),
    source: clean(row.source),
  });
}

function summarizeProgression(events = []) {
  return Object.freeze({
    events: events.length,
    affectedPlayers: new Set(events.map((row) => row.playerId).filter(Boolean)).size,
    affectedUnits: new Set(events.map((row) => `${row.playerId}:${row.baseId}`).filter(Boolean)).size,
    gpGained: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.galacticPower)), 0),
    levelsGained: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.level)), 0),
    gearLevelsGained: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.gearLevel)), 0),
    relicLevelsGained: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.relicTier)), 0),
    zetasAdded: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.zetaCount)), 0),
    omicronsAdded: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.omicronCount)), 0),
    ultimatesAdded: events.reduce((sum, row) => sum + Math.max(0, finite(row.delta.ultimateUnlocked)), 0),
  });
}

function trendDelta(snapshots = []) {
  if (snapshots.length < 2) return Object.freeze({ comparable: false });
  const newest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  return Object.freeze({
    comparable: true,
    from: oldest.capturedAt,
    to: newest.capturedAt,
    galacticPower: newest.galacticPower - oldest.galacticPower,
    characterPower: newest.characterPower - oldest.characterPower,
    shipPower: newest.shipPower - oldest.shipPower,
    galacticLegends: newest.galacticLegendCount - oldest.galacticLegendCount,
    relic7Plus: newest.relic7PlusCount - oldest.relic7PlusCount,
    relic9: newest.relic9Count - oldest.relic9Count,
    zetas: newest.zetaCount === null || oldest.zetaCount === null ? null : newest.zetaCount - oldest.zetaCount,
    omicrons: newest.omicronCount === null || oldest.omicronCount === null ? null : newest.omicronCount - oldest.omicronCount,
    ultimates: newest.ultimateCount === null || oldest.ultimateCount === null ? null : newest.ultimateCount - oldest.ultimateCount,
  });
}

export function createCommandCenterHistoryService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const catalogTtlMs = Math.max(60_000, finite(options.catalogTtlMs, CATALOG_TTL_MS));
  let catalogCache = { expiresAt: 0, index: new Map() };

  function status() {
    const persistence = typeof store?.status === "function" ? store.status() : { configured: true };
    return Object.freeze({
      configured: persistence?.configured !== false,
      mode: "supabase-persisted-command-center-history",
      playerEventsDefault: DEFAULT_PLAYER_EVENTS,
      guildEventsDefault: DEFAULT_GUILD_EVENTS,
      snapshotsDefault: DEFAULT_SNAPSHOTS,
    });
  }

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function loadCatalog() {
    const now = Date.now();
    if (catalogCache.index.size && catalogCache.expiresAt > now) return catalogCache.index;
    const rows = asArray(await store.select("game_units", {
      select: "base_id,name,combat_type,image_url,metadata",
      order: "base_id.asc",
      limit: 1000,
    }));
    const index = new Map(rows.filter((row) => row?.base_id).map((row) => [clean(row.base_id), row]));
    catalogCache = { index, expiresAt: now + catalogTtlMs };
    return index;
  }

  async function getPlayerHistory(allyCodeInput, options = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const eventLimit = boundedLimit(options.eventLimit, DEFAULT_PLAYER_EVENTS, 500);
    const snapshotLimit = boundedLimit(options.snapshotLimit, DEFAULT_SNAPSHOTS, 365);
    const player = await selectOne("players", {
      select: "id,ally_code,swgoh_player_id,name,current_guild_id,galactic_power,character_power,ship_power,last_synced_at",
      ally_code: `eq.${allyCode}`,
    });
    if (!player) notFound("No persisted player history exists for that Ally Code yet.");

    const [eventRows, snapshotRows, catalog] = await Promise.all([
      store.select("player_unit_progression_history", {
        select: "id,player_id,guild_id,base_id,event_type,changed_at,changed_fields,previous_state,new_state,source,metadata",
        player_id: `eq.${player.id}`,
        order: "changed_at.desc,id.desc",
        limit: eventLimit,
      }),
      store.select("player_snapshots", {
        select: "captured_at,galactic_power,character_power,ship_power,character_count,ship_count,gl_count,gear_13_count,relic_5_plus_count,relic_7_plus_count,relic_9_count,seven_star_ship_count,zeta_count,omicron_count,ultimate_count,omega_upgrade_count,source_sync_run_id",
        player_id: `eq.${player.id}`,
        order: "captured_at.desc",
        limit: snapshotLimit,
      }),
      loadCatalog(),
    ]);

    const events = asArray(eventRows).map((row) => progressionEvent(row, catalog.get(clean(row.base_id)) || {}, player));
    const snapshots = asArray(snapshotRows).map(snapshotRow);
    return Object.freeze({
      source: "canonical-history",
      player: Object.freeze({
        id: clean(player.swgoh_player_id || player.id),
        persistentId: clean(player.id),
        allyCode: clean(player.ally_code),
        name: clean(player.name),
        currentGuildId: clean(player.current_guild_id),
        galacticPower: finite(player.galactic_power),
        characterPower: finite(player.character_power),
        shipPower: finite(player.ship_power),
        lastSyncedAt: clean(player.last_synced_at),
      }),
      snapshots: Object.freeze(snapshots),
      progression: Object.freeze(events),
      summary: summarizeProgression(events),
      trend: trendDelta(snapshots),
      limits: Object.freeze({ events: eventLimit, snapshots: snapshotLimit }),
    });
  }

  async function getGuildHistoryByPlayer(allyCodeInput, options = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const eventLimit = boundedLimit(options.eventLimit, DEFAULT_GUILD_EVENTS, 1000);
    const snapshotLimit = boundedLimit(options.snapshotLimit, DEFAULT_SNAPSHOTS, 365);
    const player = await selectOne("players", {
      select: "id,ally_code,current_guild_id",
      ally_code: `eq.${allyCode}`,
    });
    if (!player) notFound("No persisted player baseline exists for that Ally Code yet.");
    if (!player.current_guild_id) notFound("The persisted player is not currently linked to a Guild history.");
    const guildId = clean(player.current_guild_id);
    const guild = await selectOne("guilds", {
      select: "id,swgoh_guild_id,name,member_count,galactic_power,character_power,ship_power,last_synced_at",
      id: `eq.${guildId}`,
    });
    if (!guild) notFound("No persisted Guild history exists for that Ally Code yet.");

    const [snapshotRows, membershipRows, eventRows, currentPlayers, catalog] = await Promise.all([
      store.select("guild_snapshots", {
        select: "captured_at,member_count,hydrated_member_count,galactic_power,character_power,ship_power,gl_count,gear_13_count,relic_5_plus_count,relic_7_plus_count,relic_9_count,seven_star_ship_count,zeta_count,omicron_count,ultimate_count,omega_upgrade_count,source_sync_run_id",
        guild_id: `eq.${guildId}`,
        order: "captured_at.desc",
        limit: snapshotLimit,
      }),
      store.select("guild_membership_history", {
        select: "id,guild_id,player_id,event_type,occurred_at,previous_value,new_value,metadata",
        guild_id: `eq.${guildId}`,
        order: "occurred_at.desc,id.desc",
        limit: eventLimit,
      }),
      store.select("player_unit_progression_history", {
        select: "id,player_id,guild_id,base_id,event_type,changed_at,changed_fields,previous_state,new_state,source,metadata",
        guild_id: `eq.${guildId}`,
        order: "changed_at.desc,id.desc",
        limit: eventLimit,
      }),
      store.select("players", {
        select: "id,ally_code,name,swgoh_player_id,current_guild_id,galactic_power,last_synced_at",
        current_guild_id: `eq.${guildId}`,
        order: "name.asc",
        limit: 100,
      }),
      loadCatalog(),
    ]);

    const playersById = new Map(asArray(currentPlayers).map((row) => [clean(row.id), row]));
    const progression = asArray(eventRows).map((row) => progressionEvent(
      row,
      catalog.get(clean(row.base_id)) || {},
      playersById.get(clean(row.player_id)) || {}
    ));
    const snapshots = asArray(snapshotRows).map(guildSnapshotRow);
    const membership = asArray(membershipRows).map((row) => {
      const member = playersById.get(clean(row.player_id)) || {};
      const metadata = asObject(row.metadata);
      return Object.freeze({
        id: finite(row.id),
        playerId: clean(row.player_id),
        playerName: clean(member.name || metadata.playerName || row.new_value || row.previous_value),
        allyCode: clean(member.ally_code || metadata.allyCode),
        eventType: clean(row.event_type),
        occurredAt: clean(row.occurred_at),
        previousValue: clean(row.previous_value),
        newValue: clean(row.new_value),
      });
    });
    const currentMembers = asArray(currentPlayers).map(currentPlayerRow);
    const activityCommand = buildGuildActivityCommand({
      currentMembers,
      progression,
      membership,
      guildMemberCount: finite(guild.member_count, currentMembers.length),
      eventLimit,
    });

    return Object.freeze({
      source: "canonical-history",
      guild: Object.freeze({
        id: clean(guild.swgoh_guild_id || guild.id),
        persistentId: clean(guild.id),
        name: clean(guild.name),
        memberCount: finite(guild.member_count),
        galacticPower: finite(guild.galactic_power),
        characterPower: finite(guild.character_power),
        shipPower: finite(guild.ship_power),
        lastSyncedAt: clean(guild.last_synced_at),
      }),
      currentMembers: Object.freeze(currentMembers),
      snapshots: Object.freeze(snapshots),
      membership: Object.freeze(membership),
      progression: Object.freeze(progression),
      progressionSummary: summarizeProgression(progression),
      activityCommand,
      trend: trendDelta(snapshots),
      limits: Object.freeze({ events: eventLimit, snapshots: snapshotLimit }),
    });
  }

  return Object.freeze({
    status,
    getPlayerHistory,
    getGuildHistoryByPlayer,
  });
}

export const commandCenterHistoryService = createCommandCenterHistoryService();
