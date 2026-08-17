import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeGameUnitAbilityRows, normalizeGameUnitCatalogRow, syncGameUnitCatalog } from "../game-unit-catalog-sync.mjs";

function mockStore(calls) {
  return {
    status: () => ({ configured: true }),
    async upsert(table, rows, options) {
      calls.push({ table, rows: structuredClone(rows), options: structuredClone(options) });
      return [];
    },
  };
}

test("catalog row preserves stable unit identity and rich static intelligence", () => {
  const row = normalizeGameUnitCatalogRow({
    baseId: "UNIT_A",
    name: "Unit A",
    unitType: "Character",
    combatType: 1,
    alignment: "Light",
    categories: ["AFFILIATION_REBEL", "ROLE_ATTACKER", "AFFILIATION_REBEL"],
    factions: ["Rebel"],
    image: "https://assets.example/unit-a.png",
    description: "A unit",
    role: "Attacker",
    maxRarity: 7,
    maxLevel: 85,
    legend: false,
    obtainable: true,
    thumbnailName: "tex.unit_a",
    crew: [],
    abilities: [{ id: "basic_a", zeta: false, omicron: false }],
    gearTiers: [{ tier: 1, equipment: ["eq1"] }],
  }, {
    catalogVersion: "4|game|locale|asset",
    gameVersion: "game",
    localeVersion: "locale",
    assetVersion: "asset",
    schemaVersion: 4,
    generatedAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T01:00:00.000Z",
  });

  assert.equal(row.base_id, "UNIT_A");
  assert.equal(row.combat_type, "character");
  assert.deepEqual(row.categories, ["AFFILIATION_REBEL", "ROLE_ATTACKER"]);
  assert.equal(row.catalog_version, "4|game|locale|asset");
  assert.equal(row.metadata.role, "Attacker");
  assert.deepEqual(row.metadata.factions, ["Rebel"]);
  assert.equal(row.metadata.abilities[0].id, "basic_a");
});

test("ability rows preserve classification evidence for indexed zeta and omicron lookup", () => {
  const rows = normalizeGameUnitAbilityRows({
    baseId: "UNIT_A",
    abilities: [
      { id: "unique_a", name: "Unique A", type: "Unique", maxTier: 8, zeta: true, omega: true, omicron: true, omicronMode: 5, upgradeTiers: [{ tier: 8, omicron: true }] },
    ],
  }, { catalogVersion: "v1", updatedAt: "2026-08-17T01:00:00.000Z" });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].base_id, "UNIT_A");
  assert.equal(rows[0].ability_id, "unique_a");
  assert.equal(rows[0].has_zeta, true);
  assert.equal(rows[0].has_omicron, true);
  assert.equal(rows[0].has_omega, true);
  assert.equal(rows[0].omicron_mode, 5);
  assert.deepEqual(rows[0].metadata.upgradeTiers, [{ tier: 8, omicron: true }]);
});

test("catalog sync validates count and upserts units plus abilities in bounded batches", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-catalog-"));
  const catalogPath = path.join(directory, "catalog.json");
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(catalogPath, JSON.stringify({
    schemaVersion: 4,
    gameVersion: "game-v1",
    localeVersion: "loc-v1",
    assetVersion: "100",
    generatedAt: "2026-08-17T00:00:00.000Z",
    units: [
      { baseId: "CHAR_A", name: "Char A", unitType: "Character", combatType: 1, obtainable: true, abilities: [{ id: "char_a_unique", name: "Unique", zeta: true }] },
      { baseId: "SHIP_A", name: "Ship A", unitType: "Ship", combatType: 2, obtainable: true, abilities: [{ id: "ship_a_unique", name: "Unique", omicron: true }] },
    ],
  }));
  await writeFile(manifestPath, JSON.stringify({
    versionKey: "4|game-v1|loc-v1|100",
    schemaVersion: 4,
    gameVersion: "game-v1",
    localeVersion: "loc-v1",
    assetVersion: "100",
    generatedAt: "2026-08-17T00:00:00.000Z",
    unitCount: 2,
  }));

  const calls = [];
  const result = await syncGameUnitCatalog({
    store: mockStore(calls),
    catalogPath,
    manifestPath,
    batchSize: 1,
    now: () => new Date("2026-08-17T01:00:00.000Z"),
  });

  assert.equal(result.rowsStored, 2);
  assert.equal(result.abilitiesStored, 2);
  assert.equal(result.zetaAbilityCount, 1);
  assert.equal(result.omicronAbilityCount, 1);
  assert.equal(result.characterCount, 1);
  assert.equal(result.shipCount, 1);
  assert.equal(result.catalogVersion, "4|game-v1|loc-v1|100");
  assert.equal(calls.length, 4);
  assert.equal(calls[0].table, "game_units");
  assert.deepEqual(calls[0].options, { onConflict: "base_id", returning: false });
  assert.equal(calls[0].rows[0].base_id, "CHAR_A");
  assert.equal(calls[1].table, "game_units");
  assert.equal(calls[1].rows[0].base_id, "SHIP_A");
  assert.equal(calls[2].table, "game_unit_abilities");
  assert.deepEqual(calls[2].options, { onConflict: "base_id,ability_id", returning: false });
  assert.equal(calls[2].rows[0].ability_id, "char_a_unique");
  assert.equal(calls[3].rows[0].ability_id, "ship_a_unique");
});

test("catalog sync refuses duplicate Base IDs instead of silently overwriting static identity", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-catalog-duplicate-"));
  const catalogPath = path.join(directory, "catalog.json");
  const manifestPath = path.join(directory, "manifest.json");
  await writeFile(catalogPath, JSON.stringify({ units: [
    { baseId: "DUP", name: "One", combatType: 1 },
    { baseId: "DUP", name: "Two", combatType: 1 },
  ] }));
  await writeFile(manifestPath, JSON.stringify({ versionKey: "v1", unitCount: 2 }));

  await assert.rejects(
    syncGameUnitCatalog({ store: mockStore([]), catalogPath, manifestPath }),
    /normalized unsafely/,
  );
});
