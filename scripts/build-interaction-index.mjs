import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInteractionIndex } from "../public/interaction-graph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const RAW_PATH = path.join(DATA_DIR, "effect-graph-index.json");
const OUTPUT_PATH = path.join(DATA_DIR, "interaction-index.json");
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

await writeFile(OUTPUT_PATH, JSON.stringify(index), "utf8");
const manifest = await readJson(MANIFEST_PATH, {});
manifest.interactionSchemaVersion = index.schemaVersion;
manifest.interactionGeneratedAt = index.generatedAt;
manifest.interactionUnitCount = index.unitCount;
manifest.interactionCount = index.interactionCount;
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`[interaction-index] wrote ${index.interactionCount} explicit interaction references across ${index.unitCount} units`);
