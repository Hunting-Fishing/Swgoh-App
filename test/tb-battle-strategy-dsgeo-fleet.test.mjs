import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { DS_GEO_MISSIONS } from "../public/ds-geo-mission-overrides.js";
import { DS_GEO_FLEET_BATTLE_STRATEGIES, dsGeoFleetBattleStrategyForMission } from "../public/tb-battle-strategy-dsgeo-fleet-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const mission = (id) => DS_GEO_MISSIONS.find((row) => row.id === id);

test("DS Geo fleet resolver owns all five canonical fleet mission ids", () => {
  assert.deepEqual(Object.keys(DS_GEO_FLEET_BATTLE_STRATEGIES), ["c5", "c6", "c12", "c13", "c18"]);
  for (const id of ["c5", "c6", "c12", "c13", "c18"]) {
    assert.equal(dsGeoFleetBattleStrategyForMission(id), DS_GEO_FLEET_BATTLE_STRATEGIES[id]);
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: "geo-separatist", members: [] }, mission(id));
    assert.equal(analysis.available, true, `${id} must resolve through the global engine`);
  }
});

test("Phase 2 fleet packs explicitly reject obsolete capital-ship requirements", () => {
  for (const id of ["c5", "c6"]) {
    const strategy = DS_GEO_FLEET_BATTLE_STRATEGIES[id];
    assert.match(strategy.summary, /Dark Side fleet/i);
    assert.match(JSON.stringify(strategy.stages), /do not enforce the historical Chimaera\/Executrix/i);
    assert.match(strategy.evidenceBoundary, /Phase 2 Dark Side ship-rule update/i);
  }
});

test("Phase 2 and 3 fleets remain partial while Phase 4 fleet is covered", () => {
  for (const id of ["c5", "c6", "c12", "c13"]) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "partial", `${id} should stay partial`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(`${coverage.strategyStatus} ${coverage.confidence}`, /partial/i);
  }

  const p4 = missionStrategyCoverage(mission("c18"));
  assert.equal(p4.coverage, "covered");
  assert.equal(p4.strategyAvailable, true);
  assert.match(p4.strategyId, /c18-dsgeo-fleet-v1/);
});

test("Phase 4 Hound's Tooth route is recommendation evidence, not a hard mission gate", () => {
  const strategy = DS_GEO_FLEET_BATTLE_STRATEGIES.c18;
  const ht = strategy.keyUnits.find((row) => row.baseId === "HOUNDSTOOTH");
  assert.equal(ht.importance, "high");
  assert.match(ht.reason, /not a hard entry requirement/i);
  assert.doesNotMatch(JSON.stringify(strategy), /guaranteed win/i);
  assert.equal("winPercent" in strategy, false);
});

test("DS Geo fleet ids cannot leak into another Territory Battle", () => {
  const fake = { id: "c18", tbId: "hoth-imperial", territoryId: "collision", phase: 4, missionType: "fleet", name: "Synthetic collision" };
  const analysis = evaluateBattleStrategy({ missionId: "c18", tbId: "hoth-imperial", members: [] }, fake);
  assert.equal(analysis.available, false);
});

test("DS Geo fleet strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-dsgeo-fleet-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
