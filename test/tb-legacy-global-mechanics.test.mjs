import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { legacyTbGlobalMechanicsForMission } from "../public/tb-legacy-global-mechanics-data.js";
import { legacyPlanningBattleStrategyForMission } from "../public/tb-battle-strategy-legacy-planning-data.js";

const mission = (tbId, id, missionType = "combat", entry = { unitType: "Character" }) => ({
  tbId,
  id,
  name: `${tbId} ${id}`,
  missionType,
  entry,
  recommendations: [{ id: "planning-core", sourceIds: ["planning-source"] }],
  waves: missionType === "fleet" ? [100000] : [100000, 200000, 300000, 400000],
  sources: [{ id: "canonical-source", label: "Canonical source", kind: "current-reference" }],
});

test("DS Geo partial planning includes Separatist Motives but remains partial", () => {
  const row = legacyPlanningBattleStrategyForMission(mission("geo-separatist", "c1"));
  assert.equal(row.status, "mission-planning-partial");
  assert.match(row.confidence, /partial/i);
  assert.match(row.summary, /Separatist Motives/i);
  assert.match(JSON.stringify(row.stages), /Affiliation/i);
  assert.match(JSON.stringify(row.stages), /platoon/i);
  assert.match(row.evidenceBoundary, /PARTIAL/i);
});

test("LS Geo ground partial planning includes Bravery", () => {
  const context = legacyTbGlobalMechanicsForMission(mission("geo-republic", "p1-mid-cm1"));
  assert.ok(context.mechanics.some((row) => row.name === "Bravery"));
  const row = legacyPlanningBattleStrategyForMission(mission("geo-republic", "p1-mid-cm1"));
  assert.match(row.summary, /Bravery/i);
  assert.match(JSON.stringify(row.stages), /Droid Battalion/i);
});

test("LS Geo fleet context keeps Formations conditional on platoon state", () => {
  const sample = mission("geo-republic", "p1-fleet", "fleet", { unitType: "Ship" });
  const context = legacyTbGlobalMechanicsForMission(sample);
  assert.ok(context.mechanics.some((row) => row.name === "Formations" && row.conditional));
  const row = legacyPlanningBattleStrategyForMission(sample);
  assert.match(JSON.stringify(row.stages), /Defensive Formation/i);
  assert.match(JSON.stringify(row.stages), /Do not assume/i);
});

test("Imperial Hoth partial planning includes Imperial Might and Malice", () => {
  const sample = mission("hoth-imperial", "p1-flank-cm1");
  const context = legacyTbGlobalMechanicsForMission(sample);
  assert.ok(context.mechanics.some((row) => row.name === "Imperial Might" && /Lifesteal/i.test(row.rule)));
  const row = legacyPlanningBattleStrategyForMission(sample);
  assert.match(row.summary, /Imperial Might/i);
  assert.match(row.summary, /Malice/i);
  assert.match(JSON.stringify(row.stages), /opening buff dispel/i);
});

test("Rebel Hoth partial planning includes Focused Defense and Last Stand", () => {
  const row = legacyPlanningBattleStrategyForMission(mission("hoth-rebel", "p1-cm1"));
  assert.match(row.summary, /Focused Defense/i);
  assert.match(row.summary, /Last Stand/i);
  assert.match(JSON.stringify(row.stages), /Protection Up/i);
  assert.match(JSON.stringify(row.stages), /two-turn clock/i);
});

test("global mechanics sources are attached without promoting verification state", () => {
  for (const tbId of ["geo-separatist", "geo-republic", "hoth-imperial", "hoth-rebel"]) {
    const row = legacyPlanningBattleStrategyForMission(mission(tbId, "sample"));
    assert.ok(row.sources.some((source) => /swgohgg-t0[1-4]d-global/.test(source.id)));
    assert.equal(row.status, "mission-planning-partial");
    assert.doesNotMatch(JSON.stringify(row), /guaranteed win|100% win/i);
  }
});

test("legacy global mechanics modules parse", () => {
  for (const path of [
    new URL("../public/tb-legacy-global-mechanics-data.js", import.meta.url),
    new URL("../public/tb-battle-strategy-legacy-planning-data.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
