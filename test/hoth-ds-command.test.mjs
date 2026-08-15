import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { HOTH_DS_TERRITORIES, HOTH_DS_CAMPAIGN } from "../public/hoth-ds-data.js";
import { missionRosterEntrySummary, recommendationLabel } from "../public/tb-mission-intelligence.js";

const missionById = (id) => HOTH_DS_TERRITORIES.flatMap((territory) => territory.missions).find((mission) => mission.id === id);

test("Hoth Imperial Retaliation exposes all sixteen mapped territories across six phases", () => {
  assert.equal(HOTH_DS_TERRITORIES.length, 16);
  assert.deepEqual([1,2,3,4,5,6].map((phase) => HOTH_DS_TERRITORIES.filter((territory) => territory.phase === phase).length), [2,2,3,3,3,3]);
  assert.equal(HOTH_DS_CAMPAIGN.theme, "hoth-dark");
});

test("Hoth DS current zone star thresholds are pinned", () => {
  assert.deepEqual(HOTH_DS_TERRITORIES.find((territory) => territory.id === "p1-top").starThresholds, [885000,6909000,47880000]);
  assert.deepEqual(HOTH_DS_TERRITORIES.find((territory) => territory.id === "p4-middle").starThresholds, [5220000,36435000,85910000]);
  assert.deepEqual(HOTH_DS_TERRITORIES.find((territory) => territory.id === "p6-top").starThresholds, [21600000,44800000,78000000]);
  assert.deepEqual(HOTH_DS_TERRITORIES.find((territory) => territory.id === "p6-bottom").starThresholds, [26400000,65230000,105950000]);
});

test("verified Hoth Hero mission associations are encoded on the correct missions", () => {
  assert.deepEqual(missionById("p1-vader-sm").entry.mandatoryMembers.map((member) => member.baseId), ["VADER"]);
  assert.deepEqual(missionById("p2-snow-empire").entry.mandatoryMembers.map((member) => member.baseId), ["SNOWTROOPER"]);
  assert.deepEqual(missionById("p3-ipd-sm").entry.mandatoryMembers.map((member) => member.baseId), ["VEERS", "COLONELSTARCK"]);
  assert.deepEqual(missionById("p4-power-empire").entry.mandatoryMembers.map((member) => member.baseId), ["VEERS", "SNOWTROOPER"]);
  assert.deepEqual(missionById("p6-ipd-sm").entry.mandatoryMembers.map((member) => member.baseId), ["VEERS", "IMPERIALPROBEDROID"]);
});

test("Jabba and Chimaera added/special mission requirements are explicit", () => {
  const jabba = missionById("p4-jabba-sm");
  assert.equal(jabba.entry.mandatoryMembers[0].baseId, "JABBATHEHUTT");
  assert.equal(jabba.territoryId, "p4-bottom");
  assert.deepEqual(jabba.rewards, ["20 Mk I Guild Event Tokens"]);

  const fleet = missionById("p4-fleet-sm");
  assert.equal(fleet.entry.mandatoryMembers[0].baseId, "CAPITALCHIMAERA");
  assert.deepEqual(fleet.rewards, ["20 Mk I Guild Event Tokens"]);
});

test("IPD shard mission requires the Imperial Trooper pool plus Veers and Starck", () => {
  const mission = missionById("p3-ipd-sm");
  assert.deepEqual(mission.entry.requiredCategories, ["Imperial Trooper"]);
  assert.equal(mission.entry.starsMin, 5);
  assert.deepEqual(mission.rewards, ["1 Imperial Probe Droid shard"]);
  const body = { units: [
    { baseId: "VEERS", name: "General Veers", unitType: "Character", alignment: "Dark", stars: 7, power: 30000, factions: ["Empire", "Imperial Trooper"] },
    { baseId: "COLONELSTARCK", name: "Colonel Starck", unitType: "Character", alignment: "Dark", stars: 7, power: 30000, factions: ["Empire", "Imperial Trooper"] },
    { baseId: "ADMIRALPIETT", name: "Admiral Piett", unitType: "Character", alignment: "Dark", stars: 7, power: 30000, factions: ["Empire", "Imperial Trooper"] },
    { baseId: "RANGETROOPER", name: "Range Trooper", unitType: "Character", alignment: "Dark", stars: 7, power: 30000, factions: ["Empire", "Imperial Trooper"] },
    { baseId: "DARKTROOPER", name: "Dark Trooper", unitType: "Character", alignment: "Dark", stars: 7, power: 30000, factions: ["Empire", "Imperial Trooper"] },
  ] };
  const summary = missionRosterEntrySummary(body, mission);
  assert.equal(summary.ready, true);
  assert.equal(summary.mandatory.complete, true);
});

test("planning templates remain unverified battle-team advice", () => {
  const mission = missionById("p3-ipd-sm");
  assert.equal(recommendationLabel(mission, mission.recommendations[0]), "Unverified Planning Team");
});

test("Hoth DS data and shared renderer parse", () => {
  for (const path of [
    new URL("../public/hoth-ds-data.js", import.meta.url),
    new URL("../public/legacy-tb-command.js", import.meta.url),
    new URL("../public/tb-command-center.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
