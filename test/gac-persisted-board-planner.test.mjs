import test from "node:test";
import assert from "node:assert/strict";
import { buildPersistedBoardPlan, reservedBaseIds } from "../public/gac-saved-board-planner.js";

function unit(baseId, value = 1, factions = ["SITH"], leader = false) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    relic: 7 + Math.min(2, value),
    gear: 13,
    power: 30_000 + value * 1_000,
    speed: 260 + value * 4,
    zetas: 2,
    omicrons: value >= 7 ? 1 : 0,
    factions,
    abilities: leader ? [{ id: `leader_${baseId}`, type: "Leader" }] : [{ id: `basic_${baseId}`, type: "Basic" }],
  };
}

const mine = {
  player: { allyCode: "732764286", name: "Warm Bacon", galacticPower: 10_000_000 },
  units: [
    unit("RESERVED_LEAD", 10, ["SITH"], true), unit("RESERVED_2", 9), unit("RESERVED_3", 8),
    unit("GROUP_A_LEAD", 9, ["JEDI"], true), unit("GROUP_A_2", 8, ["JEDI"]), unit("GROUP_A_3", 7, ["JEDI"]),
    unit("GROUP_B_LEAD", 8, ["EMPIRE"], true), unit("GROUP_B_2", 7, ["EMPIRE"]), unit("GROUP_B_3", 6, ["EMPIRE"]),
    unit("GROUP_C_LEAD", 7, ["MANDALORIAN"], true), unit("GROUP_C_2", 6, ["MANDALORIAN"]), unit("GROUP_C_3", 5, ["MANDALORIAN"]),
  ],
};

const opponent = {
  player: { allyCode: "123456789", name: "Navygators", galacticPower: 9_800_000 },
  units: [
    unit("ENEMY_1", 6, ["SITH"], true), unit("ENEMY_2", 5), unit("ENEMY_3", 4),
    unit("ENEMY_4", 6, ["EMPIRE"], true), unit("ENEMY_5", 5, ["EMPIRE"]), unit("ENEMY_6", 4, ["EMPIRE"]),
  ],
};

const enemyGroups = [
  { leaderBaseId: "ENEMY_1", members: ["ENEMY_1", "ENEMY_2", "ENEMY_3"], datacron: { id: "ENEMY-DC-A", level: 9, affixes: [] } },
  { leaderBaseId: "ENEMY_4", members: ["ENEMY_4", "ENEMY_5", "ENEMY_6"], datacron: { id: "ENEMY-DC-B", level: 6, affixes: [] } },
];
const reservedGroups = [
  { leaderBaseId: "RESERVED_LEAD", members: ["RESERVED_LEAD", "RESERVED_2", "RESERVED_3"] },
];

test("reservedBaseIds returns the union of all saved own-board members without duplicates", () => {
  assert.deepEqual(
    reservedBaseIds([
      reservedGroups[0],
      { leaderBaseId: "RESERVED_3", members: ["RESERVED_3", "OTHER_1", "OTHER_2"] },
    ]),
    ["RESERVED_LEAD", "RESERVED_2", "RESERVED_3", "OTHER_1", "OTHER_2"]
  );
});

test("persisted board plan excludes every saved own-board member and never reuses a roster unit", () => {
  const result = buildPersistedBoardPlan(mine, opponent, enemyGroups, reservedGroups, { size: 3, beamWidth: 64, candidateLimit: 10 });
  assert.equal(result.source, "user-confirmed-current-board");
  assert.deepEqual(result.reservedBaseIds, ["RESERVED_LEAD", "RESERVED_2", "RESERVED_3"]);
  assert.equal(result.assignments.length, 2);

  const reserved = new Set(result.reservedBaseIds);
  const used = new Set();
  for (const assignment of result.assignments) {
    assert.ok(assignment.defense);
    if (!assignment.recommendation) continue;
    for (const unitValue of assignment.recommendation.squad) {
      assert.equal(reserved.has(unitValue.baseId), false, `${unitValue.baseId} was reserved but selected`);
      assert.equal(used.has(unitValue.baseId), false, `${unitValue.baseId} was selected twice`);
      used.add(unitValue.baseId);
    }
  }
  assert.ok(used.size >= 3, "expected at least one planned squad after exclusions");
});

test("explicit additional exclusions are combined with saved own-board exclusions", () => {
  const result = buildPersistedBoardPlan(mine, opponent, [enemyGroups[0]], reservedGroups, {
    size: 3,
    excludeBaseIds: ["GROUP_A_LEAD", "GROUP_A_2", "GROUP_A_3"],
  });
  const recommendedIds = new Set(result.assignments[0]?.recommendation?.squad?.map((value) => value.baseId) || []);
  for (const id of ["RESERVED_LEAD", "RESERVED_2", "RESERVED_3", "GROUP_A_LEAD", "GROUP_A_2", "GROUP_A_3"]) {
    assert.equal(recommendedIds.has(id), false);
  }
});
