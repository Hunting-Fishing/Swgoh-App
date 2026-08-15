import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMissions } from "../public/rote-mission-overrides.js";
import { evaluateBattleStrategy } from "../public/tb-battle-strategy.js";
import { missionStrategyCoverage, strategyCoverageReport } from "../public/tb-strategy-coverage.js";
import { ROTE_GENERIC_MISSION_COUNTS, roteGenericBattleStrategyForMission } from "../public/tb-battle-strategy-rote-generic-data.js";

const genericIds = Object.entries(ROTE_GENERIC_MISSION_COUNTS).flatMap(([planet, count]) =>
  Array.from({ length: count }, (_, index) => `${planet}-generic-${index + 1}`));
const missions = normalizeRoteMissions(Object.values(ROTE_MISSIONS_BY_PLANET).flat());
const combat = missions.filter((mission) => mission.missionType === "combat");

test("generic ROTE planet template owns the 39 standard generic combat ids", () => {
  assert.equal(genericIds.length, 39);
  for (const id of genericIds) assert.ok(roteGenericBattleStrategyForMission(id), id);
  assert.equal(roteGenericBattleStrategyForMission("zeffo-generic-1"), null, "Zeffo generic mission remains owned by its encounter-specific pack");
  assert.equal(roteGenericBattleStrategyForMission("mustafar-generic-4"), null);
  assert.equal(roteGenericBattleStrategyForMission("not-a-mission"), null);
});

test("standard generic packs are official mechanic cores while Mandalore remains explicit partial", () => {
  for (const id of genericIds.filter((value) => value !== "mandalore-generic-1")) {
    const strategy = roteGenericBattleStrategyForMission(id);
    assert.equal(strategy.status, "verified-mechanic-core", id);
    assert.ok(strategy.sources.some((source) => source.kind === "official"), id);
    assert.ok(strategy.stages.length > 0, id);
    assert.ok(strategy.evidenceBoundary, id);
  }
  const mandalore = roteGenericBattleStrategyForMission("mandalore-generic-1");
  assert.match(mandalore.status, /partial/i);
  assert.match(mandalore.summary, /Eleventh Hour/i);
  assert.match(mandalore.summary, /complete modifier rule text is not/i);
  assert.match(JSON.stringify(mandalore.stages), /summoned allies/i);
  assert.equal(missionStrategyCoverage({ id: "mandalore-generic-1", missionType: "combat" }).coverage, "partial");
});

test("planet templates keep critical modifiers isolated", () => {
  const kessel = evaluateBattleStrategy({ missionId: "kessel-generic-1", members: [] });
  assert.match(kessel.summary, /Confuse/i);
  assert.match(JSON.stringify(kessel.stages), /Clear Head/i);
  assert.doesNotMatch(JSON.stringify(kessel.stages), /Recompute/i);

  const deathStar = evaluateBattleStrategy({ missionId: "death-star-generic-1", members: [] });
  assert.match(deathStar.summary, /Superlaser/i);
  assert.doesNotMatch(JSON.stringify(deathStar), /Smells Bad on the Outside|Deadly Storm/i);

  const hoth = evaluateBattleStrategy({ missionId: "hoth-generic-1", members: [] });
  assert.match(hoth.summary, /Frostbite/i);
  assert.match(JSON.stringify(hoth.stages), /Smells Bad on the Outside/i);
  assert.match(JSON.stringify(hoth.stages), /Thermoregulate/i);

  const vandor = evaluateBattleStrategy({ missionId: "vandor-generic-1", members: [] });
  assert.match(vandor.summary, /50% Health\/Protection/i);
  assert.doesNotMatch(JSON.stringify(vandor), /dice roll|attack roll/i);
});

test("Kashyyyk, Haven, Kafrene and Malachor expose their official decision rules", () => {
  const kashyyyk = evaluateBattleStrategy({ missionId: "kashyyyk-generic-1", members: [] });
  assert.match(kashyyyk.summary, /10% Protection/i);
  assert.match(JSON.stringify(kashyyyk.stages), /debuff/i);

  const haven = evaluateBattleStrategy({ missionId: "haven-generic-1", members: [] });
  assert.match(haven.summary, /5% Health/i);
  assert.match(haven.summary, /ignoring Protection/i);
  assert.match(JSON.stringify(haven.stages), /Brain Freeze/i);

  const kafrene = evaluateBattleStrategy({ missionId: "kafrene-generic-1", members: [] });
  assert.match(kafrene.summary, /Informant/i);
  assert.match(JSON.stringify(kafrene.stages), /Enemy Informant/i);

  const malachor = evaluateBattleStrategy({ missionId: "malachor-generic-1", members: [] });
  assert.match(malachor.summary, /25% Max Health\/Protection/i);
  assert.match(malachor.summary, /below 40%/i);
  assert.match(malachor.summary, /above 70%/i);
});

test("every canonical ROTE combat mission now resolves a strategy", () => {
  const unresolved = combat.filter((mission) => !evaluateBattleStrategy({ missionId: mission.id, members: [] }, mission).available);
  assert.deepEqual(unresolved.map((mission) => mission.id), []);
});

test("ROTE combat coverage has no missing rows and preserves partial evidence", () => {
  const report = strategyCoverageReport(combat);
  assert.equal(report.counts.missing, 0);
  assert.equal(report.total, combat.length);
  assert.ok(report.counts.covered > 0);
  assert.ok(report.counts.partial > 0, "known partial evidence should remain partial rather than being promoted");
  assert.ok(report.rows.some((row) => row.missionId === "mandalore-generic-1" && row.coverage === "partial"));
  assert.ok(report.rows.every((row) => row.strategyAvailable === true));
});

test("generic strategy modules parse", () => {
  for (const path of [
    new URL("../public/tb-battle-strategy-rote-generic-data.js", import.meta.url),
    new URL("../public/tb-strategy-coverage.js", import.meta.url),
    new URL("../public/tb-roster-readiness.js", import.meta.url),
    new URL("../public/tb-battle-strategy.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
