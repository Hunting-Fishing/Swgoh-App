import test from "node:test";
import assert from "node:assert/strict";
import { buildRawEffectIndex, crossValidateDescriptionSemantics, invertEnums, normalizeRawEffect } from "../scripts/raw-effect-graph.mjs";

const enums = {
  data: {
    EffectType: { EffectType_DEFAULT: 0, DAMAGE: 1, DISPELL: 5, REVIVE_UNIT: 13, SUMMON_UNIT: 24, MODIFY_COOLDOWN: 37 },
    EffectApplyType: { EffectApplyType_DEFAULT: 0, UNAVOIDABLE: 1, PHYSICAL: 2, MENTAL: 3 },
    EffectDamageType: { EffectDamageType_DEFAULT: 0, UNMITIGABLE: 1, ATTACK_DAMAGE: 2, ABILITY_POWER: 3 },
    EffectTargetBattleSide: { EffectTargetBattleSide_DEFAULT: 0, BOTH_SIDES: 1, ALLY_SIDE: 2, ENEMY_SIDE: 3 },
    EffectTargetUnitSelect: { EffectTargetUnitSelect_DEFAULT: 0, SELECT_ALL: 1, SELECTED_TARGET: 2, SELECT_SELF: 4 },
    ConditionType: { ConditionType_DEFAULT: 0, START_OF_BATTLE: 4, START_OF_TURN: 25 },
  },
};

test("decodes effect enums and preserves explicit targeting evidence", () => {
  const enumIndex = invertEnums(enums);
  const node = normalizeRawEffect({
    id: "effect_damage",
    type: 1,
    applyType: 1,
    damageType: 2,
    target: { battleSide: 3, unitSelect: 2 },
    conditionType: 25,
  }, enumIndex, new Set(["effect_damage"]));
  assert.equal(node.effectType, "DAMAGE");
  assert.equal(node.semantic, "damage");
  assert.equal(node.applyType, "UNAVOIDABLE");
  assert.equal(node.damageType, "ATTACK_DAMAGE");
  assert.equal(node.targetSide, "ENEMY_SIDE");
  assert.equal(node.targetSelect, "SELECTED_TARGET");
  assert.equal(node.conditionType, "START_OF_TURN");
});

test("follows the documented skill→ability→effect graph and nested effect references", () => {
  const catalog = {
    gameVersion: "test",
    units: [{
      baseId: "TESTUNIT",
      name: "Test Unit",
      unitType: "Character",
      abilities: [{ id: "skill_test", name: "Test Special", semantics: { abilityType: "special", mechanicKinds: ["damage", "revive"] } }],
    }],
  };
  const skillsPayload = { data: [{ id: "skill_test", abilityReference: "ability_test" }] };
  const abilitiesPayload = { data: [{ id: "ability_test", effectReference: [{ id: "effect_damage" }] }] };
  const effectsPayload = { data: [
    { id: "effect_damage", type: 1, chainedEffect: "effect_revive" },
    { id: "effect_revive", type: 13 },
  ] };
  const index = buildRawEffectIndex({ catalog, skillsPayload, abilitiesPayload, effectsPayload, enumsPayload: enums });
  const ability = index.units[0].abilities[0];
  assert.equal(ability.status, "linked");
  assert.equal(ability.abilityId, "ability_test");
  assert.deepEqual(ability.rootEffectIds, ["effect_damage"]);
  assert.deepEqual(ability.effects.map((effect) => effect.id), ["effect_damage", "effect_revive"]);
  assert.deepEqual(ability.validation.confirmedDescriptionKinds.sort(), ["damage", "revive"]);
  assert.equal(index.coverage.linkedAbilities, 1);
});

test("missing raw definitions fail visibly instead of inventing mechanics", () => {
  const index = buildRawEffectIndex({
    catalog: { units: [{ baseId: "A", name: "A", abilities: [{ id: "missing_skill", name: "Missing" }] }] },
    skillsPayload: { data: [] },
    abilitiesPayload: { data: [] },
    effectsPayload: { data: [] },
    enumsPayload: enums,
  });
  assert.equal(index.units[0].abilities[0].status, "missing-skill");
  assert.equal(index.coverage.linkedAbilities, 0);
  assert.equal(index.coverage.missingSkillCount, 1);
});

test("cross-validation does not claim raw confirmation where no compatible raw type exists", () => {
  const result = crossValidateDescriptionSemantics({ mechanicKinds: ["assist", "revive"] }, [
    { semantic: "revive" },
  ]);
  assert.deepEqual(result.confirmedDescriptionKinds, ["revive"]);
  assert.ok(result.descriptionOnly.includes("assist"));
});
