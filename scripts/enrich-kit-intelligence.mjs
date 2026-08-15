import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichCatalogWithKitSemantics } from "../public/kit-semantics.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const KIT_INDEX_PATH = path.join(DATA_DIR, "kit-index.json");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");

const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
const enriched = enrichCatalogWithKitSemantics(catalog);

const indexUnits = enriched.units.map((unit) => ({
  baseId: unit.baseId,
  name: unit.name,
  unitType: unit.unitType,
  alignment: unit.alignment,
  role: unit.role,
  factions: unit.factions || [],
  kit: unit.kit,
  abilities: (unit.abilities || []).map((ability) => ({
    id: ability.id,
    name: ability.name,
    type: ability.type,
    maxTier: ability.maxTier,
    zeta: Boolean(ability.zeta),
    omega: Boolean(ability.omega),
    omicron: Boolean(ability.omicron),
    ...(ability.omicronMode ? { omicronMode: ability.omicronMode } : {}),
    semantics: ability.semantics,
  })),
}));

const kitIndex = {
  schemaVersion: 1,
  gameVersion: enriched.gameVersion || "",
  generatedAt: new Date().toISOString(),
  source: "swgoh-utils/gamedata localized ability descriptions",
  methodology: "deterministic explicit-text extraction; no inferred win rates or hidden mechanics",
  unitCount: indexUnits.length,
  units: indexUnits,
};

// Keep catalog.json lean because every app user loads it. The semantic expansion is
// published separately and can be fetched only by combat/analysis features that need it.
await writeFile(KIT_INDEX_PATH, JSON.stringify(kitIndex), "utf8");

try {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  manifest.kitSchemaVersion = 1;
  manifest.kitIndexGeneratedAt = kitIndex.generatedAt;
  manifest.kitUnitCount = kitIndex.unitCount;
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
} catch {
  // Catalog remains usable even if a legacy manifest is unavailable.
}

console.log(`[kit-intelligence] indexed ${indexUnits.length} units for game ${kitIndex.gameVersion || "unknown"} without expanding catalog.json`);
