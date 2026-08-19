import test from "node:test";
import assert from "node:assert/strict";
import { allocateEvidenceCounters, evidenceReliability } from "../public/gac-evidence-board-allocator.js";

function unit(baseId) {
  return { baseId, unitType: "Character", stars: 7, gear: 13, relic: 7, power: 30000 };
}
function obs(enemyLeader, enemyMembers, counterLeader, counterMembers, battles, wins) {
  return {
    format: "3v3",
    enemyLeaderBaseId: enemyLeader,
    enemyMembers,
    counterLeaderBaseId: counterLeader,
    counterMembers,
    battles,
    wins,
    holds: Math.max(0, battles - wins),
    draws: 0,
    winRate: battles ? wins / battles : 0,
    averageBanners: 60,
    confidence: 0.95,
    source: "combined-evidence",
    evidenceSources: ["c3po-gahistory"],
  };
}

const own = {
  units: [
    unit("A"), unit("B"), unit("C"),
    unit("D"), unit("E"), unit("F"),
    unit("G"), unit("H"), unit("I"),
  ],
};

const d1 = { id: 11, leaderBaseId: "DEF1", members: ["DEF1", "D12", "D13"] };
const d2 = { id: 12, leaderBaseId: "DEF2", members: ["DEF2", "D22", "D23"] };

test("reliability tiers are transparent and hold-heavy evidence is not automatic", () => {
  assert.equal(evidenceReliability({ battles: 10, wins: 8, observedWinRate: 0.8 }).tier, "strong");
  assert.equal(evidenceReliability({ battles: 5, wins: 3, observedWinRate: 0.6 }).tier, "established");
  assert.equal(evidenceReliability({ battles: 2, wins: 1, observedWinRate: 0.5 }).tier, "limited");
  assert.equal(evidenceReliability({ battles: 1, wins: 1, observedWinRate: 1 }).tier, "single-positive");
  assert.equal(evidenceReliability({ battles: 5, wins: 1, observedWinRate: 0.2 }).automatic, false);
  assert.equal(evidenceReliability({ battles: 3, wins: 0, observedWinRate: 0 }).automatic, false);
});

test("allocator auto-picks exact positive evidence and preserves observed statistics", () => {
  const evidence = {
    DEF1: { observations: [obs("DEF1", d1.members, "A", ["A", "B", "C"], 10, 8)] },
  };
  const result = allocateEvidenceCounters(own, [{ defense: d1, defenseId: 11 }], evidence, { size: 3 });
  assert.equal(result.assignments.length, 1);
  const assignment = result.assignments[0];
  assert.equal(assignment.source, "historical-counter-evidence");
  assert.equal(assignment.recommendation.exactTeam, true);
  assert.equal(assignment.recommendation.observedWinRate, 0.8);
  assert.equal(assignment.reliability.tier, "strong");
  assert.deepEqual(assignment.recommendation.counterMembers, ["A", "B", "C"]);
});

test("same-leader variant and hold-heavy exact evidence stay out of automatic allocation", () => {
  const evidence = {
    DEF1: { observations: [
      obs("DEF1", ["DEF1", "OTHER2", "OTHER3"], "A", ["A", "B", "C"], 100, 99),
      obs("DEF1", d1.members, "D", ["D", "E", "F"], 8, 2),
    ] },
  };
  const result = allocateEvidenceCounters(own, [{ defense: d1, defenseId: 11 }], evidence, { size: 3 });
  assert.equal(result.assignments.length, 0);
  assert.equal(result.remainingEntries.length, 1);
});

test("excluded attackers prevent an otherwise exact historical counter from being allocated", () => {
  const evidence = {
    DEF1: { observations: [obs("DEF1", d1.members, "A", ["A", "B", "C"], 10, 8)] },
  };
  const result = allocateEvidenceCounters(own, [{ defense: d1, defenseId: 11 }], evidence, { size: 3, excludeBaseIds: ["B"] });
  assert.equal(result.assignments.length, 0);
});

test("scarcity allocator preserves the only viable squad for a constrained later defense", () => {
  const evidence = {
    DEF1: { observations: [
      obs("DEF1", d1.members, "A", ["A", "B", "C"], 20, 18),
      obs("DEF1", d1.members, "D", ["D", "E", "F"], 8, 6),
    ] },
    DEF2: { observations: [
      obs("DEF2", d2.members, "A", ["A", "B", "C"], 15, 12),
    ] },
  };
  const result = allocateEvidenceCounters(own, [
    { defense: d1, defenseId: 11 },
    { defense: d2, defenseId: 12 },
  ], evidence, { size: 3 });
  assert.equal(result.assignments.length, 2);
  const first = result.assignments.find((entry) => entry.defenseId === 11);
  const second = result.assignments.find((entry) => entry.defenseId === 12);
  assert.deepEqual(first.recommendation.counterMembers, ["D", "E", "F"]);
  assert.deepEqual(second.recommendation.counterMembers, ["A", "B", "C"]);
  assert.equal(new Set(result.newlyUsedBaseIds).size, 6);
});

test("evidence allocation never reuses a counter unit across defenses", () => {
  const evidence = {
    DEF1: { observations: [obs("DEF1", d1.members, "A", ["A", "B", "C"], 10, 9)] },
    DEF2: { observations: [obs("DEF2", d2.members, "A", ["A", "B", "C"], 10, 9)] },
  };
  const result = allocateEvidenceCounters(own, [
    { defense: d1, defenseId: 11 },
    { defense: d2, defenseId: 12 },
  ], evidence, { size: 3 });
  assert.equal(result.assignments.length, 1);
  assert.equal(result.remainingEntries.length, 1);
});
