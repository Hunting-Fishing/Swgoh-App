import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAbility, normalizeUnit, tierHas, versionKey } from "../scripts/sync-gamedata.mjs";

test("ability material recipes classify Omega/Zeta/Omicron tiers", () => {
  assert.equal(tierHas({ recipeId: "abilitymaterial_omega" }, "omega"), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_zeta" }, "zeta"), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_omicron" }, "omicron"), true);
  assert.equal(tierHas({ recipeId: "abilitymaterial_mk3" }, "omega"), false);
});

test("normalizeAbility preserves exact special-upgrade tiers", () => {
  const skills = new Map([["special_test", {
    id: "special_test",
    tier: [
      { recipeId: "abilitymaterial_mk3" },
      { recipeId: "abilitymaterial_omega" },
      { isZetaTier: true, recipeId: "abilitymaterial_zeta" },
      { isOmicronTier: true, recipeId: "abilitymaterial_omicron" },
    ],
  }]]);
  const ability = normalizeAbility({ skillId: "special_test" }, skills, {});
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

test("version key changes when any source version changes", () => {
  assert.equal(versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 3 }), "1|2|3");
  assert.notEqual(versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 3 }), versionKey({ gameVersion: 1, localeVersion: 2, assetVersion: 4 }));
});
