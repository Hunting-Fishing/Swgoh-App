import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { HOTH_LS_TERRITORIES } from "../public/hoth-ls-data.js";
import { HOTH_LS_BATTLE_STRATEGIES, hothLsBattleStrategyForMission } from "../public/tb-battle-strategy-hoth-ls-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const missions = HOTH_LS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const ids = ["p1-phoenix", "p2-overlook-rogue", "p3-rolo-sm", "p4-rolo-sm", "p5-cls-sm", "p6-flank-rogue", "p6-rolo-sm"];

test("Hoth LS resolver owns all prioritized special/restricted ground mission ids", () => {
  assert.deepEqual(Object.keys(HOTH_LS_BATTLE_STRATEGIES), ids);
  for (const id of ids) {
    assert.equal(hothLsBattleStrategyForMission(id), HOTH_LS_BATTLE_STRATEGIES[id]);
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: "hoth-rebel", members: [] }, mission(id));
    assert.equal(analysis.available, true, `${id} should resolve`);
  }
});

test("all Hoth LS high-value ground packs remain partial until current encounter sequencing is reverified", () => {
  for (const id of ids) {
    const coverage = missionStrategyCoverage(mission(id));
    assert.equal(coverage.coverage, "partial", `${id} must remain partial`);
    assert.equal(coverage.strategyAvailable, true);
    assert.match(`${coverage.strategyStatus} ${coverage.confidence}`, /partial/i);
  }
});

test("Hoth Focused Defense is encoded without turning it into an entry requirement", () => {
  for (const id of ["p1-phoenix", "p3-rolo-sm", "p4-rolo-sm", "p5-cls-sm", "p6-rolo-sm"]) {
    const strategy = HOTH_LS_BATTLE_STRATEGIES[id];
    assert.match(`${strategy.summary} ${JSON.stringify(strategy.stages)}`, /Focused Defense/i);
    assert.match(`${strategy.summary} ${JSON.stringify(strategy.stages)}`, /Protection Up/i);
  }
});

test("historical Captain Han references never become current critical roster gates", () => {
  for (const id of ["p3-rolo-sm", "p4-rolo-sm", "p6-rolo-sm"]) {
    const strategy = HOTH_LS_BATTLE_STRATEGIES[id];
    const captainHan = strategy.keyUnits.find((row) => row.baseId === "CAPTAINHANSOLO");
    assert.ok(captainHan, `${id} should retain historical Captain Han context`);
    assert.equal(captainHan.importance, "helpful");
    assert.match(captainHan.reason, /not.*hard gate|historical/i);
    assert.match(strategy.evidenceBoundary, /histor/i);
  }

  assert.ok(HOTH_LS_BATTLE_STRATEGIES["p3-rolo-sm"].keyUnits.some((row) => row.baseId === "HOTHREBELSOLDIER" && row.importance === "critical"));
  assert.ok(HOTH_LS_BATTLE_STRATEGIES["p4-rolo-sm"].keyUnits.some((row) => row.baseId === "HOTHLEIA" && row.importance === "critical"));
  assert.ok(HOTH_LS_BATTLE_STRATEGIES["p6-rolo-sm"].keyUnits.some((row) => row.baseId === "HOTHLEIA" && row.importance === "critical"));
});

test("Cassian Rebel Assault Omicron is optional strategy value, never a mission blocker", () => {
  for (const id of ["p2-overlook-rogue", "p6-flank-rogue"]) {
    const strategy = HOTH_LS_BATTLE_STRATEGIES[id];
    const cassian = strategy.keyUnits.find((row) => row.baseId === "CASSIANANDOR");
    const groundwork = strategy.keyAbilities.find((row) => row.baseId === "CASSIANANDOR" && row.abilityName === "Groundwork");
    assert.equal(cassian.importance, "high");
    assert.equal(groundwork.requiresOmicron, true);
    assert.equal(groundwork.importance, "helpful");
    assert.match(strategy.evidenceBoundary, /not.*mandatory|optional|partial/i);
  }
});

test("ROLO and CLS current kit mechanics are scoped as strategy advice, not legality", () => {
  const rolo = HOTH_LS_BATTLE_STRATEGIES["p4-rolo-sm"];
  assert.ok(rolo.keyAbilities.some((row) => row.abilityName === "Rebel Barrage" && row.importance === "high"));
  const roloOmi = rolo.keyAbilities.find((row) => row.abilityName === "Battlefront Command");
  assert.equal(roloOmi.requiresOmicron, true);
  assert.equal(roloOmi.importance, "helpful");

  const cls = HOTH_LS_BATTLE_STRATEGIES["p5-cls-sm"];
  assert.ok(cls.keyUnits.some((row) => row.baseId === "COMMANDERLUKESKYWALKER" && row.importance === "critical"));
  assert.ok(cls.keyAbilities.some((row) => row.abilityName === "Call to Action"));
  assert.ok(cls.keyAbilities.some((row) => row.abilityName === "It Binds All Things"));
});

test("Hoth LS strategy ids do not leak into other Territory Battles", () => {
  for (const id of ids) {
    const fake = { id, tbId: "hoth-imperial", territoryId: "collision", phase: 4, missionType: "special", name: "Synthetic collision" };
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: fake.tbId, members: [] }, fake);
    assert.equal(analysis.available, false, `${id} must not resolve outside Hoth LS`);
  }
});

test("Hoth LS ground packs preserve evidence boundaries and reject fabricated odds", () => {
  for (const strategy of Object.values(HOTH_LS_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.length > 0);
    assert.ok(strategy.stages.length > 0);
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("Hoth LS ground strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-hoth-ls-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
