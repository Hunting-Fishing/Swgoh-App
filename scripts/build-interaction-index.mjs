import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInteractionIndex } from "../public/interaction-graph.js";
import { enemyArchetypeCatalog } from "./enemy-kit-normalizer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const RAW_PATH = path.join(DATA_DIR, "effect-graph-index.json");
const ENEMY_KIT_PATH = path.join(DATA_DIR, "enemy-kit-index.json");
const ENEMY_RAW_PATH = path.join(DATA_DIR, "enemy-effect-graph-index.json");
const OUTPUT_PATH = path.join(DATA_DIR, "interaction-index.json");
const ENEMY_OUTPUT_PATH = path.join(DATA_DIR, "enemy-interaction-index.json");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const catalog = await readJson(CATALOG_PATH);
if (!catalog?.units?.length) throw new Error("Catalog is unavailable or empty");
const rawEffectIndex = await readJson(RAW_PATH, null);
const index = buildInteractionIndex(catalog, rawEffectIndex);
if (!index.unitCount) throw new Error("Interaction index normalized to zero units");

const enemyKit = await readJson(ENEMY_KIT_PATH, null);
const enemyRaw = await readJson(ENEMY_RAW_PATH, null);
let enemyIndex = null;
if (enemyKit?.archetypes?.length) {
  enemyIndex = buildInteractionIndex(enemyArchetypeCatalog(enemyKit), enemyRaw, catalog);
}

await writeFile(OUTPUT_PATH, JSON.stringify(index), "utf8");
if (enemyIndex) await writeFile(ENEMY_OUTPUT_PATH, JSON.stringify(enemyIndex), "utf8");

const manifest = await readJson(MANIFEST_PATH, {});
manifest.interactionSchemaVersion = index.schemaVersion;
manifest.interactionGeneratedAt = index.generatedAt;
manifest.interactionUnitCount = index.unitCount;
manifest.interactionCount = index.interactionCount;
if (enemyIndex) {
  manifest.enemyInteractionSchemaVersion = enemyIndex.schemaVersion;
  manifest.enemyInteractionGeneratedAt = enemyIndex.generatedAt;
  manifest.enemyInteractionUnitCount = enemyIndex.unitCount;
  manifest.enemyInteractionCount = enemyIndex.interactionCount;
}
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`[interaction-index] player ${index.interactionCount} references across ${index.unitCount} units${enemyIndex ? `; enemy ${enemyIndex.interactionCount} references across ${enemyIndex.unitCount} archetypes` : ""}`);
