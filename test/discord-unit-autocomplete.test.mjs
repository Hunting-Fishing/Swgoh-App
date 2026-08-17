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

test("unit autocomplete resolves exact Base ID and human-readable name from the real catalog", async () => {
  resetDiscordUnitAutocompleteCacheForTests();
  const byId = await autocompleteSwgohUnits("JEDIKNIGHTCAL");
  assert.ok(byId.length > 0);
  assert.equal(byId[0].value, "JEDIKNIGHTCAL");
  assert.match(byId[0].name, /Jedi Knight Cal Kestis/i);
  assert.match(byId[0].name, /Character/i);

  const byName = await autocompleteSwgohUnits("Jedi Knight Cal");
  assert.ok(byName.some((choice) => choice.value === "JEDIKNIGHTCAL"));
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
