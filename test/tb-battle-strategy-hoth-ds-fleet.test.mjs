import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { HOTH_DS_TERRITORIES } from "../public/hoth-ds-data.js";
import { HOTH_DS_FLEET_BATTLE_STRATEGIES, hothDsFleetBattleStrategyForMission } from "../public/tb-battle-strategy-hoth-ds-fleet-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const missions = HOTH_DS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const ids = ["p3-fleet", "p4-fleet-cm", "p4-fleet-sm", "p5-fleet", "p6-fleet"];

test("Hoth DS fleet resolver owns all five canonical fleet mission ids", () => {
  assert.deepEqual(Object.keys(HOTH_DS_FLEET_BATTLE_STRATEGIES), ids);
  for (const id of ids) {
    assert.equal(hothDsFleetBattleStrategyForMission(id), HOTH_DS_FLEET_BATTLE_STRATEGIES[id]);
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: "hoth-imperial", members: [] }, mission(id));
    assert.equal(analysis.available, true, `${id} should resolve`);
  }
});

test("all Hoth DS fleet packs stay partial until exact current battle sequencing is reverified", () => {
  for (const id of ids) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "partial", `${id} should remain partial`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(`${coverage.strategyStatus} ${coverage.confidence}`, /partial/i);
  }
});

test("Chimaera is a hard gate only on the Phase 4 fleet special", () => {
  const special = HOTH_DS_FLEET_BATTLE_STRATEGIES["p4-fleet-sm"];
  assert.ok(special.keyUnits.some((row) => row.baseId === "CAPITALCHIMAERA" && row.importance === "critical"));

  for (const id of ["p3-fleet", "p4-fleet-cm", "p5-fleet", "p6-fleet"]) {
    const strategy = HOTH_DS_FLEET_BATTLE_STRATEGIES[id];
    const chimaera = strategy.keyUnits.find((row) => row.baseId === "CAPITALCHIMAERA");
    assert.equal(chimaera?.importance, "helpful");
    assert.ok(strategy.keyUnits.some((row) => row.baseId === "CAPITALEXECUTOR" && row.importance === "helpful"));
  }
});

test("same p4-fleet-sm id resolves by Territory Battle context", () => {
  const hothMission = mission("p4-fleet-sm");
  const hoth = evaluateBattleStrategy({ missionId: "p4-fleet-sm", tbId: "hoth-imperial", members: [] }, hothMission);
  assert.equal(hoth.strategyId, "p4-fleet-sm-hoth-ds-fleet-v1");
  assert.match(hoth.title, /Chimaera/i);

  const geoMission = {
    id: "p4-fleet-sm",
    tbId: "geo-republic",
    territoryId: "p4-top",
    phase: 4,
    missionType: "special",
    name: "LS Geo fleet special collision",
  };
  const geo = evaluateBattleStrategy({ missionId: "p4-fleet-sm", tbId: "geo-republic", members: [] }, geoMission);
  assert.equal(geo.strategyId, "p4-fleet-sm-lsgeo-fleet-v1");
  assert.match(geo.title, /Negotiator/i);
});

test("Hoth DS fleet packs reject fabricated odds", () => {
  for (const strategy of Object.values(HOTH_DS_FLEET_BATTLE_STRATEGIES)) {
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.ok(strategy.evidenceBoundary);
  }
});

test("Hoth DS fleet strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-hoth-ds-fleet-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
