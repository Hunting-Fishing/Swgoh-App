import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_SCHEMA_VERSION,
  normalizeAbility,
  normalizeUnit,
  recipeHasUpgradeMaterial,
  tierHas,
  versionKey,
} from "../scripts/sync-gamedata.mjs";

test("current CG ability_mat recipes classify Omega/Zeta/Omicron tiers", () => {
  const omega = { id: "SKILLRECIPE_BASIC_T7", ingredients: [{ id: "GRIND" }, { id: "ability_mat_Omega", minQuantity: 3 }] };
  const zeta = { id: "SKILLRECIPE_UNIQUE_T8", ingredients: [{ id: "ability_mat_Zeta", minQuantity: 20 }] };
  const omicron = { id: "SKILLRECIPE_UNIQUE_T9", ingredients: [{ id: "ability_mat_Omicron", minQuantity: 20 }] };
  const recipes = new Map([
    [omega.id, omega],
    [zeta.id, zeta],
    [omicron.id, omicron],
  ]);

  assert.equal(recipeHasUpgradeMaterial(omega, "omega"), true);
  assert.equal(recipeHasUpgradeMaterial(zeta, "zeta"), true);
  assert.equal(recipeHasUpgradeMaterial(omicron, "omicron"), true);
  assert.equal(tierHas({ recipeId: omega.id }, "omega", recipes), true);
  assert.equal(tierHas({ recipeId: zeta.id }, "zeta", recipes), true);
  assert.equal(tierHas({ recipeId: omicron.id }, "omicron", recipes), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_omega" }, "omega"), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_mk3" }, "omega", recipes), false);
});

test("nested current CG recipe material references are detected", () => {
  const nestedOmega = {
    id: "SKILLRECIPE_BASIC_T7",
    ingredientBundle: {
      entries: [
        { materialReference: { id: "GRIND" }, quantity: 10 },
        { materialReference: { id: "ability_mat_Omega" }, quantity: 3 },
      ],
    },
  };
  const nestedZeta = {
    id: "SKILLRECIPE_UNIQUE_T8",
    costs: { nested: [{ item: { definitionId: "ability_mat_Zeta" }, quantity: 20 }] },
  };
  const nestedOmicron = {
    id: "SKILLRECIPE_UNIQUE_T9",
    payload: { materials: { primary: { materialId: "ability_mat_Omicron" } } },
  };

  assert.equal(recipeHasUpgradeMaterial(nestedOmega, "omega"), true);
  assert.equal(recipeHasUpgradeMaterial(nestedZeta, "zeta"), true);
  assert.equal(recipeHasUpgradeMaterial(nestedOmicron, "omicron"), true);
  assert.equal(recipeHasUpgradeMaterial(nestedOmega, "zeta"), false);
});

test("normalizeAbility preserves exact special-upgrade tiers from referenced recipes", () => {
  const skills = new Map([["special_test", {
    id: "special_test",
    tier: [
      { recipeId: "SKILLRECIPE_BASIC_T2" },
      { recipeId: "SKILLRECIPE_BASIC_T7" },
      { isZetaTier: true, recipeId: "SKILLRECIPE_UNIQUE_T8" },
      { isOmicronTier: true, recipeId: "SKILLRECIPE_UNIQUE_T9" },
    ],
  }]]);
  const recipes = new Map([
    ["SKILLRECIPE_BASIC_T7", {
      id: "SKILLRECIPE_BASIC_T7",
      ingredientBundle: { entries: [{ materialReference: { id: "ability_mat_Omega" } }] },
    }],
    ["SKILLRECIPE_UNIQUE_T8", { id: "SKILLRECIPE_UNIQUE_T8", ingredients: [{ id: "ability_mat_Zeta" }] }],
    ["SKILLRECIPE_UNIQUE_T9", { id: "SKILLRECIPE_UNIQUE_T9", ingredients: [{ id: "ability_mat_Omicron" }] }],
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
  assert.equal(CATALOG_SCHEMA_VERSION, 4);
  const current = versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 3 });
  assert.equal(current, `${CATALOG_SCHEMA_VERSION}|1|2|3`);
  assert.notEqual(current, versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 4 }));
});
