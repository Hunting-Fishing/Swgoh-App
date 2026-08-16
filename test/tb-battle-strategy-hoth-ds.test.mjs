import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { HOTH_DS_TERRITORIES } from "../public/hoth-ds-data.js";
import { HOTH_DS_BATTLE_STRATEGIES, hothDsBattleStrategyForMission } from "../public/tb-battle-strategy-hoth-ds-data.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage } from "../public/tb-strategy-coverage.js";

const missions = HOTH_DS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);

test("Hoth DS high-value ground resolver owns IPD shard, Jabba and Phase 6 IPD specials", () => {
  assert.deepEqual(Object.keys(HOTH_DS_BATTLE_STRATEGIES), ["p3-ipd-sm", "p4-jabba-sm", "p6-ipd-sm"]);
  for (const id of Object.keys(HOTH_DS_BATTLE_STRATEGIES)) {
    assert.equal(hothDsBattleStrategyForMission(id), HOTH_DS_BATTLE_STRATEGIES[id]);
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: "hoth-imperial", members: [] }, mission(id));
    assert.equal(analysis.available, true, `${id} should resolve`);
    assert.equal(missionStrategyCoverage(mission(id)).coverage, "covered", `${id} should be covered`);
  }
});

test("Phase 3 IPD shard strategy protects the Piett/Veers defeat snowball", () => {
  const strategy = HOTH_DS_BATTLE_STRATEGIES["p3-ipd-sm"];
  assert.equal(strategy.requiredLeaderBaseId, "VEERS");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "COLONELSTARCK" && row.importance === "critical"));
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "ADMIRALPIETT" && row.importance === "high"));
  assert.match(JSON.stringify(strategy.stages), /first.*defeat/i);
  assert.match(JSON.stringify(strategy.stages), /Turn Meter/i);
  assert.match(JSON.stringify(strategy.stages), /Emperor's Trap/i);
  assert.match(strategy.evidenceBoundary, /newer community-tested Piett\/Veers\/Starck/i);
});

test("Phase 6 IPD pack uses current Detect and optional TB Omicron Self-Destruct behavior", () => {
  const strategy = HOTH_DS_BATTLE_STRATEGIES["p6-ipd-sm"];
  assert.equal(strategy.requiredLeaderBaseId, "VEERS");
  assert.ok(strategy.keyUnits.some((row) => row.baseId === "IMPERIALPROBEDROID" && row.importance === "critical"));
  assert.match(JSON.stringify(strategy.stages), /Detect/i);
  assert.match(JSON.stringify(strategy.stages), /Self-Destruct/i);
  assert.match(JSON.stringify(strategy.stages), /Omicron/i);
  const selfDestruct = strategy.keyAbilities.find((row) => row.abilityName === "Self-Destruct");
  assert.equal(selfDestruct.importance, "helpful");
  assert.notEqual(selfDestruct.requiresOmicron, true, "TB Omicron must stay optional");
  assert.match(strategy.evidenceBoundary, /Omicron is optional/i);
});

test("Jabba Hoth pack reuses the sourced Jabba execution engine without inventing companion gates", () => {
  const strategy = HOTH_DS_BATTLE_STRATEGIES["p4-jabba-sm"];
  assert.match(strategy.title, /Jabba/i);
  assert.ok(strategy.stages.length > 0);
  assert.match(strategy.evidenceBoundary, /does not invent.*companion restriction/i);
});

test("Hoth DS strategy ids do not leak across another TB context", () => {
  for (const id of ["p3-ipd-sm", "p4-jabba-sm", "p6-ipd-sm"]) {
    const fake = { id, tbId: "hoth-rebel", territoryId: "collision", phase: 4, missionType: "special", name: "Synthetic Hoth LS collision" };
    const analysis = evaluateBattleStrategy({ missionId: id, tbId: fake.tbId, members: [] }, fake);
    assert.equal(analysis.available, false, `${id} must not resolve outside Hoth DS`);
  }
});

test("Hoth DS ground packs preserve evidence boundaries and reject fabricated odds", () => {
  for (const strategy of Object.values(HOTH_DS_BATTLE_STRATEGIES)) {
    assert.ok(strategy.sources.length > 0);
    assert.ok(strategy.stages.length > 0);
    assert.ok(strategy.evidenceBoundary);
    assert.equal("winPercent" in strategy, false);
    assert.equal("guaranteedWin" in strategy, false);
    assert.doesNotMatch(JSON.stringify(strategy), /\b(?:9\d|100)%\s*(?:win|clear)/i);
  }
});

test("Hoth DS ground strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-hoth-ds-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
