import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { HOTH_LS_TERRITORIES } from "../public/hoth-ls-data.js";
import { HOTH_LS_FLEET_BATTLE_STRATEGIES, hothLsFleetBattleStrategyForMission } from "../public/tb-battle-strategy-hoth-ls-fleet-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const missions = HOTH_LS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const ids = ["p3-fleet", "p4-fleet", "p5-fleet", "p6-fleet"];

test("Hoth LS fleet resolver owns all four canonical fleet mission ids", () => {
  assert.deepEqual(Object.keys(HOTH_LS_FLEET_BATTLE_STRATEGIES), ids);
  for (const id of ids) {
    assert.equal(hothLsFleetBattleStrategyForMission(id), HOTH_LS_FLEET_BATTLE_STRATEGIES[id]);
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: "hoth-rebel", members: [] }, mission(id));
    assert.equal(analysis.available, true, `${id} should resolve`);
  }
});

test("all Hoth LS fleet packs remain partial while using current Ion Cannon mechanics", () => {
  for (const id of ids) {
    const strategy = HOTH_LS_FLEET_BATTLE_STRATEGIES[id];
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "partial", `${id} should remain partial`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(`${strategy.summary} ${JSON.stringify(strategy.stages)}`, /Ion Cannon Blast/i);
    assert.match(`${strategy.summary} ${JSON.stringify(strategy.stages)}`, /Turn Meter/i);
    assert.match(strategy.evidenceBoundary, /current SWGOH.GG Territory Battle facts/i);
  }
});

test("Home One and Profundity remain recommendations rather than fabricated mission gates", () => {
  for (const strategy of Object.values(HOTH_LS_FLEET_BATTLE_STRATEGIES)) {
    const homeOne = strategy.keyUnits.find((row) => row.baseId === "CAPITALMONCALAMARICRUISER");
    const profundity = strategy.keyUnits.find((row) => row.baseId === "CAPITALPROFUNDITY");
    assert.equal(homeOne?.importance, "helpful");
    assert.equal(profundity?.importance, "helpful");
    assert.ok(!strategy.keyUnits.some((row) => row.importance === "critical"), "generic Hoth LS fleet missions must not invent a named capital-ship gate");
  }
});

test("same p3-fleet id resolves by Territory Battle context", () => {
  const hothLs = evaluateBattleStrategy({ missionId: "p3-fleet", tbId: "hoth-rebel", members: [] }, mission("p3-fleet"));
  assert.equal(hothLs.strategyId, "p3-fleet-hoth-ls-fleet-v1");
  assert.match(hothLs.title, /Contested Airspace/i);

  const hothDsMission = { id: "p3-fleet", tbId: "hoth-imperial", territoryId: "p3-top", phase: 3, missionType: "fleet", name: "Hoth DS collision" };
  const hothDs = evaluateBattleStrategy({ missionId: "p3-fleet", tbId: "hoth-imperial", members: [] }, hothDsMission);
  assert.equal(hothDs.strategyId, "p3-fleet-hoth-ds-fleet-v1");
});

test("Hoth LS fleet packs reject fabricated odds", () => {
  for (const strategy of Object.values(HOTH_LS_FLEET_BATTLE_STRATEGIES)) {
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.ok(strategy.evidenceBoundary);
  }
});

test("Hoth LS fleet strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-hoth-ls-fleet-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
