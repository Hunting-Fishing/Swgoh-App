import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentStatusLabel,
  buildOpenWarRoomPlan,
  consumedBaseIds,
  isOpenDefenseStatus,
  ownDefenseBaseIds,
  recommendationPayload,
} from "../public/gac-round-war-room.js";

function unit(baseId, value = 1, factions = ["JEDI"], leader = false) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    relic: 6 + Math.min(3, value),
    gear: 13,
    power: 28_000 + value * 1_100,
    speed: 245 + value * 6,
    zetas: 2,
    omicrons: value >= 8 ? 1 : 0,
    factions,
    abilities: leader ? [{ id: `leader_${baseId}`, type: "Leader" }] : [{ id: `basic_${baseId}`, type: "Basic" }],
  };
}

const mine = {
  player: { allyCode: "732764286", name: "Warm Bacon" },
  units: [
    unit("HOME_LEAD", 10, ["SITH"], true), unit("HOME_2", 9, ["SITH"]), unit("HOME_3", 8, ["SITH"]),
    unit("A_LEAD", 10, ["JEDI"], true), unit("A_2", 9, ["JEDI"]), unit("A_3", 8, ["JEDI"]),
    unit("B_LEAD", 9, ["EMPIRE"], true), unit("B_2", 8, ["EMPIRE"]), unit("B_3", 7, ["EMPIRE"]),
    unit("C_LEAD", 8, ["MANDALORIAN"], true), unit("C_2", 7, ["MANDALORIAN"]), unit("C_3", 6, ["MANDALORIAN"]),
    unit("D_LEAD", 7, ["REBEL"], true), unit("D_2", 6, ["REBEL"]), unit("D_3", 5, ["REBEL"]),
  ],
};

const opponent = {
  player: { allyCode: "123456789", name: "Navygators" },
  units: [
    unit("ENEMY_A", 7, ["SITH"], true), unit("ENEMY_A2", 6, ["SITH"]), unit("ENEMY_A3", 5, ["SITH"]),
    unit("ENEMY_B", 7, ["EMPIRE"], true), unit("ENEMY_B2", 6, ["EMPIRE"]), unit("ENEMY_B3", 5, ["EMPIRE"]),
  ],
};

const defenses = [
  { id: 44, leaderBaseId: "ENEMY_A", members: ["ENEMY_A", "ENEMY_A2", "ENEMY_A3"], zone: "FRONT-TOP" },
  { id: 45, leaderBaseId: "ENEMY_B", members: ["ENEMY_B", "ENEMY_B2", "ENEMY_B3"], zone: "FRONT-BOTTOM" },
];
const ownDefenses = [
  { id: 70, leaderBaseId: "HOME_LEAD", members: ["HOME_LEAD", "HOME_2", "HOME_3"] },
];

function selectedIds(plan) {
  return new Set(plan.assignments.flatMap((entry) => entry.recommendation?.squad?.map((unitValue) => unitValue.baseId) || []));
}

test("status classifier keeps only unplanned, loss and abandoned defenses open for fresh allocation", () => {
  assert.equal(isOpenDefenseStatus(""), true);
  assert.equal(isOpenDefenseStatus("loss"), true);
  assert.equal(isOpenDefenseStatus("abandoned"), true);
  assert.equal(isOpenDefenseStatus("planned"), false);
  assert.equal(isOpenDefenseStatus("attempted"), false);
  assert.equal(isOpenDefenseStatus("win"), false);
});

test("active locked defense is removed from fresh allocation and its attackers are unavailable elsewhere", () => {
  const assignments = [{
    id: 1,
    defenseId: 44,
    status: "planned",
    members: ["A_LEAD", "A_2", "A_3"],
    attemptLog: [],
  }];
  const result = buildOpenWarRoomPlan(mine, opponent, defenses, ownDefenses, assignments, { size: 3, beamWidth: 64, candidateLimit: 10 });
  assert.deepEqual(result.openDefenseIds, [45]);
  for (const id of ["HOME_LEAD", "HOME_2", "HOME_3", "A_LEAD", "A_2", "A_3"]) {
    assert.ok(result.unavailableBaseIds.includes(id), `${id} should be unavailable`);
  }
  const used = selectedIds(result);
  for (const id of ["A_LEAD", "A_2", "A_3"]) assert.equal(used.has(id), false);
});

test("cleared defense consumes no new allocation but its winning squad stays used for the round", () => {
  const assignments = [{
    id: 1,
    defenseId: 44,
    status: "win",
    members: ["A_LEAD", "A_2", "A_3"],
    attemptLog: [{ status: "win", members: ["A_LEAD", "A_2", "A_3"], banners: 65 }],
  }];
  const result = buildOpenWarRoomPlan(mine, opponent, defenses, ownDefenses, assignments, { size: 3 });
  assert.deepEqual(result.openDefenseIds, [45]);
  assert.ok(result.unavailableBaseIds.includes("A_LEAD"));
  assert.equal(selectedIds(result).has("A_LEAD"), false);
});

test("lost defense reopens for a retry while every failed attacker remains consumed", () => {
  const assignments = [{
    id: 1,
    defenseId: 44,
    status: "loss",
    members: ["A_LEAD", "A_2", "A_3"],
    attemptLog: [{ status: "loss", members: ["A_LEAD", "A_2", "A_3"], banners: 0 }],
  }];
  const result = buildOpenWarRoomPlan(mine, opponent, defenses, ownDefenses, assignments, { size: 3, beamWidth: 64, candidateLimit: 10 });
  assert.deepEqual(result.openDefenseIds, [44, 45]);
  const used = selectedIds(result);
  for (const id of ["A_LEAD", "A_2", "A_3"]) {
    assert.ok(result.unavailableBaseIds.includes(id));
    assert.equal(used.has(id), false, `${id} was already lost and must not be recommended again`);
  }
});

test("abandoned unattempted plan reopens the defense and releases its former attackers", () => {
  const assignments = [{
    id: 1,
    defenseId: 44,
    status: "abandoned",
    members: ["A_LEAD", "A_2", "A_3"],
    attemptLog: [],
  }];
  const result = buildOpenWarRoomPlan(mine, opponent, defenses, ownDefenses, assignments, { size: 3 });
  assert.deepEqual(result.openDefenseIds, [44, 45]);
  assert.equal(result.unavailableBaseIds.includes("A_LEAD"), false);
});

test("consumed and own-defense helpers preserve operational unavailability boundaries", () => {
  assert.deepEqual(ownDefenseBaseIds(ownDefenses), ["HOME_LEAD", "HOME_2", "HOME_3"]);
  assert.deepEqual(
    consumedBaseIds([
      { status: "attempted", members: ["A_LEAD", "A_2", "A_3"], attemptLog: [] },
      { status: "loss", members: ["B_LEAD", "B_2", "B_3"], attemptLog: [{ status: "loss", members: ["B_LEAD", "B_2", "B_3"] }] },
    ]),
    ["A_LEAD", "A_2", "A_3", "B_LEAD", "B_2", "B_3"]
  );
});

test("card payload requires an exact saved defense id and complete recommendation metadata", () => {
  const payload = recommendationPayload({ dataset: {
    defenseId: "44",
    recommendedAttackerMembers: "A_LEAD,A_2,A_3",
    recommendedAttackerLeader: "A_LEAD",
    recommendedDatacronId: "OWN-DC-9",
  } });
  assert.equal(payload.defenseId, 44);
  assert.deepEqual(payload.members, ["A_LEAD", "A_2", "A_3"]);
  assert.equal(payload.leaderBaseId, "A_LEAD");
  assert.equal(payload.datacronId, "OWN-DC-9");
  assert.equal(recommendationPayload({ dataset: { defenseId: "0" } }), null);
});

test("status labels are explicit enough for the operational UI", () => {
  assert.equal(assignmentStatusLabel({ status: "planned" }), "LOCKED PLAN");
  assert.equal(assignmentStatusLabel({ status: "attempted" }), "ATTEMPT IN PROGRESS");
  assert.equal(assignmentStatusLabel({ status: "win" }), "CLEARED");
  assert.equal(assignmentStatusLabel({ status: "loss" }), "FAILED · REPLAN");
});
