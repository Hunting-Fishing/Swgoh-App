import { brotliDecompressSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = String(process.env.SWGOH_GAMEDATA_BASE_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main").replace(/\/+$/, "");
const ASSET_BASE = String(process.env.SWGOH_CATALOG_ASSET_BASE_URL || "https://swgoh.gg/static/img/assets").replace(/\/+$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const TIMEOUT_MS = Number(process.env.SWGOH_STATIC_SYNC_TIMEOUT_MS || 60_000);
const ALLOW_STALE = process.argv.includes("--allow-stale");
const CATALOG_SCHEMA_VERSION = 4;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function humanize(value) {
  return String(value || "")
    .replace(/^(unit|skill|ability|category|affiliation|profession|role|alignment)_/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localizationMap(value, depth = 0) {
  if (!isRecord(value) || depth > 5) return {};
  const direct = Object.entries(value).filter(([, child]) => typeof child === "string");
  if (direct.length > 100) return Object.fromEntries(direct);
  for (const key of ["data", "items", "values", "localization", "strings", "entries"]) {
    if (!isRecord(value[key])) continue;
    const nested = localizationMap(value[key], depth + 1);
    if (Object.keys(nested).length) return nested;
  }
  for (const child of Object.values(value)) {
    if (!isRecord(child)) continue;
    const nested = localizationMap(child, depth + 1);
    if (Object.keys(nested).length) return nested;
  }
  return {};
}

function localize(strings, key, fallback = "") {
  const value = strings[String(key || "")];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback) return fallback;
  return humanize(key);
}

function alignmentOf(unit) {
  const value = Number(unit?.forceAlignment ?? unit?.alignment);
  if (value === 2) return "Light";
  if (value === 3) return "Dark";
  if (value === 1) return "Neutral";
  const categories = asArray(unit?.categoryId).join(" ").toLowerCase();
  if (categories.includes("alignment_light")) return "Light";
  if (categories.includes("alignment_dark")) return "Dark";
  if (categories.includes("alignment_neutral")) return "Neutral";
  return "Unknown";
}

function roleOf(unit) {
  const role = asArray(unit?.categoryId).find((category) => /^role_/i.test(String(category)));
  return role ? humanize(role) : Number(unit?.combatType) === 2 ? "Ship" : "Character";
}

function factionsOf(unit) {
  return [...new Set(asArray(unit?.categoryId)
    .filter((category) => /^(affiliation|profession)_/i.test(String(category)))
    .map(humanize)
    .filter(Boolean))]
    .slice(0, 20);
}

function normalizeMaterialId(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function recipeIngredientIds(recipe) {
  if (!isRecord(recipe)) return [];
  const ingredients = []
    .concat(asArray(recipe.ingredients))
    .concat(asArray(recipe.ingredient))
    .concat(asArray(recipe.materialReference))
    .concat(asArray(recipe.materials));

  return ingredients.map((entry) => {
    if (typeof entry === "string") return entry;
    if (!isRecord(entry)) return "";
    return String(entry.id || entry.materialId || entry.itemId || entry.definitionId || "");
  }).filter(Boolean);
}

function recipeHasUpgradeMaterial(recipe, kind) {
  if (!isRecord(recipe)) return false;
  const valid = kind === "omega"
    ? new Set(["abilitymatomega", "abilitymaterialomega"])
    : kind === "zeta"
      ? new Set(["abilitymatzeta", "abilitymaterialzeta"])
      : kind === "omicron"
        ? new Set(["abilitymatomicron", "abilitymaterialomicron"])
        : new Set();
  if (!valid.size) return false;

  const targets = [...valid];
  const directMatch = recipeIngredientIds(recipe)
    .map(normalizeMaterialId)
    .some((token) => valid.has(token) || targets.some((target) => token.endsWith(target)));
  if (directMatch) return true;

  // Current CG recipe payloads can nest material references below ingredient
  // bundles/entries instead of exposing them in the legacy top-level arrays.
  // Scan the normalized recipe as a compatibility layer so those nested
  // ability_mat_Omega/Zeta/Omicron references are not silently missed.
  const compactRecipe = normalizeMaterialId(JSON.stringify(recipe));
  return targets.some((target) => compactRecipe.includes(target));
}

function tierHas(tier, kind, recipeMap = new Map()) {
  if (!isRecord(tier)) return false;
  const recipeId = String(tier.recipeId || tier.recipe?.id || tier.recipeReference || "");
  const recipe = recipeId ? recipeMap.get(recipeId) : null;

  if (kind === "zeta" && tier.isZetaTier === true) return true;
  if (kind === "omicron" && tier.isOmicronTier === true) return true;
  if (kind === "omega" && tier.isOmegaTier === true) return true;
  if (recipe && recipeHasUpgradeMaterial(recipe, kind)) return true;

  // Compatibility with older extracted datasets that encoded the material name
  // directly in the tier/recipe identifier rather than in recipe ingredients.
  const searchable = [
    tier.powerAdditiveTag,
    tier.powerOverrideTag,
    tier.name,
    tier.id,
    tier.tierName,
    recipeId,
  ].filter(Boolean).join(" ");
  const compact = normalizeMaterialId(searchable);

  if (kind === "zeta") return compact.includes("abilitymatzeta") || compact.includes("abilitymaterialzeta");
  if (kind === "omega") return compact.includes("abilitymatomega") || compact.includes("abilitymaterialomega");
  if (kind === "omicron") return compact.includes("abilitymatomicron") || compact.includes("abilitymaterialomicron");
  return false;
}

function skillTiers(skill) {
  return asArray(skill?.tier).concat(asArray(skill?.tierList)).concat(asArray(skill?.tiers));
}

function normalizeAbility(reference, skillMap, strings, recipeMap = new Map()) {
  const skillId = String(reference?.skillId || reference?.id || "").trim();
  if (!skillId) return null;
  const skill = skillMap.get(skillId) || {};
  const tiers = skillTiers(skill);
  const omicronMode = Number(skill?.omicronMode || 0);
  const upgradeTiers = tiers.map((tier, index) => ({
    tier: index + 2,
    zeta: tierHas(tier, "zeta", recipeMap),
    omega: tierHas(tier, "omega", recipeMap),
    omicron: tierHas(tier, "omicron", recipeMap),
  }));

  return {
    id: skillId,
    name: localize(strings, skill?.nameKey || reference?.nameKey, humanize(skillId)),
    description: localize(strings, skill?.descKey || skill?.descriptionKey || reference?.descKey, skill?.description || ""),
    type: humanize(skill?.abilityType || skillId.split("_")[0]),
    maxTier: tiers.length ? tiers.length + 1 : 0,
    zeta: Boolean(skill?.isZeta) || upgradeTiers.some((tier) => tier.zeta),
    omega: upgradeTiers.some((tier) => tier.omega),
    omicron: upgradeTiers.some((tier) => tier.omicron),
    upgradeTiers,
    ...(omicronMode ? { omicronMode } : {}),
    ...(skill?.icon ? { icon: skill.icon } : {}),
  };
}

function normalizeUnit(unit, skillMap, strings, recipeMap = new Map()) {
  const baseId = String(unit?.baseId || unit?.baseID || unit?.id || "").split(":")[0];
  const combatType = Number(unit?.combatType || 0);
  const obtainableTime = String(unit?.obtainableTime ?? "0");
  if (!baseId || ![1, 2].includes(combatType) || unit?.obtainable !== true || obtainableTime !== "0") return null;

  const references = asArray(unit?.skillReference).concat(asArray(unit?.skillReferenceList)).concat(asArray(unit?.skills));
  const abilities = references.map((reference) => normalizeAbility(reference, skillMap, strings, recipeMap)).filter(Boolean);
  const categories = asArray(unit?.categoryId).map(String);
  const crew = asArray(unit?.crew).map((entry) => {
    if (typeof entry === "string") return entry.split(":")[0];
    return String(entry?.unitId || entry?.unitDefId || entry?.baseId || entry?.id || "").split(":")[0];
  }).filter(Boolean);
  const thumbnailName = String(unit?.thumbnailName || unit?.thumbnail || unit?.icon || "");

  return {
    baseId,
    name: localize(strings, unit?.nameKey, humanize(baseId)),
    description: localize(strings, unit?.descKey, ""),
    unitType: combatType === 2 ? "Ship" : "Character",
    combatType,
    alignment: alignmentOf(unit),
    role: roleOf(unit),
    factions: factionsOf(unit),
    categories,
    maxRarity: Number(unit?.maxRarity || 7),
    maxLevel: Number(unit?.maxLevelOverride || 85),
    legend: Boolean(unit?.legend),
    obtainable: true,
    thumbnailName,
    image: thumbnailName ? `${ASSET_BASE}/${encodeURIComponent(thumbnailName)}.png` : "",
    crew,
    abilities,
    gearTiers: asArray(unit?.unitTier).map((tier) => ({
      tier: Number(tier?.tier || 0),
      equipment: asArray(tier?.equipmentSet).map(String),
    })),
  };
}

async function request(url, binary = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: binary ? "application/octet-stream" : "application/json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return null;
  }
}

function versionKey(versions) {
  return [CATALOG_SCHEMA_VERSION, versions?.gameVersion, versions?.localeVersion, versions?.assetVersion]
    .map((value) => String(value || ""))
    .join("|");
}

async function sync() {
  await mkdir(DATA_DIR, { recursive: true });
  const versions = await request(`${SOURCE}/allVersions.json`);
  const currentKey = versionKey(versions);
  const manifest = await readManifest();

  if (manifest?.versionKey === currentKey && !process.argv.includes("--force")) {
    console.log(`[static-data] current ${manifest.gameVersion}; ${manifest.unitCount} units already built`);
    return;
  }

  console.log(`[static-data] building player-obtainable catalog for game ${versions.gameVersion || "unknown"}`);

  const [unitsCompressed, skillsPayload, recipesPayload, localizationCompressed] = await Promise.all([
    request(`${SOURCE}/units.json.br`, true),
    request(`${SOURCE}/skill.json`),
    request(`${SOURCE}/recipe.json`),
    request(`${SOURCE}/Loc_ENG_US.txt.json.br`, true),
  ]);

  const unitsPayload = JSON.parse(brotliDecompressSync(unitsCompressed).toString("utf8"));
  const localizationPayload = JSON.parse(brotliDecompressSync(localizationCompressed).toString("utf8"));
  const strings = localizationMap(localizationPayload);
  const units = asArray(unitsPayload?.data || unitsPayload);
  const skills = asArray(skillsPayload?.data || skillsPayload);
  const recipes = asArray(recipesPayload?.data || recipesPayload);
  const skillMap = new Map(
    skills
      .map((skill) => [String(skill?.id || skill?.skillId || ""), skill])
      .filter(([id]) => id)
  );
  const recipeMap = new Map(
    recipes
      .map((recipe) => [String(recipe?.id || recipe?.recipeId || ""), recipe])
      .filter(([id]) => id)
  );

  const catalogByBaseId = new Map();
  for (const unit of units) {
    const normalized = normalizeUnit(unit, skillMap, strings, recipeMap);
    if (!normalized || catalogByBaseId.has(normalized.baseId)) continue;
    catalogByBaseId.set(normalized.baseId, normalized);
  }

  const catalogUnits = [...catalogByBaseId.values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!catalogUnits.length) throw new Error("Static player-obtainable unit catalog normalized to zero units");

  const generatedAt = new Date().toISOString();
  const catalog = {
    gameVersion: String(versions.gameVersion || unitsPayload?.version || ""),
    localeVersion: String(versions.localeVersion || localizationPayload?.version || ""),
    assetVersion: versions.assetVersion == null ? "" : String(versions.assetVersion),
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt,
    units: catalogUnits,
  };

  const nextManifest = {
    versionKey: currentKey,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    gameVersion: catalog.gameVersion,
    localeVersion: catalog.localeVersion,
    assetVersion: catalog.assetVersion,
    generatedAt,
    unitCount: catalogUnits.length,
    characterCount: catalogUnits.filter((unit) => unit.unitType === "Character").length,
    shipCount: catalogUnits.filter((unit) => unit.unitType === "Ship").length,
    recipeCount: recipes.length,
    source: "swgoh-utils/gamedata:units.json.br+skill.json+recipe.json",
  };

  await writeFile(CATALOG_PATH, JSON.stringify(catalog), "utf8");
  await writeFile(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

  console.log(
    `[static-data] wrote ${catalogUnits.length} player-obtainable units ` +
    `(${nextManifest.characterCount} characters, ${nextManifest.shipCount} ships; ${nextManifest.recipeCount} recipes)`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  sync().catch(async (error) => {
    if (ALLOW_STALE && await fileExists(CATALOG_PATH)) {
      console.warn(`[static-data] refresh failed; serving existing catalog: ${error?.message || error}`);
      return;
    }
    console.error(`[static-data] ${error?.stack || error}`);
    process.exitCode = 1;
  });
}

export {
  CATALOG_SCHEMA_VERSION,
  normalizeAbility,
  normalizeMaterialId,
  normalizeUnit,
  recipeHasUpgradeMaterial,
  recipeIngredientIds,
  tierHas,
  versionKey,
};
