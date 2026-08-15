import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { GEO_LS_TERRITORIES, GEO_LS_CAMPAIGN } from "../public/geo-ls-data.js";
import {
  MISSION_CONFIDENCE,
  mandatoryUnitMeetsEntry,
  missionRosterEntrySummary,
  recommendationLabel,
} from "../public/tb-mission-intelligence.js";

const missionById = (id) => GEO_LS_TERRITORIES.flatMap((territory) => territory.missions).find((mission) => mission.id === id);

test("Geo LS exposes all twelve territories across four three-zone phases", () => {
  assert.equal(GEO_LS_TERRITORIES.length, 12);
  for (const phase of [1, 2, 3, 4]) {
    assert.equal(GEO_LS_TERRITORIES.filter((territory) => territory.phase === phase).length, 3);
  }
  assert.equal(GEO_LS_CAMPAIGN.theme, "geo-light");
});

test("Geo LS stores current early and late zone thresholds", () => {
  assert.deepEqual(GEO_LS_TERRITORIES.find((territory) => territory.id === "p1-top").starThresholds, [42475000, 84950000, 141580000]);
  assert.deepEqual(GEO_LS_TERRITORIES.find((territory) => territory.id === "p4-top").starThresholds, [122490000, 340255000, 453670000]);
  assert.deepEqual(GEO_LS_TERRITORIES.find((territory) => territory.id === "p4-middle").starThresholds, [152945000, 270930000, 436980000]);
});

test("KAM mission enforces Shaak Ti and ARC while allowing Shaak outside Clone Trooper pool", () => {
  const mission = missionById("p3-kam");
  assert.equal(mission.entry.verified, true);
  assert.equal(mission.entry.powerMin, 22000);
  assert.deepEqual(mission.entry.requiredCategories, ["Clone Trooper"]);
  assert.equal(mission.entry.mandatoryMembers.length, 2);
  assert.equal(mission.entry.mandatoryMembers[0].baseId, "SHAAKTI");
  assert.equal(mission.entry.mandatoryMembers[0].bypassPool, true);
  assert.equal(mission.entry.mandatoryMembers[1].baseId, "ARCTROOPER501ST");

  const shaak = { baseId: "SHAAKTI", name: "Shaak Ti", unitType: "Character", alignment: "Light", stars: 7, power: 30000, factions: ["Galactic Republic", "Jedi"] };
  const arc = { baseId: "ARCTROOPER501ST", name: "ARC Trooper", unitType: "Character", alignment: "Light", stars: 7, power: 30000, factions: ["Clone Trooper", "501st"] };
  assert.equal(mandatoryUnitMeetsEntry(shaak, mission, mission.entry.mandatoryMembers[0]), true);
  assert.equal(mandatoryUnitMeetsEntry(arc, mission, mission.entry.mandatoryMembers[1]), true);

  const body = { units: [
    shaak,
    arc,
    { baseId: "CT7567", name: "CT-7567 'Rex'", unitType: "Character", alignment: "Light", stars: 7, power: 29000, factions: ["Clone Trooper", "501st"] },
    { baseId: "CT5555", name: "CT-5555 'Fives'", unitType: "Character", alignment: "Light", stars: 7, power: 29000, factions: ["Clone Trooper", "501st"] },
    { baseId: "CT210408", name: "CT-21-0408 'Echo'", unitType: "Character", alignment: "Light", stars: 7, power: 29000, factions: ["Clone Trooper", "501st"] },
  ] };
  const summary = missionRosterEntrySummary(body, mission);
  assert.equal(summary.ready, true);
  assert.equal(summary.poolTarget, 4);
  assert.equal(summary.mandatory.complete, true);
});

test("nonstandard GAS and Kenobi restricted battles preserve squad sizes", () => {
  const gas = missionById("p2-mid-gas");
  assert.equal(gas.entry.squadSize, 2);
  assert.deepEqual(gas.entry.allowedBaseIds, ["GENERALSKYWALKER", "AHSOKATANO"]);
  assert.equal(gas.entry.mandatoryMembers.length, 2);

  const kenobi = missionById("p2-bot-sm");
  assert.equal(kenobi.entry.squadSize, 3);
  assert.deepEqual(kenobi.entry.allowedBaseIds, ["GENERALKENOBI", "CC2224", "CLONESERGEANTPHASEI"]);
  assert.equal(kenobi.entry.mandatoryMembers.length, 3);
});

test("late Geo LS missions preserve named requirements", () => {
  const fleet = missionById("p4-fleet-sm");
  assert.deepEqual(fleet.entry.mandatoryMembers.map((member) => member.baseId), ["CAPITALNEGOTIATOR", "JEDISTARFIGHTERANAKIN"]);

  const factory = missionById("p4-mid-sm");
  assert.deepEqual(factory.entry.requiredCategories, ["Galactic Republic", "Jedi"]);
  assert.deepEqual(factory.entry.mandatoryMembers.map((member) => member.baseId), ["KIADIMUNDI", "SHAAKTI"]);

  const gr = missionById("p4-bot-gr");
  assert.deepEqual(gr.entry.mandatoryMembers.map((member) => member.baseId), ["PADMEAMIDALA", "ANAKINKNIGHT", "GENERALKENOBI"]);

  const fiveOhFirst = missionById("p4-bot-501");
  assert.deepEqual(fiveOhFirst.entry.requiredCategories, ["501st"]);
  assert.equal(fiveOhFirst.entry.mandatoryMembers[0].baseId, "GENERALSKYWALKER");
});

test("community Geo LS teams cannot be presented as verified mission teams", () => {
  const mission = missionById("p3-kam");
  const recommendation = mission.recommendations[0];
  assert.equal(recommendation.confidence, MISSION_CONFIDENCE.COMMUNITY);
  assert.equal(recommendation.verifiedLegal, false);
  assert.equal(recommendationLabel(mission, recommendation), "Community Reference Team");
});

test("Geo LS and reusable legacy renderer parse as browser modules", () => {
  for (const path of [
    new URL("../public/geo-ls-data.js", import.meta.url),
    new URL("../public/legacy-tb-command.js", import.meta.url),
    new URL("../public/tb-mission-intelligence.js", import.meta.url),
    new URL("../public/tb-command-center.js", import.meta.url),
  ]) {
    execFileSync(process.execPath, ["--check", path.pathname]);
  }
});
