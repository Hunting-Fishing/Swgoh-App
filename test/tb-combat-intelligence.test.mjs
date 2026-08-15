import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  TB_OMICRON_MODES,
  analyzeTeamCombatPreparation,
  combatPreparationStatus,
  omicronActiveForMission,
  omicronModeLabel,
} from "../public/tb-combat-intelligence.js";
import { createMissionRecord, normalizeRecommendation } from "../public/tb-mission-intelligence.js";

test("current game-data Territory Battle Omicron modes are classified by mission type", () => {
  assert.equal(TB_OMICRON_MODES.STRIKE, 5);
  assert.equal(TB_OMICRON_MODES.COVERT, 6);
  assert.equal(TB_OMICRON_MODES.BOTH, 7);
  assert.equal(omicronActiveForMission(5, "combat"), true);
  assert.equal(omicronActiveForMission(5, "special"), false);
  assert.equal(omicronActiveForMission(6, "special"), true);
  assert.equal(omicronActiveForMission(6, "combat"), false);
  assert.equal(omicronActiveForMission(7, "combat"), true);
  assert.equal(omicronActiveForMission(7, "special"), true);
  assert.equal(omicronActiveForMission(8, "combat"), false);
  assert.equal(omicronModeLabel(7), "All Territory Battles");
});

test("combat preparation merges live ability ownership with static Zeta and TB Omicron metadata", () => {
  const mission = createMissionRecord({
    id: "tb-special",
    missionType: "special",
    entry: { verified: true, unitType: "Character", starsMin: 7, relicMin: 5 },
  });
  const recommendation = normalizeRecommendation({
    id: "team",
    name: "Test Team",
    members: [{ baseId: "A", name: "Alpha" }],
  });
  const body = { units: [{
    baseId: "A", name: "Alpha", unitType: "Character", stars: 7, gear: 13, relic: 7, speed: 301, power: 32000,
    abilities: [
      { id: "zeta-skill", tier: 6 },
      { id: "omi-skill", tier: 7 },
      { id: "gac-omi", tier: 7 },
    ],
  }] };
  const catalog = { units: [{
    baseId: "A", name: "Alpha", abilities: [
      { id: "zeta-skill", name: "Zeta Skill", zeta: true, omega: false, omicron: false, omicronMode: 0, upgradeTiers: [{ tier: 8, zeta: true }] },
      { id: "omi-skill", name: "TB Special Omi", zeta: false, omega: false, omicron: true, omicronMode: 6, upgradeTiers: [{ tier: 9, omicron: true }] },
      { id: "gac-omi", name: "GAC Omi", zeta: false, omega: false, omicron: true, omicronMode: 9, upgradeTiers: [{ tier: 9, omicron: true }] },
    ],
  }] };
  const analysis = analyzeTeamCombatPreparation(body, mission, recommendation, catalog);
  assert.equal(analysis.members.length, 1);
  assert.equal(analysis.zetas.available, 1);
  assert.equal(analysis.zetas.installed, 1);
  assert.equal(analysis.tbOmicrons.active, 1);
  assert.equal(analysis.tbOmicrons.installed, 1);
  assert.equal(analysis.tbOmicrons.rows[0].name, "TB Special Omi");
  assert.equal(analysis.tbOmicrons.rows.some((row) => row.name === "GAC Omi"), false);
});

test("minimum and safer investment targets calculate factual gear relic and speed gaps", () => {
  const mission = createMissionRecord({ id: "m", missionType: "combat", entry: { verified: true, starsMin: 7 } });
  const recommendation = normalizeRecommendation({
    id: "team",
    members: [{ baseId: "A", name: "Alpha" }],
    minimum: { gear: 13, relic: 7, speed: 320 },
    saferTarget: { relic: 8, speed: 340 },
  });
  const body = { units: [{ baseId: "A", name: "Alpha", unitType: "Character", stars: 7, gear: 13, relic: 6, speed: 305, power: 30000 }] };
  const catalog = { units: [{ baseId: "A", abilities: [] }] };
  const analysis = analyzeTeamCombatPreparation(body, mission, recommendation, catalog);
  assert.equal(analysis.members[0].minimumGap.gear, 0);
  assert.equal(analysis.members[0].minimumGap.relic, 1);
  assert.equal(analysis.members[0].minimumGap.speed, 15);
  assert.equal(analysis.members[0].saferGap.relic, 2);
  assert.equal(analysis.members[0].saferGap.speed, 35);
  assert.equal(combatPreparationStatus(analysis).label, "MINIMUM TARGET GAP");
});

test("absence of source-backed combat targets stays explicit instead of producing a quality score", () => {
  const mission = createMissionRecord({ id: "m", missionType: "combat", entry: { verified: true, starsMin: 7 } });
  const recommendation = normalizeRecommendation({ id: "team", members: [{ baseId: "A" }] });
  const body = { units: [{ baseId: "A", unitType: "Character", stars: 7, gear: 13, relic: 9, speed: 400, power: 50000 }] };
  const catalog = { units: [{ baseId: "A", abilities: [] }] };
  const analysis = analyzeTeamCombatPreparation(body, mission, recommendation, catalog);
  assert.equal(analysis.targets.minimumDefined, false);
  assert.equal(analysis.targets.saferDefined, false);
  assert.equal(combatPreparationStatus(analysis).label, "ENTRY READY");
  assert.equal("winPercent" in analysis, false);
  assert.equal("score" in analysis, false);
});

test("TB combat overlay is event driven and does not introduce a MutationObserver", () => {
  const overlay = fs.readFileSync(new URL("../public/tb-combat-overlay.js", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../public/rote-squad-bridge.js", import.meta.url), "utf8");
  assert.doesNotMatch(overlay, /MutationObserver/);
  assert.match(overlay, /swgoh:workspace-activated/);
  assert.match(bridge, /tb-combat-overlay\.js/);
});

test("combat-intelligence browser modules parse", () => {
  for (const path of [
    new URL("../public/tb-combat-intelligence.js", import.meta.url),
    new URL("../public/tb-combat-prep-ui.js", import.meta.url),
    new URL("../public/tb-combat-overlay.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
