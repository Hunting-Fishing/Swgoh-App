import test from "node:test";
import assert from "node:assert/strict";

import {
  futureScarcityPenalty,
  planBoardCounters,
  rankRosterFitSquads,
} from "../public/gac-counter-engine.js";

function abilitySet(leader = false, tier = 8) {
  return [
    { id: "basic", type: "Basic", displayTier: tier, omega: tier >= 8 },
    { id: leader ? "leader_test" : "special", type: leader ? "Leader" : "Special", displayTier: tier, zeta: tier >= 7 },
    { id: "unique", type: "Unique", displayTier: tier, zeta: tier >= 7 },
  ];
}

function unit(baseId, faction, power, relic = 7, options = {}) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic,
    power,
    speed: options.speed || 280,
    zetas: options.zetas ?? 2,
    omicrons: options.omicrons ?? 0,
    factions: [faction],
    abilities: abilitySet(Boolean(options.leader), options.abilityTier || 8),
  };
}

function candidate(ids, score = 120) {
  return {
    score,
    squad: ids.map((id) => ({ baseId: id })),
  };
}

test("rankRosterFitSquads honors excluded attackers", () => {
  const mine = {
    units: [
      unit("A_LEAD", "Alpha", 42000, 9, { leader: true }),
      unit("A_2", "Alpha", 38000),
      unit("A_3", "Alpha", 37000),
      unit("A_4", "Alpha", 36000),
      unit("A_5", "Alpha", 35000),
      unit("B_LEAD", "Beta", 41000, 8, { leader: true }),
      unit("B_2", "Beta", 37000),
      unit("B_3", "Beta", 36000),
      unit("B_4", "Beta", 35000),
      unit("B_5", "Beta", 34000),
    ],
  };
  const enemy = [
    unit("E_LEAD", "Enemy", 35000, 7, { leader: true }),
    unit("E_2", "Enemy", 33000),
    unit("E_3", "Enemy", 32000),
    unit("E_4", "Enemy", 31000),
    unit("E_5", "Enemy", 30000),
  ];

  const ranked = rankRosterFitSquads(mine, enemy, { size: 5, excludeBaseIds: ["A_LEAD"] });
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((result) => result.squad.every((member) => member.baseId !== "A_LEAD")));
});

test("future scarcity penalty detects when spending a squad destroys the only later counter", () => {
  const chosen = candidate(["A", "B", "C"], 130);
  const future = [{
    candidates: [
      candidate(["A", "D", "E"], 125),
      candidate(["B", "F", "G"], 122),
    ],
  }];
  const result = futureScarcityPenalty(chosen, future, new Set());
  assert.equal(result.endangered, 1);
  assert.ok(result.penalty >= 36);

  const safe = futureScarcityPenalty(candidate(["X", "Y", "Z"], 118), future, new Set());
  assert.equal(safe.endangered, 0);
  assert.equal(safe.penalty, 0);
});

test("whole-board planner never assigns the same attacker twice and excludes defense commitments", () => {
  const mine = {
    units: [
      unit("LOCKED", "Locked", 50000, 9, { leader: true, omicrons: 1 }),
      unit("A_LEAD", "Alpha", 43000, 9, { leader: true }),
      unit("A_2", "Alpha", 39000),
      unit("A_3", "Alpha", 38000),
      unit("A_4", "Alpha", 37000),
      unit("A_5", "Alpha", 36000),
      unit("B_LEAD", "Beta", 42000, 8, { leader: true }),
      unit("B_2", "Beta", 38000),
      unit("B_3", "Beta", 37000),
      unit("B_4", "Beta", 36000),
      unit("B_5", "Beta", 35000),
      unit("C_LEAD", "Gamma", 40500, 8, { leader: true }),
      unit("C_2", "Gamma", 36500),
      unit("C_3", "Gamma", 35500),
      unit("C_4", "Gamma", 34500),
      unit("C_5", "Gamma", 33500),
    ],
  };
  const opponent = {
    units: [
      unit("E1_LEAD", "EnemyOne", 36000, 7, { leader: true }),
      unit("E1_2", "EnemyOne", 34000),
      unit("E1_3", "EnemyOne", 33000),
      unit("E1_4", "EnemyOne", 32000),
      unit("E1_5", "EnemyOne", 31000),
      unit("E2_LEAD", "EnemyTwo", 35500, 7, { leader: true }),
      unit("E2_2", "EnemyTwo", 33500),
      unit("E2_3", "EnemyTwo", 32500),
      unit("E2_4", "EnemyTwo", 31500),
      unit("E2_5", "EnemyTwo", 30500),
    ],
  };
  const defenses = [
    { leaderBaseId: "E1_LEAD", members: ["E1_LEAD", "E1_2", "E1_3", "E1_4", "E1_5"], zone: "FRONT-NORTH", slot: 0 },
    { leaderBaseId: "E2_LEAD", members: ["E2_LEAD", "E2_2", "E2_3", "E2_4", "E2_5"], zone: "FRONT-SOUTH", slot: 0 },
  ];

  const plan = planBoardCounters(mine, opponent, defenses, { size: 5, excludeBaseIds: ["LOCKED"] });
  assert.equal(plan.length, 2);
  const assigned = plan.flatMap((item) => item.recommendation?.squad || []).map((member) => member.baseId);
  assert.equal(assigned.includes("LOCKED"), false);
  assert.equal(new Set(assigned).size, assigned.length, "an attacker was reused across board assignments");
  assert.ok(plan.every((assignment) => typeof assignment.allocationReason === "string"));
  assert.ok(plan.every((assignment) => Number.isFinite(assignment.allocationScore)));
});

test("whole-board planner penalizes strategic reserve usage while keeping it available as a fallback", () => {
  const mine = {
    units: [
      unit("RESERVE_LEAD", "Reserve", 47000, 9, { leader: true, speed: 345 }),
      unit("R2", "Reserve", 43000, 9),
      unit("R3", "Reserve", 42000, 9),
      unit("R4", "Reserve", 41000, 9),
      unit("R5", "Reserve", 40000, 9),
      unit("NORMAL_LEAD", "Normal", 42000, 8, { leader: true, speed: 330 }),
      unit("N2", "Normal", 39000, 8),
      unit("N3", "Normal", 38000, 8),
      unit("N4", "Normal", 37000, 8),
      unit("N5", "Normal", 36000, 8),
    ],
  };
  const opponent = {
    units: [
      unit("E_LEAD", "Enemy", 35000, 7, { leader: true, speed: 290 }),
      unit("E2", "Enemy", 33000, 7),
      unit("E3", "Enemy", 32000, 7),
      unit("E4", "Enemy", 31000, 7),
      unit("E5", "Enemy", 30000, 7),
    ],
  };
  const defenses = [{
    leaderBaseId: "E_LEAD",
    members: ["E_LEAD", "E2", "E3", "E4", "E5"],
    zone: "FRONT",
    slot: 0,
  }];

  const plan = planBoardCounters(mine, opponent, defenses, {
    size: 5,
    reserveBaseIds: ["RESERVE_LEAD"],
    reservePenaltyPerUnit: 45,
  });
  assert.equal(plan.length, 1);
  assert.ok(plan[0].recommendation);
  assert.equal(plan[0].recommendation.reserveUses.includes("RESERVE_LEAD"), false);
});
