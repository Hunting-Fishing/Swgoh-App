import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";
import { LS_GEO_FLEET_BATTLE_STRATEGIES, lsGeoFleetBattleStrategyForMission } from "../public/tb-battle-strategy-lsgeo-fleet-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const missions = GEO_LS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const fleetIds = ["p1-fleet", "p2-fleet-cm", "p2-fleet-sm", "p3-fleet-cm", "p3-fleet-sm", "p4-fleet-cm", "p4-fleet-sm"];

test("LS Geo fleet resolver owns all seven fleet combat/special nodes", () => {
  assert.deepEqual(Object.keys(LS_GEO_FLEET_BATTLE_STRATEGIES), fleetIds);
  for (const id of fleetIds) {
    assert.equal(lsGeoFleetBattleStrategyForMission(id), LS_GEO_FLEET_BATTLE_STRATEGIES[id]);
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: "geo-republic", members: [] }, mission(id));
    assert.equal(analysis.available, true, `${id} should resolve`);
  }
});

test("all LS Geo fleet packs remain partial until exact battle sequencing is reverified", () => {
  for (const id of fleetIds) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "partial", `${id} should remain partial`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(`${coverage.strategyStatus} ${coverage.confidence}`, /partial/i);
  }
});

test("named fleet entry requirements are kept separate from recommendations", () => {
  const p3 = LS_GEO_FLEET_BATTLE_STRATEGIES["p3-fleet-sm"];
  assert.ok(p3.keyUnits.some((row) => row.baseId === "JEDISTARFIGHTERANAKIN" && row.importance === "critical"));
  assert.ok(p3.keyUnits.some((row) => row.baseId === "CAPITALNEGOTIATOR" && row.importance === "helpful"));

  const p4 = LS_GEO_FLEET_BATTLE_STRATEGIES["p4-fleet-sm"];
  assert.ok(p4.keyUnits.some((row) => row.baseId === "CAPITALNEGOTIATOR" && row.importance === "critical"));
  assert.ok(p4.keyUnits.some((row) => row.baseId === "JEDISTARFIGHTERANAKIN" && row.importance === "critical"));
});

test("Phase 3 tested Negotiator evidence does not fabricate a fixed route", () => {
  const p3 = LS_GEO_FLEET_BATTLE_STRATEGIES["p3-fleet-cm"];
  assert.match(p3.confidence, /community-tested-route-partial/i);
  assert.match(p3.evidenceBoundary, /Phase 3 has direct community-tested Negotiator ships-zone evidence/i);
  assert.match(JSON.stringify(p3.stages), /adaptive reinforcement/i);
  assert.equal("winPercent" in p3, false);
});

test("LS Geo fleet ids do not leak to another TB context", () => {
  const fake = { id: "p4-fleet-sm", tbId: "hoth-rebel", territoryId: "collision", phase: 4, missionType: "special", name: "Synthetic collision" };
  const analysis = evaluateBattleStrategy({ missionId: fake.id, tbId: fake.tbId, members: [] }, fake);
  assert.equal(analysis.available, false);
});

test("LS Geo fleet modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-lsgeo-fleet-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
