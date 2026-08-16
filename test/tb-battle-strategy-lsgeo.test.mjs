import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";
import { LS_GEO_BATTLE_STRATEGIES, lsGeoBattleStrategyForMission } from "../public/tb-battle-strategy-lsgeo-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const missions = GEO_LS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);

test("LS Geo ground resolver owns prioritized restricted/special mission ids", () => {
  assert.deepEqual(Object.keys(LS_GEO_BATTLE_STRATEGIES), ["p1-mid-sm", "p2-mid-gas", "p2-bot-sm", "p4-mid-sm", "p4-bot-501"]);
  for (const id of Object.keys(LS_GEO_BATTLE_STRATEGIES)) {
    assert.equal(lsGeoBattleStrategyForMission(id), LS_GEO_BATTLE_STRATEGIES[id]);
    assert.equal(evaluateBattleStrategy({ missionId: id, tbId: "geo-republic", members: [] }, mission(id)).available, true);
  }
});

test("Padme P1 pack protects the mission-specific B2-first rule", () => {
  const strategy = LS_GEO_BATTLE_STRATEGIES["p1-mid-sm"];
  assert.equal(strategy.requiredLeaderBaseId, "PADMEAMIDALA");
  assert.ok(strategy.targetPriorities.some((row) => row.target === "B2 Super Battle Droid" && row.priority === "critical"));
  assert.match(JSON.stringify(strategy.stages), /B2 Super Battle Droid/i);
  assert.match(JSON.stringify(strategy.stages), /Protection Up/i);
  assert.match(JSON.stringify(strategy.stages), /Courage/i);
  assert.equal(missionStrategyCoverage(mission("p1-mid-sm")).coverage, "covered");
});

test("exact GAS+Ahsoka P2 and GAS+501st P4 routes are strategy-covered", () => {
  const p2 = LS_GEO_BATTLE_STRATEGIES["p2-mid-gas"];
  assert.equal(p2.requiredLeaderBaseId, "GENERALSKYWALKER");
  assert.ok(p2.keyUnits.some((row) => row.baseId === "AHSOKATANO" && row.importance === "critical"));
  assert.match(JSON.stringify(p2.stages), /Force Grip/i);
  assert.match(JSON.stringify(p2.stages), /Armor Shred/i);

  const p4 = LS_GEO_BATTLE_STRATEGIES["p4-bot-501"];
  assert.equal(p4.requiredLeaderBaseId, "GENERALSKYWALKER");
  assert.match(JSON.stringify(p4.stages), /Cover/i);
  assert.match(JSON.stringify(p4.keyAbilities), /General of the 501st/i);

  for (const id of ["p2-mid-gas", "p4-bot-501"]) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "covered", `${id} should be covered`);
    assert.equal(coverage.strategyAvailable, true);
  }
});

test("GK/Cody/Clone Sergeant and P4 KAM+Shaak remain explicitly partial", () => {
  for (const id of ["p2-bot-sm", "p4-mid-sm"]) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "partial", `${id} should stay partial`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(`${coverage.strategyStatus} ${coverage.confidence}`, /partial/i);
  }

  const trio = LS_GEO_BATTLE_STRATEGIES["p2-bot-sm"];
  assert.deepEqual(trio.keyUnits.map((row) => row.baseId), ["GENERALKENOBI", "CC2224", "CLONESERGEANTPHASEI"]);
  assert.match(trio.evidenceBoundary, /stays partial/i);
});

test("existing KAM Reek strategy remains covered through the global resolver", () => {
  const kam = missionStrategyCoverage(mission("p3-kam"));
  assert.equal(kam.coverage, "covered");
  assert.equal(kam.strategyAvailable, true);
  assert.equal(kam.strategyId, "p3-kam-v1");
});

test("LS Geo strategy ids do not leak into another Territory Battle context", () => {
  const fake = { id: "p1-mid-sm", tbId: "hoth-rebel", territoryId: "collision", phase: 1, missionType: "special", name: "Synthetic collision" };
  const analysis = evaluateBattleStrategy({ missionId: fake.id, tbId: fake.tbId, members: [] }, fake);
  assert.equal(analysis.available, false);
});

test("LS Geo ground packs preserve evidence boundaries and reject fabricated odds", () => {
  for (const strategy of Object.values(LS_GEO_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.length > 0);
    assert.ok(strategy.stages.length > 0);
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("LS Geo ground strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-lsgeo-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
