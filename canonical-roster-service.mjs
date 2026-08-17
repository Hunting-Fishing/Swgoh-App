import { supabaseCoreStore } from "./supabase-core-store.mjs";

const DEFAULT_PAGE_SIZE = 500;
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

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

function unavailable(message) {
  const error = new Error(message);
  error.status = 503;
  return error;
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

function normalizeUnitType(value, catalog = {}) {
  const direct = clean(value || catalog?.combat_type || catalog?.metadata?.unitType).toLowerCase();
  return direct === "ship" || direct === "2" ? "Ship" : "Character";
}

function memberSnapshotMap(rows = []) {
  return new Map(asArray(rows).map((row) => [clean(row?.player_id), row]).filter(([id]) => id));
}

function latestMemberMap(rows = []) {
  return new Map(asArray(rows).map((row) => [clean(row?.player_id), row]).filter(([id]) => id));
}

export function createCanonicalRosterService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const pageSize = Math.max(50, Math.min(1000, Math.floor(finite(options.pageSize, DEFAULT_PAGE_SIZE))));
  const catalogTtlMs = Math.max(60_000, finite(options.catalogTtlMs, CATALOG_TTL_MS));
  let catalogCache = { expiresAt: 0, rows: [], index: new Map() };

  function status() {
    const persistence = typeof store?.status === "function" ? store.status() : { configured: true };
    return Object.freeze({
      configured: persistence?.configured !== false,
      mode: "supabase-canonical-full-logical-roster",
      pageSize,
      guildListSemantics: "all-current-members",
      playerRosterSemantics: "all-current-owned-units",
    });
  }

  async function selectPaged(table, query = {}, { maxRows = 10_000 } = {}) {
    const rows = [];
    let offset = 0;
    while (true) {
      const page = asArray(await store.select(table, {
        ...query,
        limit: pageSize,
        offset,
      }));
      rows.push(...page);
      if (page.length < pageSize) break;
      offset += page.length;
      if (rows.length >= maxRows) {
        throw unavailable(`${table} exceeded the canonical read safety limit; refusing to return a truncated roster.`);
      }
    }
    return rows;
  }

  async function selectOne(table, query = {}) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function loadCatalog() {
    const now = Date.now();
    if (catalogCache.rows.length && catalogCache.expiresAt > now) return catalogCache;
    const rows = await selectPaged("game_units", {
      select: "base_id,name,combat_type,alignment,categories,image_url,metadata,catalog_version",
      order: "base_id.asc",
    }, { maxRows: 2_000 });
    const index = new Map(rows.filter((row) => row?.base_id).map((row) => [clean(row.base_id), row]));
    catalogCache = { rows, index, expiresAt: now + catalogTtlMs };
    return catalogCache;
  }

  function normalizeOwnedUnit(row = {}, catalog = {}) {
    const metadata = asObject(row.metadata);
    const catalogMetadata = asObject(catalog.metadata);
    const unitType = normalizeUnitType(row.combat_type, catalog);
    const omegaCount = nullableFinite(metadata.verifiedOmegaUpgradeCount);
    return Object.freeze({
      id: clean(metadata.unitId),
      baseId: clean(row.base_id),
      definitionId: clean(metadata.definitionId),
      name: clean(row.unit_name || catalog.name || row.base_id),
      unitType,
      combatType: unitType === "Ship" ? 2 : 1,
      alignment: clean(catalog.alignment || "Unknown"),
      role: clean(catalogMetadata.role),
      factions: Object.freeze(asArray(catalogMetadata.factions).map(clean).filter(Boolean)),
      tags: Object.freeze(asArray(catalog.categories).map(clean).filter(Boolean)),
      image: clean(catalog.image_url || catalogMetadata.image),
      stars: finite(row.rarity),
      level: finite(row.level),
      gear: finite(row.gear_level),
      relic: finite(row.relic_tier),
      power: finite(row.galactic_power),
      speed: finite(metadata.speed),
      zetas: finite(row.zeta_count),
      omicrons: finite(row.omicron_count),
      omegas: omegaCount,
      ultimateUnlocked: row.ultimate_unlocked === true,
      equippedMods: null,
      readiness: null,
      skillTiers: Object.freeze(asArray(metadata.skills).map((skill) => Object.freeze({
        id: clean(skill?.id),
        rawTier: finite(skill?.tier),
        effectiveTier: finite(skill?.tier) + finite(metadata.rawSkillTierOffset, 2),
      })).filter((skill) => skill.id)),
      persistedAt: clean(row.last_synced_at),
      persistenceCapabilities: Object.freeze({
        fullOwnedRoster: true,
        unitGp: true,
        speed: true,
        zetas: metadata.zetaClassificationComplete === true,
        omicrons: metadata.omicronClassificationComplete === true,
        omegas: metadata.omegaClassificationComplete === true,
        equippedMods: false,
        calculatedStats: false,
      }),
    });
  }

  async function getPlayerRoster(allyCodeInput) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const player = await selectOne("players", {
      select: "id,ally_code,swgoh_player_id,name,level,galactic_power,character_power,ship_power,current_guild_id,last_synced_at,metadata",
      ally_code: `eq.${allyCode}`,
    });
    if (!player) throw notFound("No persisted player baseline exists for that Ally Code yet.");

    const [unitRows, snapshot, guild, catalog] = await Promise.all([
      selectPaged("player_units_current", {
        select: "player_id,base_id,unit_name,combat_type,rarity,level,gear_level,relic_tier,galactic_power,zeta_count,omicron_count,ultimate_unlocked,last_synced_at,metadata",
        player_id: `eq.${player.id}`,
        order: "galactic_power.desc,base_id.asc",
      }, { maxRows: 2_000 }),
      selectOne("player_snapshots", {
        select: "captured_at,galactic_power,character_power,ship_power,character_count,ship_count,gl_count,gear_13_count,relic_5_plus_count,relic_7_plus_count,relic_9_count,seven_star_ship_count,zeta_count,omicron_count,ultimate_count,omega_upgrade_count,metrics,source_sync_run_id",
        player_id: `eq.${player.id}`,
        order: "captured_at.desc",
      }),
      player.current_guild_id ? selectOne("guilds", {
        select: "id,swgoh_guild_id,name,member_count,galactic_power,last_synced_at",
        id: `eq.${player.current_guild_id}`,
      }) : Promise.resolve(null),
      loadCatalog(),
    ]);

    const units = unitRows.map((row) => normalizeOwnedUnit(row, catalog.index.get(clean(row.base_id)) || {}));
    const characters = units.filter((unit) => unit.unitType !== "Ship");
    const ships = units.filter((unit) => unit.unitType === "Ship");
    const lastSyncedAt = clean(player.last_synced_at || snapshot?.captured_at);
    const zetaCount = nullableFinite(snapshot?.zeta_count);
    const omicronCount = nullableFinite(snapshot?.omicron_count);
    const ultimateCount = nullableFinite(snapshot?.ultimate_count);
    const omegaCount = nullableFinite(snapshot?.omega_upgrade_count);

    return Object.freeze({
      source: "canonical",
      sourceDetail: "supabase-persisted-baseline",
      fetchedAt: lastSyncedAt,
      player: Object.freeze({
        id: clean(player.swgoh_player_id || player.id),
        persistentId: clean(player.id),
        allyCode: clean(player.ally_code),
        name: clean(player.name),
        level: finite(player.level),
        galacticPower: finite(player.galactic_power),
        characterGalacticPower: finite(player.character_power),
        shipGalacticPower: finite(player.ship_power),
        guildId: clean(guild?.swgoh_guild_id || guild?.id),
        guildName: clean(guild?.name),
        updatedAt: lastSyncedAt,
      }),
      units: Object.freeze(characters),
      ships: Object.freeze(ships),
      summary: Object.freeze({
        rosterUnits: units.length,
        characters: snapshot ? finite(snapshot.character_count, characters.length) : characters.length,
        ships: snapshot ? finite(snapshot.ship_count, ships.length) : ships.length,
        galacticLegends: finite(snapshot?.gl_count),
        gear13: finite(snapshot?.gear_13_count),
        relic5Plus: finite(snapshot?.relic_5_plus_count),
        relic7Plus: finite(snapshot?.relic_7_plus_count),
        relic9: finite(snapshot?.relic_9_count),
        sevenStarShips: finite(snapshot?.seven_star_ship_count),
        zetas: zetaCount,
        omicrons: omicronCount,
        ultimates: ultimateCount,
        omegaUpgrades: omegaCount,
        equippedMods: null,
        sixDotMods: null,
        datacrons: null,
      }),
      capabilities: Object.freeze({
        liveRoster: false,
        persistedFullRoster: true,
        unitGp: true,
        zetas: zetaCount !== null,
        omicrons: omicronCount !== null,
        omegas: omegaCount !== null,
        equippedMods: false,
        sixDotMods: false,
        datacrons: false,
        calculatedStats: false,
      }),
      persistence: Object.freeze({
        playerId: clean(player.id),
        guildId: clean(player.current_guild_id),
        snapshotRunId: clean(snapshot?.source_sync_run_id),
        lastSyncedAt,
        logicalRosterComplete: true,
        returnedOwnedUnits: units.length,
      }),
    });
  }

  async function getGuildRosterByPlayer(allyCodeInput) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const lookupPlayer = await selectOne("players", {
      select: "id,ally_code,current_guild_id",
      ally_code: `eq.${allyCode}`,
    });
    if (!lookupPlayer) throw notFound("No persisted player baseline exists for that Ally Code yet.");
    if (!lookupPlayer.current_guild_id) throw notFound("The persisted player is not currently linked to a Guild baseline.");

    const guildId = clean(lookupPlayer.current_guild_id);
    const [guild, memberRows, playerRows, guildSnapshot] = await Promise.all([
      selectOne("guilds", {
        select: "id,swgoh_guild_id,name,member_count,galactic_power,character_power,ship_power,last_synced_at,source,metadata",
        id: `eq.${guildId}`,
      }),
      selectPaged("guild_members_current", {
        select: "guild_id,player_id,member_name,member_galactic_power,member_character_power,member_ship_power,first_seen_in_guild_at,last_seen_in_guild_at,last_synced_at,metadata",
        guild_id: `eq.${guildId}`,
        order: "member_galactic_power.desc,member_name.asc",
      }, { maxRows: 100 }),
      selectPaged("players", {
        select: "id,ally_code,swgoh_player_id,name,level,galactic_power,character_power,ship_power,current_guild_id,last_synced_at,metadata",
        current_guild_id: `eq.${guildId}`,
        order: "galactic_power.desc,name.asc",
      }, { maxRows: 100 }),
      selectOne("guild_snapshots", {
        select: "captured_at,member_count,hydrated_member_count,galactic_power,character_power,ship_power,gl_count,gear_13_count,relic_5_plus_count,relic_7_plus_count,relic_9_count,seven_star_ship_count,zeta_count,omicron_count,ultimate_count,omega_upgrade_count,metrics,source_sync_run_id",
        guild_id: `eq.${guildId}`,
        order: "captured_at.desc",
      }),
    ]);
    if (!guild) throw notFound("The persisted Guild baseline is unavailable.");

    const snapshotRows = guildSnapshot?.source_sync_run_id
      ? await selectPaged("player_snapshots", {
          select: "player_id,captured_at,galactic_power,character_power,ship_power,character_count,ship_count,gl_count,gear_13_count,relic_5_plus_count,relic_7_plus_count,relic_9_count,seven_star_ship_count,zeta_count,omicron_count,ultimate_count,omega_upgrade_count,metrics,source_sync_run_id",
          source_sync_run_id: `eq.${guildSnapshot.source_sync_run_id}`,
          order: "galactic_power.desc",
        }, { maxRows: 100 })
      : [];

    const membersByPlayer = latestMemberMap(memberRows);
    const snapshotsByPlayer = memberSnapshotMap(snapshotRows);
    const playersById = new Map(playerRows.map((row) => [clean(row.id), row]));
    const memberIds = new Set(memberRows.map((row) => clean(row.player_id)).filter(Boolean));
    const playerIds = new Set(playerRows.map((row) => clean(row.id)).filter(Boolean));
    const missingPlayerRows = [...memberIds].filter((id) => !playerIds.has(id));
    if (missingPlayerRows.length) {
      throw unavailable(`Canonical Guild membership has ${missingPlayerRows.length} member(s) without a current player row; refusing a partial 50-member list.`);
    }

    const members = memberRows.map((membership) => {
      const playerId = clean(membership.player_id);
      const player = playersById.get(playerId) || {};
      const snapshot = snapshotsByPlayer.get(playerId) || {};
      return Object.freeze({
        id: clean(player.swgoh_player_id || playerId),
        persistentId: playerId,
        playerId: clean(player.swgoh_player_id || playerId),
        allyCode: clean(player.ally_code),
        name: clean(player.name || membership.member_name || playerId),
        level: finite(player.level),
        galacticPower: finite(player.galactic_power, finite(membership.member_galactic_power)),
        characterGalacticPower: finite(player.character_power, finite(membership.member_character_power)),
        shipGalacticPower: finite(player.ship_power, finite(membership.member_ship_power)),
        rosterAvailable: Boolean(snapshotsByPlayer.has(playerId)),
        characterCount: finite(snapshot.character_count),
        shipCount: finite(snapshot.ship_count),
        gear13: finite(snapshot.gear_13_count),
        relic5: finite(snapshot.relic_5_plus_count),
        relic7: finite(snapshot.relic_7_plus_count),
        relic9: finite(snapshot.relic_9_count),
        sevenStarShips: finite(snapshot.seven_star_ship_count),
        galacticLegendCount: finite(snapshot.gl_count),
        zetaCount: nullableFinite(snapshot.zeta_count),
        omicronCount: nullableFinite(snapshot.omicron_count),
        ultimateCount: nullableFinite(snapshot.ultimate_count),
        omegaUpgradeCount: nullableFinite(snapshot.omega_upgrade_count),
        galacticLegends: Object.freeze([]),
        topUnits: Object.freeze([]),
        units: Object.freeze([]),
        firstSeenInGuildAt: clean(membership.first_seen_in_guild_at),
        lastSeenInGuildAt: clean(membership.last_seen_in_guild_at),
        lastSyncedAt: clean(player.last_synced_at || membership.last_synced_at || snapshot.captured_at),
        persistenceSummary: true,
      });
    });

    const expectedMembers = finite(guild.member_count, members.length);
    if (expectedMembers > 0 && members.length !== expectedMembers) {
      throw unavailable(`Canonical Guild roster expected ${expectedMembers} members but loaded ${members.length}; refusing to display a truncated member list.`);
    }

    const hydrated = members.filter((member) => member.rosterAvailable).length;
    return Object.freeze({
      source: "canonical",
      sourceDetail: "supabase-persisted-guild-baseline",
      fetchedAt: clean(guild.last_synced_at || guildSnapshot?.captured_at),
      guild: Object.freeze({
        id: clean(guild.swgoh_guild_id || guild.id),
        persistentId: clean(guild.id),
        name: clean(guild.name || "Unknown Guild"),
        galacticPower: finite(guild.galactic_power),
        characterGalacticPower: finite(guild.character_power),
        shipGalacticPower: finite(guild.ship_power),
        memberCount: expectedMembers,
      }),
      hydration: Object.freeze({
        requested: members.length,
        hydrated,
        failed: Math.max(0, members.length - hydrated),
        complete: members.length > 0 && hydrated === members.length,
      }),
      members: Object.freeze(members),
      summary: Object.freeze({
        totalMembers: members.length,
        hydratedMembers: hydrated,
        guildGp: finite(guildSnapshot?.galactic_power, finite(guild.galactic_power)),
        characterGp: finite(guildSnapshot?.character_power, finite(guild.character_power)),
        shipGp: finite(guildSnapshot?.ship_power, finite(guild.ship_power)),
        galacticLegends: finite(guildSnapshot?.gl_count),
        gear13: finite(guildSnapshot?.gear_13_count),
        relic5Characters: finite(guildSnapshot?.relic_5_plus_count),
        relic7Characters: finite(guildSnapshot?.relic_7_plus_count),
        relic9Characters: finite(guildSnapshot?.relic_9_count),
        sevenStarShips: finite(guildSnapshot?.seven_star_ship_count),
        zetas: nullableFinite(guildSnapshot?.zeta_count),
        omicrons: nullableFinite(guildSnapshot?.omicron_count),
        ultimates: nullableFinite(guildSnapshot?.ultimate_count),
        omegaUpgrades: nullableFinite(guildSnapshot?.omega_upgrade_count),
      }),
      persistence: Object.freeze({
        guildId,
        snapshotRunId: clean(guildSnapshot?.source_sync_run_id),
        lastSyncedAt: clean(guild.last_synced_at || guildSnapshot?.captured_at),
        logicalMemberListComplete: true,
        returnedMembers: members.length,
        fullMemberRostersEndpoint: "/api/player/{allyCode}/baseline",
      }),
    });
  }

  return Object.freeze({
    status,
    getPlayerRoster,
    getGuildRosterByPlayer,
    _selectPaged: selectPaged,
  });
}

export const canonicalRosterService = createCanonicalRosterService();
