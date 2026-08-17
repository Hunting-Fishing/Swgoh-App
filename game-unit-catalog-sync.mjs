import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = path.join(ROOT, "public", "data", "catalog.json");
const DEFAULT_MANIFEST_PATH = path.join(ROOT, "public", "data", "manifest.json");

function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(asArray(values).map((value) => clean(value)).filter(Boolean))];
}

function finiteInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function combatType(unit = {}) {
  const text = clean(unit.unitType).toLowerCase();
  const numeric = Number(unit.combatType);
  if (text === "ship" || numeric === 2) return "ship";
  if (text === "character" || numeric === 1) return "character";
  return "unknown";
}

function catalogVersion(catalog = {}, manifest = {}) {
  return clean(manifest.versionKey)
    || [manifest.schemaVersion ?? catalog.schemaVersion, manifest.gameVersion ?? catalog.gameVersion, manifest.localeVersion ?? catalog.localeVersion, manifest.assetVersion ?? catalog.assetVersion]
      .map((value) => clean(value))
      .join("|");
}

export function normalizeGameUnitCatalogRow(unit = {}, context = {}) {
  const baseId = clean(unit.baseId || unit.baseID || unit.id).split(":")[0];
  const name = clean(unit.name);
  if (!baseId || !name) return null;

  const categories = uniqueStrings(unit.categories);
  const factions = uniqueStrings(unit.factions);
  const abilities = asArray(unit.abilities).filter((ability) => ability && typeof ability === "object");

  return Object.freeze({
    base_id: baseId,
    name,
    combat_type: combatType(unit),
    alignment: clean(unit.alignment) || null,
    categories,
    image_url: clean(unit.image || unit.imageUrl) || null,
    catalog_version: clean(context.catalogVersion) || null,
    updated_at: context.updatedAt,
    metadata: Object.freeze({
      source: "swgoh-command-center-static-catalog",
      gameVersion: clean(context.gameVersion),
      localeVersion: clean(context.localeVersion),
      assetVersion: clean(context.assetVersion),
      schemaVersion: finiteInteger(context.schemaVersion, 0),
      generatedAt: clean(context.generatedAt),
      description: clean(unit.description),
      unitType: clean(unit.unitType),
      combatType: finiteInteger(unit.combatType, 0),
      role: clean(unit.role),
      factions,
      maxRarity: finiteInteger(unit.maxRarity, 0),
      maxLevel: finiteInteger(unit.maxLevel, 0),
      legend: unit.legend === true,
      obtainable: unit.obtainable === true,
      thumbnailName: clean(unit.thumbnailName),
      crew: uniqueStrings(unit.crew),
      abilities,
      gearTiers: asArray(unit.gearTiers),
    }),
  });
}

export async function readGameUnitCatalog({
  catalogPath = DEFAULT_CATALOG_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
} = {}) {
  const [catalogText, manifestText] = await Promise.all([
    readFile(catalogPath, "utf8"),
    readFile(manifestPath, "utf8"),
  ]);
  const catalog = JSON.parse(catalogText);
  const manifest = JSON.parse(manifestText);
  const units = asArray(catalog?.units);
  if (!units.length) throw new Error("Static game-unit catalog contains no units.");

  const expected = finiteInteger(manifest?.unitCount, 0);
  if (expected && expected !== units.length) {
    throw new Error(`Static game-unit catalog count mismatch (${units.length}/${expected}).`);
  }

  const version = catalogVersion(catalog, manifest);
  if (!version) throw new Error("Static game-unit catalog has no version identity.");

  return Object.freeze({ catalog, manifest, units, version });
}

export async function syncGameUnitCatalog({
  store = supabaseCoreStore,
  catalogPath = DEFAULT_CATALOG_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
  batchSize = 100,
  now = () => new Date(),
} = {}) {
  if (typeof store?.status !== "function" || !store.status()?.configured) {
    const error = new Error("Supabase persistence is not configured for game-unit catalog sync.");
    error.code = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }
  if (typeof store?.upsert !== "function") throw new Error("Supabase game-unit catalog writer is unavailable.");

  const source = await readGameUnitCatalog({ catalogPath, manifestPath });
  const updatedAt = now().toISOString();
  const context = {
    catalogVersion: source.version,
    gameVersion: source.manifest?.gameVersion ?? source.catalog?.gameVersion,
    localeVersion: source.manifest?.localeVersion ?? source.catalog?.localeVersion,
    assetVersion: source.manifest?.assetVersion ?? source.catalog?.assetVersion,
    schemaVersion: source.manifest?.schemaVersion ?? source.catalog?.schemaVersion,
    generatedAt: source.manifest?.generatedAt ?? source.catalog?.generatedAt,
    updatedAt,
  };

  const rows = source.units.map((unit) => normalizeGameUnitCatalogRow(unit, context)).filter(Boolean);
  const baseIds = new Set(rows.map((row) => row.base_id));
  if (rows.length !== source.units.length || baseIds.size !== rows.length) {
    throw new Error(`Static game-unit catalog normalized unsafely (${rows.length} rows / ${baseIds.size} unique Base IDs / ${source.units.length} source units).`);
  }

  const size = Math.max(1, Math.min(500, finiteInteger(batchSize, 100)));
  for (let index = 0; index < rows.length; index += size) {
    await store.upsert("game_units", rows.slice(index, index + size), {
      onConflict: "base_id",
      returning: false,
    });
  }

  return Object.freeze({
    ok: true,
    catalogVersion: source.version,
    gameVersion: clean(context.gameVersion),
    rowsStored: rows.length,
    characterCount: rows.filter((row) => row.combat_type === "character").length,
    shipCount: rows.filter((row) => row.combat_type === "ship").length,
    updatedAt,
  });
}
