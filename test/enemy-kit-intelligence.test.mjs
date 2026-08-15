import test from "node:test";
import assert from "node:assert/strict";
import { enemyArchetypeCatalog, normalizeEnemyCatalog } from "../scripts/enemy-kit-normalizer.mjs";
import { buildInteractionIndex } from "../public/interaction-graph.js";

const localizationPayload = {
  data: {
    UNIT_ENEMY_NAME: "Enemy Trooper",
    SKILL_BASIC_NAME: "Enemy Shot",
    SKILL_BASIC_DESC: "Deal damage to target enemy and inflict Stun for 1 turn.",
    SKILL_ALT_NAME: "Commander Link",
    SKILL_ALT_DESC: "If Darth Vader is present, call him to assist.",
  },
};

const skillsPayload = {
  version: "test",
  data: [
    { id: "basic_enemy", nameKey: "SKILL_BASIC_NAME", descKey: "SKILL_BASIC_DESC", skillType: "Basic" },
    { id: "special_enemy", nameKey: "SKILL_ALT_NAME", descKey: "SKILL_ALT_DESC", skillType: "Special" },
  ],
};

test("groups scaled PVE definitions into archetypes by base id and exact skill signature", () => {
  const unitsPayload = {
    version: "test",
    data: [
      { id: "ENEMY:ONE", baseId: "ENEMY", combatType: 1, nameKey: "UNIT_ENEMY_NAME", skillReferenceList: [{ skillId: "basic_enemy" }], categoryIdList: ["affiliation_empire"] },
      { id: "ENEMY:TWO", baseId: "ENEMY", combatType: 1, nameKey: "UNIT_ENEMY_NAME", skillReferenceList: [{ skillId: "basic_enemy" }], categoryIdList: ["affiliation_empire"] },
      { id: "ENEMY:BOSS", baseId: "ENEMY", combatType: 1, nameKey: "UNIT_ENEMY_NAME", skillReferenceList: [{ skillId: "basic_enemy" }, { skillId: "special_enemy" }], categoryIdList: ["affiliation_empire"] },
    ],
  };
  const index = normalizeEnemyCatalog({ unitsPayload, skillsPayload, localizationPayload });
  assert.equal(index.definitionCount, 3);
  assert.equal(index.archetypeCount, 2);
  const normalId = index.definitionToArchetype["ENEMY:ONE"];
  assert.equal(index.definitionToArchetype["ENEMY:TWO"], normalId);
  assert.notEqual(index.definitionToArchetype["ENEMY:BOSS"], normalId);
});

test("enemy archetypes use the same semantic kit model as player units", () => {
  const unitsPayload = { version: "test", data: [{ id: "ENEMY:ONE", baseId: "ENEMY", combatType: 1, nameKey: "UNIT_ENEMY_NAME", skillReferenceList: [{ skillId: "basic_enemy" }] }] };
  const index = normalizeEnemyCatalog({ unitsPayload, skillsPayload, localizationPayload });
  const archetype = index.archetypes[0];
  assert.ok(archetype.abilities[0].semantics.mechanicKinds.includes("damage"));
  assert.ok(archetype.abilities[0].semantics.debuffs.includes("Stun"));
});

test("enemy interaction graph can resolve canonical player names without duplicating PVE identities", () => {
  const unitsPayload = { version: "test", data: [{ id: "ENEMY:BOSS", baseId: "ENEMY", combatType: 1, nameKey: "UNIT_ENEMY_NAME", skillReferenceList: [{ skillId: "special_enemy" }], categoryIdList: ["affiliation_empire"] }] };
  const enemyIndex = normalizeEnemyCatalog({ unitsPayload, skillsPayload, localizationPayload });
  const enemyCatalog = enemyArchetypeCatalog(enemyIndex);
  const canonicalCatalog = {
    units: [
      { baseId: "VADER", name: "Darth Vader", factions: ["Empire", "Sith"] },
      { baseId: "OTHER", name: "Other Unit", factions: ["Empire"] },
    ],
  };
  const interactions = buildInteractionIndex(enemyCatalog, null, canonicalCatalog);
  const links = interactions.units[0].interactions;
  assert.ok(links.some((item) => item.targetType === "unit" && item.targetId === "VADER" && item.relationTypes.includes("assist")));
});

test("enemy archetype catalog uses stable archetype ids as graph node ids", () => {
  const index = normalizeEnemyCatalog({
    unitsPayload: { version: "test", data: [{ id: "ENEMY:ONE", baseId: "ENEMY", combatType: 1, nameKey: "UNIT_ENEMY_NAME", skillReferenceList: [{ skillId: "basic_enemy" }] }] },
    skillsPayload,
    localizationPayload,
  });
  const catalog = enemyArchetypeCatalog(index);
  assert.equal(catalog.units[0].baseId, "ENEMY#1");
});
