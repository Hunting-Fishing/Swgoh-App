import test from "node:test";
import assert from "node:assert/strict";
import { assessDefenseDatacron, exposureLabel } from "../public/gac-defense-datacron-risk.js";

const datacron = {
  id: "enemy-dc-9",
  setId: 19,
  level: 9,
  affixes: [
    {
      tier: 3,
      abilityId: "DC_SPEED",
      abilityName: "Accelerated Assault",
      abilityDescription: "At the start of battle, allies gain 10% Speed and 15% Turn Meter.",
      abilityTextResolved: true,
      targetRule: "RULE_ALL",
      requiredRelicTier: 3,
    },
    {
      tier: 9,
      abilityId: "DC_REVIVE",
      abilityName: "Return to Battle",
      abilityDescription: "The first time this unit is defeated, revive with 50% Health.",
      abilityTextResolved: true,
      targetRule: "RULE_ALL",
      requiredRelicTier: 5,
    },
  ],
};

const squad = [
  { baseId: "LEAD", name: "Leader", relic: 9 },
  { baseId: "ALLY1", name: "Ally 1", relic: 8 },
  { baseId: "ALLY2", name: "Ally 2", relic: 7 },
];

const unitIndex = new Map(squad.map((unit) => [unit.baseId, { baseId: unit.baseId, name: unit.name, alignment: "Dark", categories: ["SITH"] }]));
const datacronCatalog = {
  targetingRules: new Map([
    ["RULE_ALL", { id: "RULE_ALL", includeCategories: [], excludeCategories: [], forceAlignments: [], includeLabels: ["Any Obtainable"] }],
  ]),
  sets: new Map([["19", { id: 19, displayName: "Set 19" }]]),
  templates: new Map(),
  affixes: [],
  abilityAffixes: new Map(),
};

test("enemy defense datacron assessment preserves verified coverage and mechanics without inventing power", () => {
  const result = assessDefenseDatacron(datacron, squad, { unitIndex, datacronCatalog });
  assert.equal(result.selected, true);
  assert.equal(result.source, "user-confirmed-current-board");
  assert.equal(result.datacronId, "enemy-dc-9");
  assert.equal(result.level, 9);
  assert.equal(result.squadSize, 3);
  assert.equal(result.eligibleMembers, 3);
  assert.equal(result.leaderEligible, true);
  assert.ok(result.mechanics.includes("Start of Battle"));
  assert.ok(result.mechanics.includes("Speed"));
  assert.ok(result.mechanics.includes("Turn Meter"));
  assert.ok(result.mechanics.includes("Revive"));
  assert.equal(exposureLabel(result), "ENEMY DATACRON · FULL SQUAD COVERAGE");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "score"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "multiplier"), false);
});

test("no selected enemy datacron stays explicitly unknown", () => {
  const result = assessDefenseDatacron(null, squad, { unitIndex, datacronCatalog });
  assert.equal(result.selected, false);
  assert.equal(result.known, false);
  assert.equal(result.coverage, null);
  assert.equal(exposureLabel(result), "NO ENEMY DATACRON CONFIRMED");
});
