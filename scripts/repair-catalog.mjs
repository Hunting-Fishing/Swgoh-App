import { brotliDecompressSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = String(process.env.SWGOH_GAMEDATA_BASE_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main").replace(/\/+$/, "");
const ASSET_BASE = String(process.env.SWGOH_CATALOG_ASSET_BASE_URL || "https://game-assets.swgoh.gg/textures").replace(/\/+$/, "");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "public", "data", "catalog.json");
const MANIFEST_PATH = path.join(ROOT, "public", "data", "manifest.json");
const TIMEOUT_MS = Number(process.env.SWGOH_STATIC_SYNC_TIMEOUT_MS || 60_000);
const SCHEMA_VERSION = 6;
const REPAIR_VERSION = 1;
const ALLOW_STALE = process.argv.includes("--allow-stale");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeAssetName(value) {
  return firstText(value)
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/^textures\//i, "")
    .replace(/\.(png|jpg|jpeg|webp)$/i, "");
}

function assetUrl(value) {
  const name = normalizeAssetName(value);
  return name ? `${ASSET_BASE}/${encodeURIComponent(name)}.png` : "";
}

function localizationMap(value) {
  const strings = Object.create(null);
  const seen = new Set();
  function walk(node, depth = 0) {
    if (node == null || depth > 10) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1);
      return;
    }
    if (!isRecord(node) || seen.has(node)) return;
    seen.add(node);
    for (const [key, child] of Object.entries(node)) {
      if (typeof child === "string") {
        if (key && child.trim()) strings[key] = child.trim();
      } else if (isRecord(child) || Array.isArray(child)) {
        walk(child, depth + 1);
      }
    }
  }
  walk(value);
  return strings;
}

function localize(strings, key, fallback = "") {
  const localized = strings[String(key || "")];
  return typeof localized === "string" && localized.trim() ? localized.trim() : fallback;
}

function compact(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function materialMapOf(materials) {
  return new Map(asArray(materials)
    .map((material) => [firstText(material?.id, material?.materialId, material?.definitionId), material])
    .filter(([id]) => id));
}

function semanticMaterial(materialId, materialMap, strings) {
  const material = materialMap.get(materialId) || {};
  const nameKey = firstText(material.nameKey, material.displayNameKey, material.titleKey);
  const descKey = firstText(material.descKey, material.descriptionKey);
  return [
    materialId,
    material.id,
    material.materialId,
    material.name,
    material.displayName,
    material.description,
    material.icon,
    material.iconKey,
    material.iconName,
    material.texture,
    material.thumbnailName,
    nameKey,
    descKey,
    strings[nameKey],
    strings[descKey],
  ].filter(Boolean).join(" ");
}

function ingredientIds(recipe) {
  const ids = [];
  function add(value) {
    if (typeof value === "string" && value.trim()) ids.push(value.trim());
    else if (isRecord(value)) {
      const id = firstText(value.id, value.materialId, value.itemId, value.definitionId);
      if (id) ids.push(id);
    }
  }
  for (const key of ["ingredients", "ingredient", "materialReference", "materials"]) {
    for (const entry of asArray(recipe?.[key])) add(entry);
  }
  function walk(node, parentKey = "", depth = 0) {
    if (node == null || depth > 8) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, parentKey, depth + 1);
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const context = `${parentKey} ${key}`;
      if (typeof child === "string") {
        const normalized = compact(child);
        if (normalized.startsWith("abilitymaterial") || (/(ingredient|material|item)/i.test(context) && /^(id|materialid|itemid|definitionid)$/i.test(key))) {
          ids.push(child);
        }
      } else {
        walk(child, context, depth + 1);
      }
    }
  }
  walk(recipe);
  return [...new Set(ids)];
}

function recipeHas(recipe, kind, materialMap, strings) {
  if (!isRecord(recipe)) return false;
  for (const id of ingredientIds(recipe)) {
    if (compact(semanticMaterial(id, materialMap, strings)).includes(kind)) return true;
  }
  const legacy = compact(JSON.stringify(recipe));
  return legacy.includes(`abilitymat${kind}`) || legacy.includes(`abilitymaterial${kind}`);
}

function tierHas(tier, kind, recipeMap, materialMap, strings) {
  if (!isRecord(tier)) return false;
  if (kind === "zeta" && tier.isZetaTier === true) return true;
  if (kind === "omega" && tier.isOmegaTier === true) return true;
  if (kind === "omicron" && tier.isOmicronTier === true) return true;
  const recipeId = firstText(tier.recipeId, tier.recipe?.id, tier.recipeReference);
  const recipe = recipeId ? recipeMap.get(recipeId) : null;
  if (recipe && recipeHas(recipe, kind, materialMap, strings)) return true;
  const searchable = compact([tier.id, tier.name, tier.tierName, tier.powerAdditiveTag, tier.powerOverrideTag, recipeId].filter(Boolean).join(" "));
  return searchable.includes(`abilitymat${kind}`) || searchable.includes(`abilitymaterial${kind}`);
}

function skillTiers(skill) {
  return asArray(skill?.tier).concat(asArray(skill?.tierList)).concat(asArray(skill?.tiers));
}

function repairAbility(existing, skillMap, abilityMap, recipeMap, materialMap, strings) {
  const skillId = firstText(existing?.id, existing?.skillId);
  const skill = skillMap.get(skillId) || {};
  const abilityId = firstText(skill.abilityReference, skill.abilityId, existing?.abilityId);
  const ability = abilityId ? abilityMap.get(abilityId) || {} : {};
  const tiers = skillTiers(skill);
  const upgradeTiers = tiers.map((tier, index) => ({
    tier: index + 2,
    zeta: tierHas(tier, "zeta", recipeMap, materialMap, strings),
    omega: tierHas(tier, "omega", recipeMap, materialMap, strings),
    omicron: tierHas(tier, "omicron", recipeMap, materialMap, strings),
  }));
  const nameKey = firstText(ability.nameKey, skill.nameKey, existing?.nameKey);
  const descKey = firstText(ability.descKey, ability.descriptionKey, skill.descKey, skill.descriptionKey);
  const icon = firstText(ability.icon, ability.iconKey, ability.iconName, existing?.icon, skill.icon, skill.iconKey, skill.iconName);
  const name = localize(strings, nameKey, existing?.name || skillId || "Ability");
  const description = localize(strings, descKey, ability.description || existing?.description || "");

  return {
    ...existing,
    id: skillId || existing?.id || "",
    ...(abilityId ? { abilityId } : {}),
    nameKey,
    name,
    description,
    maxTier: tiers.length ? tiers.length + 1 : Number(existing?.maxTier || 0),
    zeta: Boolean(skill.isZeta) || upgradeTiers.some((entry) => entry.zeta),
    omega: upgradeTiers.some((entry) => entry.omega),
    omicron: upgradeTiers.some((entry) => entry.omicron),
    upgradeTiers,
    ...(icon ? { icon: normalizeAssetName(icon), image: assetUrl(icon) } : {}),
  };
}

async function request(url, binary = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: binary ? "application/octet-stream" : "application/json", "User-Agent": "swgoh-roster-command-catalog-repair" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function repair() {
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8").catch(() => "{}"));
  if (Number(catalog.schemaVersion || 0) >= SCHEMA_VERSION && Number(manifest.repairVersion || 0) >= REPAIR_VERSION) {
    console.log(`[catalog-repair] schema ${catalog.schemaVersion} repair ${manifest.repairVersion} already applied`);
    return;
  }

  const [skillsPayload, abilitiesPayload, recipesPayload, materialsPayload, localizationCompressed] = await Promise.all([
    request(`${SOURCE}/skill.json`),
    request(`${SOURCE}/ability.json`),
    request(`${SOURCE}/recipe.json`),
    request(`${SOURCE}/material.json`),
    request(`${SOURCE}/Loc_ENG_US.txt.json.br`, true),
  ]);

  const skills = asArray(skillsPayload?.data || skillsPayload);
  const abilities = asArray(abilitiesPayload?.data || abilitiesPayload);
  const recipes = asArray(recipesPayload?.data || recipesPayload);
  const materials = asArray(materialsPayload?.data || materialsPayload);
  const localizationPayload = JSON.parse(brotliDecompressSync(localizationCompressed).toString("utf8"));
  const strings = localizationMap(localizationPayload);
  const skillMap = new Map(skills.map((item) => [firstText(item?.id, item?.skillId), item]).filter(([id]) => id));
  const abilityMap = new Map(abilities.map((item) => [firstText(item?.id, item?.abilityId), item]).filter(([id]) => id));
  const recipeMap = new Map(recipes.map((item) => [firstText(item?.id, item?.recipeId), item]).filter(([id]) => id));
  const materialMap = materialMapOf(materials);

  let repairedAbilityCount = 0;
  const units = asArray(catalog.units).map((unit) => ({
    ...unit,
    abilities: asArray(unit.abilities).map((existing) => {
      repairedAbilityCount += 1;
      return repairAbility(existing, skillMap, abilityMap, recipeMap, materialMap, strings);
    }),
  }));

  const allAbilities = units.flatMap((unit) => asArray(unit.abilities));
  const defenseUp = allAbilities.filter((ability) => String(ability.name || "").trim().toUpperCase() === "DEFENSE UP").length;
  if (allAbilities.length > 100 && defenseUp > allAbilities.length * 0.1) {
    throw new Error(`ability metadata integrity failed: ${defenseUp}/${allAbilities.length} still resolve to DEFENSE UP`);
  }

  const repairedCatalog = { ...catalog, schemaVersion: SCHEMA_VERSION, repairedAt: new Date().toISOString(), units };
  const repairedManifest = {
    ...manifest,
    schemaVersion: SCHEMA_VERSION,
    repairVersion: REPAIR_VERSION,
    repairedAt: repairedCatalog.repairedAt,
    repairedAbilityCount,
    abilityDefinitionCount: abilities.length,
    materialDefinitionCount: materials.length,
  };
  await writeFile(CATALOG_PATH, JSON.stringify(repairedCatalog), "utf8");
  await writeFile(MANIFEST_PATH, `${JSON.stringify(repairedManifest, null, 2)}\n`, "utf8");
  console.log(`[catalog-repair] schema ${SCHEMA_VERSION}: repaired ${repairedAbilityCount} ability records`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  repair().catch((error) => {
    if (ALLOW_STALE) console.error(`[catalog-repair] refresh failed: ${error?.stack || error}`);
    else console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

export { ingredientIds, localizationMap, materialMapOf, recipeHas, repairAbility, tierHas };
