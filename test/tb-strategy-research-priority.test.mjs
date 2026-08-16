import test from "node:test";
import assert from "node:assert/strict";
import { buildTerritoryBattleResearchQueue, territoryBattleResearchPriority } from "../public/tb-strategy-research-priority.js";

test("missing shard special missions outrank ordinary partial combat", () => {
  const shard = territoryBattleResearchPriority({
    coverage: "missing", missionType: "special", tbId: "geo-separatist", phase: 3,
    missionName: "Special Mission — Wat Tambor Shard", missionId: "s3", strategyAvailable: false,
  });
  const combat = territoryBattleResearchPriority({
    coverage: "partial", missionType: "combat", tbId: "hoth-rebel", phase: 2,
    missionName: "Combat Mission 1", missionId: "p2-cm1", strategyAvailable: true,
    strategyStatus: "mission-planning-partial", stageCount: 4,
  });
  assert.ok(shard.score > combat.score);
  assert.equal(shard.tier, "P0");
});

test("special missions rank ahead of same-evidence ordinary combat", () => {
  const rows = [
    { coverage: "partial", missionType: "combat", tbId: "geo-republic", phase: 2, missionName: "Combat Mission", missionId: "c1", strategyAvailable: true, strategyStatus: "partial", stageCount: 4 },
    { coverage: "partial", missionType: "special", tbId: "geo-republic", phase: 2, missionName: "Special Mission", missionId: "s1", strategyAvailable: true, strategyStatus: "partial", stageCount: 4 },
  ];
  const queue = buildTerritoryBattleResearchQueue(rows);
  assert.equal(queue[0].missionId, "s1");
});

test("covered missions are excluded by default", () => {
  const queue = buildTerritoryBattleResearchQueue([
    { coverage: "covered", missionType: "special", tbId: "rote", phase: 6, missionName: "Covered", missionId: "x" },
    { coverage: "partial", missionType: "combat", tbId: "hoth-rebel", phase: 1, missionName: "Partial", missionId: "y" },
  ]);
  assert.deepEqual(queue.map((row) => row.missionId), ["y"]);
});

test("research queue can scope to one Territory Battle", () => {
  const queue = buildTerritoryBattleResearchQueue([
    { coverage: "partial", missionType: "combat", tbId: "geo-separatist", phase: 1, missionName: "DS Geo", missionId: "a" },
    { coverage: "partial", missionType: "combat", tbId: "geo-republic", phase: 1, missionName: "LS Geo", missionId: "b" },
  ], { tbId: "geo-separatist" });
  assert.deepEqual(queue.map((row) => row.missionId), ["a"]);
});

test("priority engine does not invent win odds", () => {
  const queue = buildTerritoryBattleResearchQueue([
    { coverage: "partial", missionType: "special", tbId: "hoth-imperial", phase: 6, missionName: "Special Mission", missionId: "z", strategyStatus: "partial" },
  ]);
  assert.doesNotMatch(JSON.stringify(queue), /winPercent|guaranteedWin|100% win/i);
});
