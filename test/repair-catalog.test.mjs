import assert from "node:assert/strict";
import test from "node:test";
import { materialIconsOf, materialMapOf, recipeHas, repairAbility } from "../scripts/repair-catalog.mjs";

test("abilityReference replaces generic DEFENSE UP metadata with player-facing ability metadata", () => {
  const strings = {
    DEFENSE_UP_NAME_KEY: "DEFENSE UP",
    REAL_NAME: "Baffling Trick",
    REAL_DESC: "Inflict Confuse.",
  };
  const skillMap = new Map([["basicskill_C3POLEGENDARY", {
    id: "basicskill_C3POLEGENDARY",
    nameKey: "DEFENSE_UP_NAME_KEY",
    icon: "tex.ability_buff_defenseup",
    abilityReference: "basicability_c3po_legendary",
    tier: [{}, {}, {}, {}, {}, {}, {}],
  }]]);
  const abilityMap = new Map([["basicability_c3po_legendary", {
    id: "basicability_c3po_legendary",
    nameKey: "REAL_NAME",
    descKey: "REAL_DESC",
    icon: "tex.ability_c3p0_basic",
  }]]);

  const result = repairAbility(
    { id: "basicskill_C3POLEGENDARY", name: "DEFENSE UP" },
    skillMap,
    abilityMap,
    new Map(),
    new Map(),
    strings,
  );
  assert.equal(result.name, "Baffling Trick");
  assert.equal(result.description, "Inflict Confuse.");
  assert.equal(result.icon, "tex.ability_c3p0_basic");
  assert.equal(result.maxTier, 8);
});

test("opaque modern material ids are classified by current material metadata", () => {
  const strings = { OMEGA_NAME: "Ability Material Omega" };
  const materials = materialMapOf([{ id: "abilitymaterial_mk7", nameKey: "OMEGA_NAME", icon: "tex.ability_material_omega" }]);
  const recipe = { ingredients: [{ id: "abilitymaterial_mk7", quantity: 5 }] };
  assert.equal(recipeHas(recipe, "omega", materials, strings), true);
  assert.equal(recipeHas(recipe, "zeta", materials, strings), false);
});

test("upgrade material icons are derived from material metadata instead of guessed filenames", () => {
  const strings = {
    ZETA_NAME: "Ability Material Zeta",
    OMEGA_NAME: "Ability Material Omega",
    OMICRON_NAME: "Ability Material Omicron",
  };
  const materials = [
    { id: "abilitymaterial_mk6", nameKey: "ZETA_NAME", icon: "tex.current_zeta" },
    { id: "abilitymaterial_mk7", nameKey: "OMEGA_NAME", icon: "tex.current_omega" },
    { id: "abilitymaterial_mk8", nameKey: "OMICRON_NAME", icon: "tex.current_omicron" },
  ];
  const icons = materialIconsOf(materials, strings);
  assert.equal(icons.zeta, "https://game-assets.swgoh.gg/textures/tex.current_zeta.png");
  assert.equal(icons.omega, "https://game-assets.swgoh.gg/textures/tex.current_omega.png");
  assert.equal(icons.omicron, "https://game-assets.swgoh.gg/textures/tex.current_omicron.png");
});
