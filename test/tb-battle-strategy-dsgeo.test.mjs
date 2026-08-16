import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { extractAbilitySemantics } from "../public/kit-semantics.js";
import { DS_GEO_BATTLE_STRATEGIES, dsGeoBattleStrategyForMission } from "../public/tb-battle-strategy-dsgeo-data.js";
import { DS_GEO_MISSIONS } from "../public/ds-geo-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

function member(baseId, name, abilities = []) {
  const rows = abilities.map((ability) => ({ ...ability, semantics: extractAbilitySemantics(ability) }));
  return {
    baseId,
    name,
    unit: { baseId, name },
    abilities: rows,
    staticUnit: { baseId, name, abilities: rows },
  };
}

function geos({ leaderFirst = true } = {}) {
  const gba = member("GEONOSIANBROODALPHA", "Geonosian Brood Alpha", [
    { id: "conscription", name: "Conscription", tier: 8, description: "Dispel all debuffs on all Geonosian allies. Summon a Geonosian Brute and recover Health and Protection." },
  ]);
  const poggle = member("POGGLETHELESSER", "Poggle the Lesser", [
    { id: "martial_doom", name: "Martial Doom", tier: 8, description: "Deal Physical damage and inflict Ability Block for 1 turn." },
  ]);
  const soldier = member("GEONOSIANSOLDIER", "Geonosian Soldier", [
    { id: "aggressive_advance", name: "Aggressive Advance", tier: 8, description: "Deal Physical damage and inflict Tenacity Down for 2 turns." },
  ]);
  const spy = member("GEONOSIANSPY", "Geonosian Spy", [
    { id: "silent_strike", name: "Silent Strike", tier: 8, description: "Deal high Physical damage to target enemy." },
  ]);
  const sunFac = member("SUNFAC", "Sun Fac", [
    { id: "browbeat", name: "Browbeat", tier: 8, description: "Deal Physical damage and dispel buffs on target enemy." },
  ]);
  const rows = [gba, poggle, soldier, spy, sunFac];
  return leaderFirst ? rows : [poggle, gba, soldier, spy, sunFac];
}

const mission = (id) => DS_GEO_MISSIONS.find((row) => row.id === id);

test("DS Geo high-value resolver owns Acklay, Wat and Jabba packs", () => {
  assert.deepEqual(Object.keys(DS_GEO_BATTLE_STRATEGIES), ["s2", "s3", "s5"]);
  assert.equal(dsGeoBattleStrategyForMission("s2"), DS_GEO_BATTLE_STRATEGIES.s2);
  assert.equal(dsGeoBattleStrategyForMission("s3"), DS_GEO_BATTLE_STRATEGIES.s3);
  assert.equal(dsGeoBattleStrategyForMission("s5"), DS_GEO_BATTLE_STRATEGIES.s5);
  assert.equal(dsGeoBattleStrategyForMission("c1"), null);
});

test("Acklay strategy uses the tested Enrage -> Jedi AoE control loop", () => {
  const analysis = evaluateBattleStrategy({ missionId: "s2", tbId: "geo-separatist", members: geos() }, mission("s2"));
  assert.equal(analysis.available, true);
  assert.equal(analysis.status, "ready");
  assert.equal(analysis.blockers.length, 0);
  assert.match(analysis.title, /Acklay/i);
  assert.match(JSON.stringify(analysis.stages), /Enrage/i);
  assert.match(JSON.stringify(analysis.stages), /Jedi AoE/i);
  assert.ok(analysis.targetPriorities.some((row) => /Jedi AoE/i.test(row.target) && row.priority === "critical"));
  assert.equal("winPercent" in analysis, false);
  assert.equal("score" in analysis, false);
});

test("Acklay strategy blocks a non-GBA leader", () => {
  const analysis = evaluateBattleStrategy({ missionId: "s2", tbId: "geo-separatist", members: geos({ leaderFirst: false }) }, mission("s2"));
  assert.equal(analysis.status, "blocked");
  assert.ok(analysis.blockers.some((row) => row.type === "leader" && row.expected === "GEONOSIANBROODALPHA"));
});

test("Wat clone is promoted to covered without claiming deterministic odds", () => {
  const strategy = DS_GEO_BATTLE_STRATEGIES.s3;
  assert.equal(strategy.confidence, "community-validated");
  assert.match(strategy.evidenceBoundary, /does not mean deterministic or guaranteed/i);
  const coverage = missionStrategyCoverage(mission("s3"));
  assert.equal(coverage.coverage, "covered");
  assert.equal(coverage.strategyId, "s3-wat-v2");
  assert.equal("winPercent" in strategy, false);
});

test("Acklay and Jabba DS Geo specials are strategy-covered", () => {
  for (const id of ["s2", "s5"]) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "covered", `${id} should be covered`);
    assert.equal(coverage.strategyAvailable, true);
    assert.ok(coverage.sourceCount > 0);
    assert.ok(coverage.stageCount > 0);
  }
});

test("legacy DS Geo ids do not leak across Territory Battle context", () => {
  const fakeHoth = {
    id: "s2",
    tbId: "hoth-rebel",
    territoryId: "collision-test",
    phase: 1,
    missionType: "special",
    name: "Synthetic Hoth s2 collision",
  };
  const analysis = evaluateBattleStrategy({ missionId: "s2", tbId: "hoth-rebel", members: geos() }, fakeHoth);
  assert.equal(analysis.available, false);
  assert.equal(analysis.status, "pending");

  const coverage = missionStrategyCoverage(fakeHoth);
  assert.equal(coverage.coverage, "missing");
  assert.equal(coverage.strategyAvailable, false);
});

test("DS Geo strategy packs preserve evidence boundaries and reject fabricated win rates", () => {
  for (const strategy of Object.values(DS_GEO_BATTLE_STRATEGIES)) {
    assert.ok(Array.isArray(strategy.sources) && strategy.sources.length > 0);
    assert.ok(strategy.evidenceBoundary);
    assert.ok(Array.isArray(strategy.stages) && strategy.stages.length > 0);
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("DS Geo strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-dsgeo-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
    new URL("../public/tb-strategy-coverage.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
