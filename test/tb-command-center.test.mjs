import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { TERRITORY_BATTLES, territoryBattleById, phaseScaffold, TB_SOURCES } from "../public/tb-command-data.js";
import {
  MISSION_CONFIDENCE,
  createMissionRecord,
  normalizeRecommendation,
  canPresentAsVerifiedTeam,
  recommendationLabel,
  rosterUnitMeetsEntry,
  recommendationRosterFit,
} from "../public/tb-mission-intelligence.js";

test("all five current Territory Battle families are registered", () => {
  assert.deepEqual(TERRITORY_BATTLES.map((tb) => tb.gameId), ["t01D", "t02D", "t03D", "t04D", "t05D"]);
  assert.equal(territoryBattleById("hoth-rebel").phases, 6);
  assert.equal(territoryBattleById("hoth-imperial").phases, 6);
  assert.equal(territoryBattleById("geo-separatist").phases, 4);
  assert.equal(territoryBattleById("geo-republic").phases, 4);
  assert.equal(territoryBattleById("rote").phases, 6);
  assert.equal(territoryBattleById("geo-separatist").phaseHours, 36);
  assert.equal(territoryBattleById("rote").phaseHours, 24);
});

test("phase scaffold follows the selected Territory Battle rather than assuming ROTE", () => {
  assert.equal(phaseScaffold("geo-separatist").length, 4);
  assert.equal(phaseScaffold("hoth-rebel").length, 6);
  assert.equal(phaseScaffold("rote")[5].label, "Phase 6");
});

test("community source licensing is preserved in provenance registry", () => {
  assert.equal(TB_SOURCES.genskaarGeo.license, "MIT");
  assert.equal(TB_SOURCES.genskaarGeo.kind, "community-reference");
});

test("mission recommendations fail closed until entry and team legality are verified", () => {
  const recommendation = normalizeRecommendation({
    id: "team-a",
    confidence: MISSION_CONFIDENCE.VERIFIED,
    verifiedLegal: true,
    baseIds: ["A", "B", "C", "D", "E"],
  });
  const unverifiedMission = createMissionRecord({ id: "m1", entry: { verified: false } });
  assert.equal(canPresentAsVerifiedTeam(unverifiedMission, recommendation), false);
  assert.equal(recommendationLabel(unverifiedMission, recommendation), "Unverified Planning Team");

  const verifiedMission = createMissionRecord({ id: "m2", entry: { verified: true } });
  assert.equal(canPresentAsVerifiedTeam(verifiedMission, recommendation), true);
  assert.equal(recommendationLabel(verifiedMission, recommendation), "Verified Mission Team");
});

test("roster eligibility checks exact allowed units, category, stars, gear, relic and power", () => {
  const mission = createMissionRecord({
    id: "entry",
    entry: {
      verified: true,
      alignment: "Light",
      starsMin: 7,
      gearMin: 13,
      relicMin: 5,
      powerMin: 25000,
      allowedBaseIds: ["LEGAL_UNIT"],
      requiredCategories: ["Jedi"],
    },
  });
  const legal = { baseId: "LEGAL_UNIT", alignment: "Light", stars: 7, gear: 13, relic: 7, power: 32000, factions: ["Jedi"] };
  const taggedButNotAllowed = { ...legal, baseId: "NEW_JEDI" };
  const underRelic = { ...legal, relic: 4 };
  assert.equal(rosterUnitMeetsEntry(legal, mission), true);
  assert.equal(rosterUnitMeetsEntry(taggedButNotAllowed, mission), false);
  assert.equal(rosterUnitMeetsEntry(underRelic, mission), false);
});

test("recommended roster fit remains separate from merely owning the team", () => {
  const mission = createMissionRecord({
    id: "m3",
    entry: { verified: true, relicMin: 5, allowedBaseIds: ["A", "B"] },
  });
  const recommendation = normalizeRecommendation({ baseIds: ["A", "B"], verifiedLegal: true, confidence: MISSION_CONFIDENCE.VERIFIED });
  const fit = recommendationRosterFit({ units: [
    { baseId: "A", relic: 7 },
    { baseId: "B", relic: 3 },
  ] }, mission, recommendation);
  assert.equal(fit.owned, 2);
  assert.equal(fit.legal, 1);
  assert.equal(fit.complete, false);
});

test("TB command center loads through existing bridge and browser modules parse", () => {
  const bridge = fs.readFileSync(new URL("../public/rote-squad-bridge.js", import.meta.url), "utf8");
  assert.match(bridge, /tb-command-center\.js/);
  assert.match(bridge, /tb-command-center\.css/);
  for (const path of [
    new URL("../public/tb-command-data.js", import.meta.url),
    new URL("../public/tb-mission-intelligence.js", import.meta.url),
    new URL("../public/tb-command-center.js", import.meta.url),
  ]) {
    execFileSync(process.execPath, ["--check", path.pathname]);
  }
});
