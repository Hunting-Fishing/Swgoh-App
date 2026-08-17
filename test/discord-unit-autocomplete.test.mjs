import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  autocompleteSwgohUnits,
  resetDiscordUnitAutocompleteCacheForTests,
} from "../discord-unit-autocomplete.mjs";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function realCatalogFixture() {
  const body = JSON.parse(await source("public/data/catalog.json"));
  const row = (Array.isArray(body?.units) ? body.units : []).find((unit) => {
    const baseId = String(unit?.baseId || "").trim();
    const name = String(unit?.name || "").trim();
    return /^[A-Z0-9_:-]{2,80}$/.test(baseId) && name.length >= 3 && name.toLowerCase() !== baseId.toLowerCase();
  });
  assert.ok(row, "generated catalog should contain at least one named player-obtainable unit");
  return {
    baseId: String(row.baseId).trim().toUpperCase(),
    name: String(row.name).trim(),
  };
}

test("unit autocomplete resolves exact Base ID and human-readable name from the generated catalog", async () => {
  resetDiscordUnitAutocompleteCacheForTests();
  const fixture = await realCatalogFixture();

  const byId = await autocompleteSwgohUnits(fixture.baseId);
  assert.ok(byId.length > 0);
  assert.equal(byId[0].value, fixture.baseId);
  assert.match(byId[0].name, new RegExp(fixture.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  const byName = await autocompleteSwgohUnits(fixture.name);
  assert.ok(byName.some((choice) => choice.value === fixture.baseId));
});

test("unit autocomplete obeys Discord choice bounds and returns Base IDs as values", async () => {
  const choices = await autocompleteSwgohUnits("", { limit: 25 });
  assert.ok(choices.length > 0 && choices.length <= 25);
  for (const choice of choices) {
    assert.ok(choice.name.length >= 1 && choice.name.length <= 100);
    assert.match(choice.value, /^[A-Z0-9_:-]{2,80}$/);
  }
});

test("Discord router and registration manifest expose preference unit autocomplete", async () => {
  const [router, manifest] = await Promise.all([
    source("discord-interaction-router.mjs"),
    source("scripts/register-discord-tb-commands.mjs"),
  ]);

  assert.match(router, /APPLICATION_COMMAND_AUTOCOMPLETE_TYPE = 4/);
  assert.match(router, /APPLICATION_COMMAND_AUTOCOMPLETE_RESULT_TYPE = 8/);
  assert.match(router, /autocompleteSwgohUnits/);
  assert.match(router, /String\(subcommand\?\.name \|\| ""\)\.toLowerCase\(\) !== "preference"/);
  assert.match(router, /String\(focused\?\.name \|\| ""\)\.toLowerCase\(\) !== "unit"/);

  const preferenceBlock = manifest.slice(manifest.indexOf('name: "preference"'), manifest.indexOf('name: "preferences"'));
  assert.match(preferenceBlock, /name: "unit"/);
  assert.match(preferenceBlock, /autocomplete: true/);
  assert.match(preferenceBlock, /Search SWGOH unit name or Base ID/);
  assert.match(manifest, /name: "activity"/);
});
