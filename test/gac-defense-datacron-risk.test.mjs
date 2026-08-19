import test from "node:test";
import assert from "node:assert/strict";
import {
  assessDefenseDatacron,
  explicitDatacronReference,
  exposureLabel,
  extractAssignedDefenseDatacrons,
  placementKey,
  resolveAssignedDatacron,
  threatLabel,
} from "../public/gac-defense-datacron-risk.js";

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
  assert.equal(threatLabel(result), "HIGH");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "score"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "multiplier"), false);
});

test("explicit live placement datacron id resolves only that exact opponent inventory instance", () => {
  const event = {
    placements: [
      {
        type: "DEFENSE",
        zone: "FRONT-TOP",
        members: ["LEAD", "ALLY1", "ALLY2"],
        datacronId: "enemy-dc-9",
      },
      {
        type: "DEFENSE",
        zone: "FRONT-BOTTOM",
        members: ["OTHER1", "OTHER2", "OTHER3"],
      },
    ],
  };
  const assignments = extractAssignedDefenseDatacrons(event);
  assert.equal(assignments.size, 1);
  const placement = assignments.get(placementKey(["ALLY2", "LEAD", "ALLY1"]));
  assert.ok(placement);
  assert.equal(placement.source, "explicit-live-placement-reference");
  assert.equal(placement.datacron.id, "enemy-dc-9");

  const resolved = resolveAssignedDatacron(placement.datacron, {
    datacrons: [
      { id: "other-dc", level: 9, affixes: [] },
      datacron,
    ],
  });
  assert.equal(resolved.resolution, "live-roster-id-match");
  assert.equal(resolved.datacron.id, "enemy-dc-9");

  const assessment = assessDefenseDatacron(resolved.datacron, squad, { unitIndex, datacronCatalog }, {
    source: "explicit-live-placement-reference",
  });
  assert.equal(assessment.source, "explicit-live-placement-reference");
  assert.equal(assessment.datacronId, "enemy-dc-9");
  assert.equal(threatLabel(assessment), "HIGH");
});

test("opponent inventory alone never creates a defense assignment", () => {
  const event = {
    placements: [{
      type: "DEFENSE",
      members: ["LEAD", "ALLY1", "ALLY2"],
    }],
  };
  assert.equal(extractAssignedDefenseDatacrons(event).size, 0);
  assert.equal(explicitDatacronReference(event.placements[0]), null);
});

test("embedded live placement datacron is preserved when no stable id is exposed", () => {
  const placement = {
    type: "DEFENSE",
    members: ["LEAD", "ALLY1", "ALLY2"],
    datacron: { setId: 19, level: 6, affixes: [] },
  };
  const reference = explicitDatacronReference(placement);
  assert.ok(reference);
  assert.equal(reference.id, "");
  const resolved = resolveAssignedDatacron(reference, { datacrons: [datacron] });
  assert.equal(resolved.resolution, "embedded-live-placement");
  assert.equal(resolved.datacron.level, 6);
});

test("no selected enemy datacron stays explicitly unknown", () => {
  const result = assessDefenseDatacron(null, squad, { unitIndex, datacronCatalog });
  assert.equal(result.selected, false);
  assert.equal(result.known, false);
  assert.equal(result.coverage, null);
  assert.equal(exposureLabel(result), "NO ENEMY DATACRON CONFIRMED");
  assert.equal(threatLabel(result), "UNKNOWN");
});
