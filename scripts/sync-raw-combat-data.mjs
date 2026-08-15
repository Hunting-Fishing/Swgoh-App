import { brotliDecompressSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRawEffectIndex } from "./raw-effect-graph.mjs";
import { enemyArchetypeCatalog, normalizeEnemyCatalog } from "./enemy-kit-normalizer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const OUTPUT_PATH = path.join(DATA_DIR, "effect-graph-index.json");
const ENEMY_KIT_PATH = path.join(DATA_DIR, "enemy-kit-index.json");
const ENEMY_RAW_PATH = path.join(DATA_DIR, "enemy-effect-graph-index.json");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const SOURCE = String(process.env.SWGOH_GAMEDATA_BASE_URL || "https://raw.githubusercontent.com/swgoh-utils/gamedata/main").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.SWGOH_RAW_COMBAT_SYNC_TIMEOUT_MS || 90_000);
const ALLOW_STALE = process.argv.includes("--allow-stale");

function payloadVersion(payload) {
  return String(payload?.version || payload?.gameVersion || "");
}

async function request(url, binary = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: binary ? "application/octet-stream" : "application/json",
        "User-Agent": "swgoh-roster-command-combat-sync",
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertVersionCompatibility(catalog, payloads) {
  const catalogVersion = String(catalog?.gameVersion || "");
  const versions = payloads.map(payloadVersion).filter(Boolean);
  const unique = [...new Set(versions)];
  if (unique.length > 1) throw new Error(`Raw combat datasets disagree on game version: ${unique.join(", ")}`);
  if (catalogVersion && unique[0] && catalogVersion !== unique[0]) {
    throw new Error(`Catalog ${catalogVersion} does not match raw combat data ${unique[0]}`);
  }
  return unique[0] || catalogVersion;
}

async function sync() {
  await mkdir(DATA_DIR, { recursive: true });
  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  console.log(`[raw-combat] syncing player + enemy combat graph for ${catalog.gameVersion || "unknown"}`);

  const [skills, abilities, effectsCompressed, enums, pveUnitsCompressed, localizationCompressed] = await Promise.all([
    request(`${SOURCE}/skill.json`),
    request(`${SOURCE}/ability.json`),
    request(`${SOURCE}/effect.json.br`, true),
    request(`${SOURCE}/enums.json`),
    request(`${SOURCE}/units_pve.json.br`, true),
    request(`${SOURCE}/Loc_ENG_US.txt.json.br`, true),
  ]);
  const effects = JSON.parse(brotliDecompressSync(effectsCompressed).toString("utf8"));
  const pveUnits = JSON.parse(brotliDecompressSync(pveUnitsCompressed).toString("utf8"));
  const localization = JSON.parse(brotliDecompressSync(localizationCompressed).toString("utf8"));
  const gameVersion = assertVersionCompatibility(catalog, [skills, abilities, effects, enums, pveUnits]);

  const index = buildRawEffectIndex({ catalog, skillsPayload: skills, abilitiesPayload: abilities, effectsPayload: effects, enumsPayload: enums });
  index.gameVersion = gameVersion;
  if (!index.coverage.totalAbilities) throw new Error("Raw combat graph found zero catalog abilities");
  if (!index.coverage.linkedAbilities) throw new Error("Raw combat graph linked zero abilities; upstream schema may have changed");

  const enemyIndex = normalizeEnemyCatalog({ unitsPayload: pveUnits, skillsPayload: skills, localizationPayload: localization });
  enemyIndex.gameVersion = gameVersion;
  if (!enemyIndex.archetypeCount) throw new Error("Enemy kit normalization produced zero PVE archetypes");
  const enemyRaw = buildRawEffectIndex({
    catalog: enemyArchetypeCatalog(enemyIndex),
    skillsPayload: skills,
    abilitiesPayload: abilities,
    effectsPayload: effects,
    enumsPayload: enums,
  });
  enemyRaw.gameVersion = gameVersion;

  await Promise.all([
    writeFile(OUTPUT_PATH, JSON.stringify(index), "utf8"),
    writeFile(ENEMY_KIT_PATH, JSON.stringify(enemyIndex), "utf8"),
    writeFile(ENEMY_RAW_PATH, JSON.stringify(enemyRaw), "utf8"),
  ]);

  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    manifest.rawEffectGraphSchemaVersion = index.schemaVersion;
    manifest.rawEffectGraphGeneratedAt = index.generatedAt;
    manifest.rawEffectGraphLinkedAbilities = index.coverage.linkedAbilities;
    manifest.rawEffectGraphTotalAbilities = index.coverage.totalAbilities;
    manifest.rawEffectGraphLinkedPercent = index.coverage.linkedPercent;
    manifest.enemyKitSchemaVersion = enemyIndex.schemaVersion;
    manifest.enemyKitGeneratedAt = enemyIndex.generatedAt;
    manifest.enemyDefinitionCount = enemyIndex.definitionCount;
    manifest.enemyArchetypeCount = enemyIndex.archetypeCount;
    manifest.enemyRawLinkedAbilities = enemyRaw.coverage.linkedAbilities;
    manifest.enemyRawTotalAbilities = enemyRaw.coverage.totalAbilities;
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn(`[raw-combat] manifest update skipped: ${error?.message || error}`);
  }

  console.log(`[raw-combat] player abilities ${index.coverage.linkedAbilities}/${index.coverage.totalAbilities}; enemy archetypes ${enemyIndex.archetypeCount}; enemy abilities ${enemyRaw.coverage.linkedAbilities}/${enemyRaw.coverage.totalAbilities}`);
}

sync().catch(async (error) => {
  if (ALLOW_STALE && await exists(OUTPUT_PATH)) {
    console.warn(`[raw-combat] refresh failed; preserving existing combat indexes: ${error?.message || error}`);
    return;
  }
  console.error(`[raw-combat] ${error?.stack || error}`);
  process.exitCode = 1;
});
