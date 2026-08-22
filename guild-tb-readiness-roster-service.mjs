import { canonicalRosterService } from "./canonical-roster-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";
import { stripFactionDecorators, unitFactionKeys } from "./public/guild-tb-faction-tags.js";

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

export const TB_READINESS_EXPLICIT_BASE_IDS = Object.freeze([
  "CEREJUNDA",
  "JEDIKNIGHTCAL",
  "CALKESTIS",
  "MANDALORBOKATAN",
  "THEMANDALORIANBESKARARMOR",
  "GRANDINQUISITOR",
  "GEONOSIANBROODALPHA",
  "GEONOSIANSOLDIER",
  "GEONOSIANSPY",
  "POGGLETHELESSER",
  "SUNFAC",
]);

export const TB_READINESS_CATEGORY_NAMES = Object.freeze([
  "mandalorian",
  "inquisitorius",
]);

const clean = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asArray = (value) => Array.isArray(value) ? value : [];

function normalizeAllyCode(value) {
  const allyCode = clean(value).replace(/\D/g, "");
  if (!/^\d{9}$/.test(allyCode)) {
    const error = new Error("A valid 9-digit Ally Code is required for Guild TB readiness.");
    error.status = 400;
    throw error;
  }
  return allyCode;
}

const normalizeCategory = stripFactionDecorators;
const unitCategoryKeys = unitFactionKeys;

function relevantCatalogRows(catalog = []) {
  const explicit = new Set(TB_READINESS_EXPLICIT_BASE_IDS);
  const categories = new Set(TB_READINESS_CATEGORY_NAMES);
  return asArray(catalog).filter((unit) => {
    const baseId = clean(unit?.baseId).toUpperCase();
    if (explicit.has(baseId)) return true;
    return unitCategoryKeys(unit).some((category) => categories.has(category));
  });
}

function relevantBaseIds(catalog = []) {
  const ids = new Set(TB_READINESS_EXPLICIT_BASE_IDS);
  for (const unit of relevantCatalogRows(catalog)) {
    const baseId = clean(unit?.baseId).toUpperCase();
    if (/^[A-Z0-9_]{2,80}$/.test(baseId)) ids.add(baseId);
  }
  return [...ids];
}

function safeInValues(values = [], pattern) {
  return [...new Set(values.map(clean).filter((value) => value && pattern.test(value)))];
}

function inFilter(values = []) {
  return `in.(${values.join(",")})`;
}

function compactUnit(row = {}) {
  const gear = Math.max(0, Math.floor(finite(row.gear_level ?? row.gear ?? row.gearLevel)));
  const relic = Math.max(0, Math.floor(finite(row.relic_tier ?? row.relic ?? row.relicTier)));
  const stars = Math.max(0, Math.floor(finite(row.rarity ?? row.stars)));
  const power = Math.max(0, Math.floor(finite(row.galactic_power ?? row.power ?? row.gp)));
  return Object.freeze({
    baseId: clean(row.base_id ?? row.baseId).toUpperCase(),
    name: clean(row.unit_name ?? row.name ?? row.base_id ?? row.baseId),
    stars,
    rarity: stars,
    level: Math.max(0, Math.floor(finite(row.level))),
    gear,
    gearLevel: gear,
    relic,
    relicTier: relic,
    power,
    galacticPower: power,
    lastSyncedAt: clean(row.last_synced_at ?? row.lastSyncedAt),
  });
}

export function compactGuildTbReadinessRoster(guildBody = {}, catalog = []) {
  const relevantCatalog = relevantCatalogRows(catalog);
  const ids = new Set(relevantBaseIds(catalog));
  let returnedUnitRows = 0;
  const members = asArray(guildBody?.members).map((member) => {
    const units = asArray(member?.units)
      .filter((unit) => ids.has(clean(unit?.baseId ?? unit?.base_id).toUpperCase()))
      .map(compactUnit);
    returnedUnitRows += units.length;
    return Object.freeze({ ...member, units: Object.freeze(units), tbReadinessRoster: true });
  });

  return Object.freeze({
    ...guildBody,
    sourceDetail: "supabase-persisted-guild-tb-readiness-compact",
    members: Object.freeze(members),
    tbReadiness: Object.freeze({
      source: "supabase-canonical-compact-progression",
      memberCount: members.length,
      relevantUnitDefinitions: ids.size,
      returnedUnitRows,
      categories: TB_READINESS_CATEGORY_NAMES,
      explicitBaseIds: TB_READINESS_EXPLICIT_BASE_IDS,
    }),
    tbReadinessCatalog: Object.freeze(relevantCatalog),
  });
}

export function createGuildTbReadinessRosterService(options = {}) {
  const canonical = options.canonical || canonicalRosterService;
  const store = options.store || supabaseCoreStore;

  async function selectRelevantUnits(memberIds, baseIds) {
    if (!memberIds.length || !baseIds.length) return [];
    const rows = [];
    let offset = 0;
    while (true) {
      const page = asArray(await store.select("player_units_current", {
        select: "player_id,base_id,unit_name,rarity,level,gear_level,relic_tier,galactic_power,last_synced_at",
        player_id: inFilter(memberIds),
        base_id: inFilter(baseIds),
        order: "player_id.asc,galactic_power.desc,base_id.asc",
        limit: PAGE_SIZE,
        offset,
      }));
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
      if (rows.length >= MAX_ROWS) {
        const error = new Error("Guild TB readiness progression exceeded the compact read safety limit.");
        error.status = 503;
        throw error;
      }
    }
    return rows;
  }

  async function getGuildTbReadinessRosterByPlayer(allyCodeInput) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const [guildBody, catalog] = await Promise.all([
      canonical.getGuildRosterByPlayer(allyCode),
      canonical.getGameUnitCatalog(),
    ]);

    const ids = relevantBaseIds(catalog);
    const members = asArray(guildBody?.members);
    const memberIds = safeInValues(members.map((member) => member?.persistentId), /^[0-9a-fA-F-]{16,64}$/);
    const rows = await selectRelevantUnits(memberIds, ids);
    const unitsByPlayer = new Map();
    for (const row of rows) {
      const playerId = clean(row?.player_id);
      if (!unitsByPlayer.has(playerId)) unitsByPlayer.set(playerId, []);
      unitsByPlayer.get(playerId).push(compactUnit(row));
    }

    const hydrated = {
      ...guildBody,
      members: members.map((member) => Object.freeze({
        ...member,
        units: Object.freeze(unitsByPlayer.get(clean(member?.persistentId)) || []),
      })),
    };
    return compactGuildTbReadinessRoster(hydrated, catalog);
  }

  return Object.freeze({ getGuildTbReadinessRosterByPlayer });
}

export const guildTbReadinessRosterService = createGuildTbReadinessRosterService();

export { compactUnit, normalizeCategory, relevantBaseIds, relevantCatalogRows, unitCategoryKeys };
