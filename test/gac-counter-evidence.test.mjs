import test from "node:test";
import assert from "node:assert/strict";
import { rankEvidenceCounters, wilsonLowerBound } from "../public/gac-counter-evidence.js";

function unit(baseId, overrides = {}) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 7,
    power: 35_000,
    speed: 280,
    zetas: 2,
    omicrons: 0,
    ...overrides,
  };
}

test("Wilson lower bound rewards large reliable samples conservatively", () => {
  const small = wilsonLowerBound(9, 10);
  const large = wilsonLowerBound(900, 1000);
  assert.ok(large > small);
  assert.ok(large < 0.9);
});

test("evidence counter ranker rejects squads not fully owned", () => {
  const own = { units: [unit("A"), unit("B"), unit("C")] };
  const enemy = [unit("E1"), unit("E2"), unit("E3")];
  const observations = [{
    format: "3v3",
    enemyLeaderBaseId: "E1",
    enemyMembers: ["E1", "E2", "E3"],
    counterLeaderBaseId: "A",
    counterMembers: ["A", "B", "MISSING"],
    battles: 1000,
    wins: 950,
  }];
  assert.equal(rankEvidenceCounters(own, enemy, observations, { size: 3 }).length, 0);
});

test("high-sample matching historical counter ranks above weaker evidence", () => {
  const own = { units: [unit("A"), unit("B"), unit("C"), unit("D"), unit("F"), unit("G")] };
  const enemy = [unit("E1"), unit("E2"), unit("E3")];
  const observations = [
    {
      format: "3v3",
      enemyLeaderBaseId: "E1",
      enemyMembers: ["E1", "E2", "E3"],
      counterLeaderBaseId: "A",
      counterMembers: ["A", "B", "C"],
      battles: 1500,
      wins: 1350,
      averageBanners: 52,
      source: "swgoh.gg",
    },
    {
      format: "3v3",
      enemyLeaderBaseId: "E1",
      enemyMembers: ["E1", "E2", "E3"],
      counterLeaderBaseId: "D",
      counterMembers: ["D", "F", "G"],
      battles: 60,
      wins: 45,
      averageBanners: 48,
      source: "community",
    },
  ];
  const ranked = rankEvidenceCounters(own, enemy, observations, { size: 3 });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].squad[0].baseId, "A");
  assert.equal(ranked[0].source, "swgoh.gg");
  assert.equal(ranked[0].confidence, "High-confidence historical counter");
  assert.ok(ranked[0].score > ranked[1].score);
});
