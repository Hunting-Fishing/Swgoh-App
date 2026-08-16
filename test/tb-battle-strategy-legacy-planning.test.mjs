import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { DS_GEO_TERRITORIES } from "../public/ds-geo-mission-overrides.js";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";
import { HOTH_DS_TERRITORIES } from "../public/hoth-ds-data.js";
import { HOTH_LS_TERRITORIES } from "../public/hoth-ls-data.js";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { legacyPlanningBattleStrategyForMission } from "../public/tb-battle-strategy-legacy-planning-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";
import { missionRosterReadiness, STRATEGY_READINESS } from "../public/tb-roster-readiness.js";

const flatten = (territories) => territories.flatMap((territory) => territory.missions || []);
const dsGeo = flatten(DS_GEO_TERRITORIES);
const lsGeo = flatten(GEO_LS_TERRITORIES);
const hothDs = flatten(HOTH_DS_TERRITORIES);
const hothLs = flatten(HOTH_LS_TERRITORIES);
const byId = (rows, id) => rows.find((row) => row.id === id);

const genericCases = [
  ["DS Geo", byId(dsGeo, "c1"), "geo-separatist"],
  ["LS Geo", byId(lsGeo, "p1-mid-cm1"), "geo-republic"],
  ["Hoth DS", byId(hothDs, "p1-flank-cm1"), "hoth-imperial"],
  ["Hoth LS", byId(hothLs, "p1-cm1"), "hoth-rebel"],
];

test("generic legacy missions resolve to structured partial planning packs", () => {
  for (const [label, mission, tbId] of genericCases) {
    assert.ok(mission, `${label} fixture should exist`);
    const analysis = evaluateBattleStrategy({ missionId: mission.id, tbId, members: [] }, mission);
    assert.equal(analysis.available, true, `${label} should resolve`);
    assert.match(analysis.strategyId, new RegExp(`^legacy-plan:${tbId}:`));
    assert.match(`${analysis.strategyStatus} ${analysis.confidence}`, /partial/i);
    assert.equal(analysis.stages.length, 4);
    assert.match(JSON.stringify(analysis.stages), /Preflight/i);
    assert.match(JSON.stringify(analysis.stages), /Opening/i);
    assert.match(JSON.stringify(analysis.stages), /transition|closeout/i);

    const coverage = missionStrategyCoverage(mission);
    assert.equal(coverage.coverage, "partial", `${label} fallback must never auto-promote to covered`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(coverage.strategyId, /^legacy-plan:/);
  }
});

test("fallback preserves canonical mandatory members as critical strategy checks", () => {
  const mission = byId(hothDs, "p2-snow-empire");
  assert.ok(mission);
  const strategy = legacyPlanningBattleStrategyForMission(mission);
  assert.ok(strategy);
  const snowtrooper = strategy.keyUnits.find((row) => row.baseId === "SNOWTROOPER");
  assert.ok(snowtrooper, "Snowtrooper should be preserved from the canonical mission gate");
  assert.equal(snowtrooper.importance, "critical");
  assert.match(snowtrooper.reason, /Canonical mission-entry requirement/i);

  const analysis = evaluateBattleStrategy({ missionId: mission.id, tbId: mission.tbId, members: [] }, mission);
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((row) => row.id === "SNOWTROOPER"));
});

test("fallback never turns recommendation members into hard strategy gates", () => {
  const mission = byId(lsGeo, "p1-mid-cm1");
  const strategy = legacyPlanningBattleStrategyForMission(mission);
  assert.ok(strategy);
  assert.deepEqual(strategy.keyUnits, []);
  assert.ok(mission.recommendations?.length > 0, "fixture should still have planning recommendations");
});

test("explicit researched packs keep ownership ahead of the fallback", () => {
  const cases = [
    [byId(dsGeo, "s2"), "s2-acklay-v1"],
    [byId(lsGeo, "p3-kam"), "p3-kam-v1"],
    [byId(hothDs, "p3-ipd-sm"), "p3-ipd-sm-v1"],
    [byId(hothLs, "p3-rolo-sm"), "p3-rolo-sm-hoth-ls-v1"],
  ];

  for (const [mission, expectedStrategyId] of cases) {
    const analysis = evaluateBattleStrategy({ missionId: mission.id, tbId: mission.tbId, members: [] }, mission);
    assert.equal(analysis.strategyId, expectedStrategyId, `${mission.tbId}:${mission.id} must keep explicit strategy ownership`);
    assert.doesNotMatch(analysis.strategyId, /^legacy-plan:/);
  }
});

test("fallback is restricted to the four legacy Territory Battles", () => {
  const rote = Object.values(ROTE_MISSIONS_BY_PLANET).flat()[0];
  assert.ok(rote);
  assert.equal(legacyPlanningBattleStrategyForMission(rote), null);
  assert.equal(legacyPlanningBattleStrategyForMission({ id: "synthetic", tbId: "unknown-tb" }), null);
  assert.equal(legacyPlanningBattleStrategyForMission({ id: "synthetic", tbId: "" }), null);
});

test("bare mission id without canonical mission object cannot invoke the fallback", () => {
  const analysis = evaluateBattleStrategy({ missionId: "definitely-unowned-id", tbId: "hoth-rebel", members: [] });
  assert.equal(analysis.available, false);
  assert.equal(analysis.status, "pending");
});

test("partial fallback stays NO VERIFIED STRATEGY YET in roster readiness", () => {
  const mission = byId(hothLs, "p1-cm1");
  const readiness = missionRosterReadiness({ units: [] }, mission);
  assert.equal(readiness.strategy.available, true);
  assert.equal(readiness.strategy.verified, false);
  assert.equal(readiness.strategy.label, STRATEGY_READINESS.MISSING);
  assert.match(`${readiness.strategy.strategyStatus} ${readiness.strategy.confidence}`, /partial/i);
});

test("fallback source and evidence boundaries reject fabricated battle certainty", () => {
  for (const [, mission] of genericCases) {
    const strategy = legacyPlanningBattleStrategyForMission(mission);
    assert.ok(strategy.sources.length > 0);
    assert.ok(strategy.evidenceBoundary);
    assert.match(strategy.evidenceBoundary, /PARTIAL planning guidance/i);
    assert.match(strategy.evidenceBoundary, /does not claim/i);
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("legacy planning fallback modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-legacy-planning-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
