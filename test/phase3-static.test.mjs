import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG_SCHEMA_VERSION, normalizeAbility, normalizeUnit, tierHas, versionKey } from "../scripts/sync-gamedata.mjs";

test("ability material recipes classify Omega/Zeta/Omicron tiers", () => {
  const recipes = new Map([
    ["recipe_omega", { id: "recipe_omega", ingredients: [{ id: "abilitymaterial_omega", minQuantity: 3 }] }],
    ["recipe_zeta", { id: "recipe_zeta", ingredients: [{ id: "abilitymaterial_zeta", minQuantity: 20 }] }],
    ["recipe_omicron", { id: "recipe_omicron", ingredients: [{ id: "abilitymaterial_omicron", minQuantity: 20 }] }],
  ]);

  assert.equal(tierHas({ recipeId: "abilitymaterial_omega" }, "omega"), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_zeta" }, "zeta"), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_omicron" }, "omicron"), true);
  assert.equal(tierHas({ recipeId: "recipe_omega" }, "omega", recipes), true);
  assert.equal(tierHas({ recipeId: "recipe_zeta" }, "zeta", recipes), true);
  assert.equal(tierHas({ recipeId: "recipe_omicron" }, "omicron", recipes), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_mk3" }, "omega", recipes), false);
});

test("normalizeAbility preserves exact special-upgrade tiers from referenced recipes", () => {
  const skills = new Map([["special_test", {
    id: "special_test",
    tier: [
      { recipeId: "abilitymaterial_mk3" },
      { recipeId: "recipe_omega" },
      { isZetaTier: true, recipeId: "recipe_zeta" },
      { isOmicronTier: true, recipeId: "recipe_omicron" },
    ],
  }]]);
  const recipes = new Map([
    ["recipe_omega", { id: "recipe_omega", ingredients: [{ id: "abilitymaterial_omega" }] }],
    ["recipe_zeta", { id: "recipe_zeta", ingredients: [{ id: "abilitymaterial_zeta" }] }],
    ["recipe_omicron", { id: "recipe_omicron", ingredients: [{ id: "abilitymaterial_omicron" }] }],
  ]);
  const ability = normalizeAbility({ skillId: "special_test" }, skills, {}, recipes);
  assert.equal(ability.omega, true);
  assert.equal(ability.zeta, true);
  assert.equal(ability.omicron, true);
  assert.deepEqual(ability.upgradeTiers.map(({ tier, omega, zeta, omicron }) => ({ tier, omega, zeta, omicron })), [
    { tier: 2, omega: false, zeta: false, omicron: false },
    { tier: 3, omega: true, zeta: false, omicron: false },
    { tier: 4, omega: false, zeta: true, omicron: false },
    { tier: 5, omega: false, zeta: false, omicron: true },
  ]);
});

test("catalog rejects non-player combat types and explicitly unobtainable units", () => {
  const valid = normalizeUnit({ baseId: "TEST", combatType: 1, obtainable: true }, new Map(), {});
  assert.equal(valid?.unitType, "Character");
  assert.equal(normalizeUnit({ baseId: "NPC", combatType: 3, obtainable: true }, new Map(), {}), null);
  assert.equal(normalizeUnit({ baseId: "LOCKED", combatType: 1, obtainable: false }, new Map(), {}), null);
});

test("version key includes catalog schema and source versions", () => {
  const current = versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 3 });
  assert.equal(current, `${CATALOG_SCHEMA_VERSION}|1|2|3`);
  assert.notEqual(current, versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 4 }));
});
