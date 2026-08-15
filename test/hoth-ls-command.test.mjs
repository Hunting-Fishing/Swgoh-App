import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { HOTH_LS_TERRITORIES, HOTH_LS_CAMPAIGN } from "../public/hoth-ls-data.js";
import { missionRosterEntrySummary } from "../public/tb-mission-intelligence.js";

const missionById = (id) => HOTH_LS_TERRITORIES.flatMap((territory) => territory.missions).find((mission) => mission.id === id);

test("Hoth Rebel Assault exposes all sixteen six-phase territories", () => {
  assert.equal(HOTH_LS_TERRITORIES.length, 16);
  assert.deepEqual([1,2,3,4,5,6].map((phase) => HOTH_LS_TERRITORIES.filter((territory) => territory.phase === phase).length), [1,2,3,3,3,3]);
  assert.equal(HOTH_LS_CAMPAIGN.theme, "hoth-light");
});

test("Hoth LS zone thresholds include current opening and final territories", () => {
  assert.deepEqual(HOTH_LS_TERRITORIES.find((territory) => territory.id === "p1-main").starThresholds, [885000,6580000,45600000]);
  assert.deepEqual(HOTH_LS_TERRITORIES.find((territory) => territory.id === "p6-middle").starThresholds, [31000000,72000000,100000000]);
  assert.deepEqual(HOTH_LS_TERRITORIES.find((territory) => territory.id === "p6-top").starThresholds, [21600000,40800000,60000000]);
});

test("named Hoth mission requirements are tied to the correct mission records", () => {
  assert.equal(missionById("p2-ion-rebel").entry.mandatoryMembers[0].baseId, "HOTHREBELSOLDIER");
  assert.equal(missionById("p3-trenches-rebel").entry.mandatoryMembers[0].baseId, "HOTHREBELSCOUT");
  assert.equal(missionById("p3-rolo-shard").entry.mandatoryMembers[0].baseId, "HOTHREBELSOLDIER");
  assert.equal(missionById("p4-trenches-rebel").entry.mandatoryMembers[0].baseId, "HOTHREBELSOLDIER");
  assert.equal(missionById("p4-rolo").entry.mandatoryMembers[0].baseId, "HOTHLEIA");
  assert.equal(missionById("p5-rebel-scout").entry.mandatoryMembers[0].baseId, "HOTHREBELSCOUT");
  assert.equal(missionById("p5-cls").entry.mandatoryMembers[0].baseId, "COMMANDERLUKESKYWALKER");
  assert.equal(missionById("p6-rolo").entry.mandatoryMembers[0].baseId, "HOTHLEIA");
});

test("Hoth LS faction missions stay explicit", () => {
  assert.deepEqual(missionById("p1-phoenix").entry.requiredCategories, ["Phoenix"]);
  assert.deepEqual(missionById("p2-overlook-rogue").entry.requiredCategories, ["Rogue One"]);
  assert.deepEqual(missionById("p6-rebel").entry.requiredCategories, ["Rebel"]);
  assert.deepEqual(missionById("p6-rogue").entry.requiredCategories, ["Rogue One"]);
});

test("Hoth named mission entry requires both named unit and sufficient legal roster depth", () => {
  const mission = missionById("p5-cls");
  const cls = { baseId: "COMMANDERLUKESKYWALKER", name: "Commander Luke Skywalker", unitType: "Character", alignment: "Light", stars: 6, power: 30000, factions: ["Rebel"] };
  const body = { units: [cls] };
  const summary = missionRosterEntrySummary(body, mission);
  assert.equal(summary.mandatory.ready, 1);
  assert.equal(summary.mandatory.complete, true);
  assert.equal(summary.ready, false);
});

test("Hoth LS data and shared map modules parse", () => {
  for (const path of [
    new URL("../public/hoth-ls-data.js", import.meta.url),
    new URL("../public/legacy-tb-command.js", import.meta.url),
    new URL("../public/tb-command-center.js", import.meta.url),
  ]) {
    execFileSync(process.execPath, ["--check", path.pathname]);
  }
});
