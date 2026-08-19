import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { hybridBoardPlan } from "../public/gac-hybrid-board-plan.js";
import {
  allocationByForecastIndex,
  consumedAttackIds,
  defenderUnits,
  evidenceMapFromBatch,
  forecastEntries,
  leadersForEntries,
  planningContextLabel,
  planningExclusions,
} from "../public/gac-forecast-counter-prestage-model.js";

function unit(baseId, faction, overrides = {}) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 5,
    power: 30000,
    speed: 300,
    zetas: 1,
    omicrons: 0,
    factions: [faction],
    abilities: [{ id: `${baseId}_basic`, type: "Basic", displayTier: 8 }],
    ...overrides,
  };
}

function leader(baseId, faction, overrides = {}) {
  return unit(baseId, faction, {
    abilities: [
      { id: `${baseId}_basic`, type: "Basic", displayTier: 8 },
      { id: `leader_${baseId}`, type: "Leader", displayTier: 8 },
    ],
    ...overrides,
  });
}

function prediction(format, leaderBaseId, members, overrides = {}) {
  return {
    format,
    leaderBaseId,
    members,
    evidenceClass: "battle-recurring",
    battleObservedMatchups: 4,
    verifiedHistoricalBoards: 0,
    observedByPlayers: 2,
    ...overrides,
  };
}

test("forecast entries preserve displayed priority while filtering wrong format, duplicates and malformed squad sizes", () => {
  const report = {
    predictions: [
      prediction("3v3", "FIRST", ["FIRST", "A", "B"], { evidenceClass: "verified-zone-recurring" }),
      prediction("5v5", "WRONG_FORMAT", ["WRONG_FORMAT", "A", "B", "C", "D"]),
      prediction("3v3", "MALFORMED", ["MALFORMED", "A"]),
      prediction("3v3", "SECOND", ["SECOND", "C", "D"]),
      prediction("3v3", "FIRST", ["FIRST", "A", "B"]),
    ],
  };

  const entries = forecastEntries(report, "3", 8);
  assert.deepEqual(entries.map((entry) => entry.defense.leaderBaseId), ["FIRST", "SECOND"]);
  assert.deepEqual(entries.map((entry) => entry.defenseId), [900001, 900002]);
  assert.deepEqual(entries.map((entry) => entry.forecastIndex), [0, 1]);
  assert.equal(entries[0].prediction.evidenceClass, "verified-zone-recurring");
});

test("planning exclusions protect own defense plus attempted and planned attack resources", () => {
  const ownDefenses = [
    { members: ["DEF_A", "DEF_B", "DEF_C"] },
  ];
  const assignments = [
    { status: "win", members: ["WIN_CURRENT"], attemptLog: [{ members: ["USED_A", "USED_B", "USED_C"] }] },
    { status: "planned", members: ["PLAN_A", "PLAN_B", "PLAN_C"], attemptLog: [] },
    { status: "draft", members: ["DRAFT_A", "DRAFT_B", "DRAFT_C"], attemptLog: [] },
  ];

  assert.deepEqual(consumedAttackIds(assignments).sort(), ["PLAN_A", "PLAN_B", "PLAN_C", "USED_A", "USED_B", "USED_C"]);
  const excluded = planningExclusions(ownDefenses, assignments);
  for (const id of ["DEF_A", "DEF_B", "DEF_C", "PLAN_A", "PLAN_B", "PLAN_C", "USED_A", "USED_B", "USED_C"]) {
    assert.equal(excluded.includes(id), true, id);
  }
  assert.equal(excluded.includes("DRAFT_A"), false);
});

test("forecast-wide hybrid allocation does not reuse an attacker across predicted defenses", () => {
  const ownRoster = {
    units: [
      leader("A_LEAD", "Alpha", { relic: 8, power: 42000, speed: 345 }),
      unit("A_2", "Alpha", { relic: 7, power: 38000, speed: 325 }),
      unit("A_3", "Alpha", { relic: 7, power: 37000, speed: 315 }),
      leader("B_LEAD", "Beta", { relic: 8, power: 41500, speed: 340 }),
      unit("B_2", "Beta", { relic: 7, power: 37500, speed: 320 }),
      unit("B_3", "Beta", { relic: 7, power: 36500, speed: 310 }),
      leader("C_LEAD", "Gamma", { relic: 6, power: 33000, speed: 305 }),
      unit("C_2", "Gamma", { relic: 6, power: 32000, speed: 300 }),
      unit("C_3", "Gamma", { relic: 6, power: 31500, speed: 295 }),
    ],
  };
  const opponentRoster = {
    units: [
      leader("X_LEAD", "EnemyX", { relic: 7, power: 36000, speed: 330 }),
      unit("X_2", "EnemyX", { relic: 6, power: 34000, speed: 310 }),
      unit("X_3", "EnemyX", { relic: 6, power: 33000, speed: 300 }),
      leader("Y_LEAD", "EnemyY", { relic: 7, power: 35500, speed: 328 }),
      unit("Y_2", "EnemyY", { relic: 6, power: 33500, speed: 308 }),
      unit("Y_3", "EnemyY", { relic: 6, power: 32500, speed: 298 }),
    ],
  };
  const entries = forecastEntries({
    predictions: [
      prediction("3v3", "X_LEAD", ["X_LEAD", "X_2", "X_3"]),
      prediction("3v3", "Y_LEAD", ["Y_LEAD", "Y_2", "Y_3"]),
    ],
  }, "3", 8);

  const plan = hybridBoardPlan(ownRoster, opponentRoster, entries, new Map(), { size: 3 });
  assert.equal(plan.assignments.length, 2);
  const selectedIds = plan.assignments.flatMap((assignment) => assignment.recommendation?.squad?.map((member) => member.baseId) || []);
  assert.equal(new Set(selectedIds).size, selectedIds.length);
  assert.equal(allocationByForecastIndex(plan).size, 2);
});

test("evidence and defender lookup helpers normalize the forecast planning inputs", () => {
  const entries = forecastEntries({
    predictions: [prediction("3v3", "enemy_lead", ["enemy_lead", "enemy_2", "enemy_3"])],
  }, "3", 8);
  const map = evidenceMapFromBatch({ results: [{ enemyLeaderBaseId: "enemy_lead", observations: [{ battles: 2 }] }] });
  assert.equal(map.has("ENEMY_LEAD"), true);
  assert.deepEqual(leadersForEntries(entries), ["ENEMY_LEAD"]);
  const defenders = defenderUnits(entries[0], {
    units: [unit("ENEMY_LEAD", "Enemy"), unit("ENEMY_2", "Enemy"), unit("ENEMY_3", "Enemy")],
  });
  assert.equal(defenders.length, 3);
});

test("planning context labels distinguish full current-round protection from advisory pre-match context", () => {
  assert.match(planningContextLabel({ round: 3, ownDefenseKnown: true, attackPlanKnown: true }), /FULL CONTEXT/);
  assert.match(planningContextLabel({ round: 3, ownDefenseKnown: true, attackPlanKnown: false }), /PARTIAL CONTEXT/);
  assert.match(planningContextLabel({ round: null }), /PRE-MATCH CONTEXT/);
});

test("forecast counter prestage is browser-activated but contains no persistent write method", async () => {
  const modelSource = await readFile(new URL("../public/gac-defense-forecast-model.js", import.meta.url), "utf8");
  const controllerSource = await readFile(new URL("../public/gac-forecast-counter-prestage.js", import.meta.url), "utf8");
  assert.match(modelSource, /import\("\.\/gac-forecast-counter-prestage\.js"\)/);
  assert.doesNotMatch(controllerSource, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(controllerSource, /import=0/);
  assert.match(controllerSource, /Forecast advisory only · this squad is not locked/);
});
