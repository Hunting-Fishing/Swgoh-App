import test from "node:test";
import assert from "node:assert/strict";

import { planBoardCounters, rankRosterFitSquads } from "../public/gac-counter-engine.js";

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
    abilities: options.leader ? [{ id: `leader_${baseId}`, type: "Leader" }] : [],
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
});
