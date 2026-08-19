import test from "node:test";
import assert from "node:assert/strict";
import { hybridBoardPlan } from "../public/gac-hybrid-board-plan.js";

function unit(baseId, faction = "JEDI", leader = false, value = 5) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 7,
    power: 30000 + value * 1000,
    speed: 260 + value,
    zetas: 2,
    omicrons: 0,
    factions: [faction],
    abilities: leader ? [{ id: `leader_${baseId}`, type: "Leader" }] : [{ id: `basic_${baseId}`, type: "Basic" }],
  };
}

const own = {
  units: [
    unit("E_LEAD", "JEDI", true, 10), unit("E_2", "JEDI", false, 9), unit("E_3", "JEDI", false, 8),
    unit("H_LEAD", "EMPIRE", true, 7), unit("H_2", "EMPIRE", false, 6), unit("H_3", "EMPIRE", false, 5),
    unit("ALT_LEAD", "SITH", true, 6), unit("ALT_2", "SITH", false, 5), unit("ALT_3", "SITH", false, 4),
  ],
};
const opponent = {
  units: [
    unit("DEF1", "JEDI", true, 4), unit("D12", "JEDI", false, 3), unit("D13", "JEDI", false, 2),
    unit("DEF2", "EMPIRE", true, 4), unit("D22", "EMPIRE", false, 3), unit("D23", "EMPIRE", false, 2),
  ],
};
const entries = [
  { defenseId: 11, defense: { id: 11, leaderBaseId: "DEF1", members: ["DEF1", "D12", "D13"] } },
  { defenseId: 12, defense: { id: 12, leaderBaseId: "DEF2", members: ["DEF2", "D22", "D23"] } },
];
const evidence = {
  DEF1: {
    observations: [{
      enemyLeaderBaseId: "DEF1",
      enemyMembers: ["DEF1", "D12", "D13"],
      counterLeaderBaseId: "E_LEAD",
      counterMembers: ["E_LEAD", "E_2", "E_3"],
      battles: 10,
      wins: 8,
      holds: 2,
      draws: 0,
      winRate: 0.8,
      averageBanners: 61,
      confidence: 0.95,
      source: "combined-evidence",
      evidenceSources: ["c3po-gahistory"],
    }],
  },
};

test("hybrid plan allocates exact historical evidence first then heuristics only on remaining defenses", () => {
  const result = hybridBoardPlan(own, opponent, entries, evidence, { size: 3, beamWidth: 32, candidateLimit: 6 });
  assert.equal(result.evidenceDefenseCount, 1);
  assert.equal(result.heuristicDefenseCount, 1);
  assert.equal(result.assignments.length, 2);
  const first = result.assignments.find((entry) => entry.defenseId === 11);
  const second = result.assignments.find((entry) => entry.defenseId === 12);
  assert.equal(first.source, "historical-counter-evidence");
  assert.deepEqual(first.recommendation.counterMembers, ["E_LEAD", "E_2", "E_3"]);
  assert.equal(second.source, "roster-fit-heuristic");
  const secondIds = new Set(second.recommendation?.squad?.map((unitValue) => unitValue.baseId) || []);
  for (const id of ["E_LEAD", "E_2", "E_3"]) assert.equal(secondIds.has(id), false, `${id} was reused by heuristic fallback`);
});

test("without actionable evidence the existing heuristic planner remains the fallback", () => {
  const result = hybridBoardPlan(own, opponent, entries, {}, { size: 3 });
  assert.equal(result.evidenceDefenseCount, 0);
  assert.equal(result.heuristicDefenseCount, 2);
  assert.equal(result.assignments.every((entry) => entry.source === "roster-fit-heuristic"), true);
});

test("base exclusions apply to both evidence and heuristic phases", () => {
  const result = hybridBoardPlan(own, opponent, entries, evidence, { size: 3, excludeBaseIds: ["E_2"] });
  assert.equal(result.evidenceDefenseCount, 0);
  const selectedIds = result.assignments.flatMap((entry) => entry.recommendation?.squad?.map((unitValue) => unitValue.baseId) || []);
  assert.equal(selectedIds.includes("E_2"), false);
});
