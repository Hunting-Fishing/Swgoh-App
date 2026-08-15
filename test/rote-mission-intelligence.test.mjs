import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROTE_PLANETS } from "../public/rote-map-data.js";
import { ROTE_MISSIONS_BY_PLANET, ROTE_MISSION_COUNT, roteMissionsForPlanet } from "../public/rote-mission-data.js";
import { mandatoryUnitMeetsEntry, missionRosterEntrySummary } from "../public/tb-mission-intelligence.js";

const allMissions = () => Object.values(ROTE_MISSIONS_BY_PLANET).flat();
const missionById = (id) => allMissions().find((mission) => mission.id === id);
const mandatoryBaseIds = () => allMissions().flatMap((mission) => mission.entry?.mandatoryMembers || []).map((member) => member.baseId).filter(Boolean);

test("ROTE exact mission catalog covers every map planet", () => {
  assert.equal(ROTE_PLANETS.length, 20);
  assert.equal(Object.keys(ROTE_MISSIONS_BY_PLANET).length, 20);
  for (const planet of ROTE_PLANETS) assert.ok(roteMissionsForPlanet(planet.id).length > 0, `${planet.id} should have exact mission records`);
  assert.equal(ROTE_MISSION_COUNT, 98);
});

test("ROTE phase relic floors are encoded on character missions", () => {
  assert.equal(missionById("mustafar-lv").entry.relicMin, 5);
  assert.equal(missionById("geonosis-geos").entry.relicMin, 6);
  assert.equal(missionById("dathomir-merrin").entry.relicMin, 7);
  assert.equal(missionById("haven-reva").entry.relicMin, 8);
  assert.equal(missionById("malachor-inqs").entry.relicMin, 9);
  assert.equal(missionById("death-star-vader").entry.relicMin, 9);
});

test("Bracca Zeffo unlock requires Cere plus one legal Cal at R7", () => {
  const mission = missionById("bracca-zeffo-unlock");
  assert.equal(mission.entry.squadSize, 2);
  assert.equal(mission.entry.relicMin, 7);
  assert.deepEqual(mission.entry.allowedBaseIds, ["CEREJUNDA", "CALKESTIS", "JEDIKNIGHTCAL"]);
  assert.equal(mission.entry.mandatoryMembers[0].baseId, "CEREJUNDA");

  const cere = { baseId: "CEREJUNDA", name: "Cere Junda", unitType: "Character", alignment: "Light", stars: 7, relic: 7, factions: ["Unaligned Force User"] };
  const cal = { baseId: "CALKESTIS", name: "Cal Kestis", unitType: "Character", alignment: "Light", stars: 7, relic: 7, factions: ["Unaligned Force User"] };
  assert.equal(missionRosterEntrySummary({ units: [cere] }, mission).ready, false);
  assert.equal(missionRosterEntrySummary({ units: [cere, cal] }, mission).ready, true);
});

test("Mandalore Bo-Katan mission applies R9 to the canonical BKM unit while keeping R8 planet baseline", () => {
  const mission = missionById("mandalore-bkm");
  const boRequirement = mission.entry.mandatoryMembers[0];
  assert.equal(mission.entry.relicMin, 8);
  assert.equal(boRequirement.relicMin, 9);
  assert.equal(boRequirement.baseId, "MANDALORBOKATAN");
  const boR8 = { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", unitType: "Character", alignment: "Light", stars: 7, relic: 8 };
  const boR9 = { ...boR8, relic: 9 };
  assert.equal(mandatoryUnitMeetsEntry(boR8, mission, boRequirement), false);
  assert.equal(mandatoryUnitMeetsEntry(boR9, mission, boRequirement), true);
});

test("key ROTE special and named missions preserve canonical mandatory unit IDs", () => {
  assert.deepEqual(missionById("corellia-qira").entry.mandatoryMembers.map((member) => member.baseId), ["QIRA", "YOUNGHAN"]);
  assert.equal(missionById("tatooine-reva").entry.mandatoryMembers[0].baseId, "GRANDINQUISITOR");
  assert.deepEqual(missionById("tatooine-mandalore-unlock").entry.mandatoryMembers.map((member) => member.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR"]);
  assert.equal(missionById("mandalore-bkm").entry.mandatoryMembers[0].baseId, "MANDALORBOKATAN");
  assert.equal(missionById("mandalore-dtmg").entry.mandatoryMembers[0].baseId, "MOFFGIDEONS3");
  assert.equal(missionById("haven-reva").entry.mandatoryMembers[0].baseId, "THIRDSISTER");
  assert.deepEqual(missionById("kessel-qira-l3").entry.mandatoryMembers.map((member) => member.baseId), ["QIRA", "L3_37"]);
  assert.deepEqual(missionById("malachor-inqs").entry.mandatoryMembers.map((member) => member.baseId), ["EIGHTHBROTHER", "FIFTHBROTHER", "SEVENTHSISTER"]);
  assert.deepEqual(missionById("hoth-aphra").entry.mandatoryMembers.map((member) => member.baseId), ["DOCTORAPHRA", "BT1", "TRIPLEZERO"]);
  assert.deepEqual(missionById("scarif-baze").entry.mandatoryMembers.map((member) => member.baseId), ["BAZEMALBUS", "CHIRRUTIMWE", "SCARIFREBEL"]);
});

test("ROTE mandatory-unit gates reject known stale aliases", () => {
  const ids = mandatoryBaseIds();
  for (const staleId of ["BOKATANMANDALORE", "BESKARMANDO", "DARKTROOPERMOFFGIDEON", "L337", "000"]) {
    assert.ok(!ids.includes(staleId), `stale ROTE mandatory baseId must not return: ${staleId}`);
  }
  for (const canonicalId of ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR", "MOFFGIDEONS3", "L3_37", "TRIPLEZERO"]) {
    assert.ok(ids.includes(canonicalId), `canonical ROTE mandatory baseId missing: ${canonicalId}`);
  }
});

test("canonical Tatooine Mandalore requirements match real roster base IDs", () => {
  const mission = missionById("tatooine-mandalore-unlock");
  const [bkmRequirement, bamRequirement] = mission.entry.mandatoryMembers;
  const bkm = { baseId: "MANDALORBOKATAN", name: "Bo-Katan (Mand'alor)", unitType: "Character", alignment: "Light", stars: 7, relic: 7, factions: ["Mandalorian"] };
  const bam = { baseId: "THEMANDALORIANBESKARARMOR", name: "The Mandalorian (Beskar Armor)", unitType: "Character", alignment: "Light", stars: 7, relic: 7, factions: ["Mandalorian"] };
  assert.equal(mandatoryUnitMeetsEntry(bkm, mission, bkmRequirement), true);
  assert.equal(mandatoryUnitMeetsEntry(bam, mission, bamRequirement), true);
});

test("Zeffo combat mechanics keep official Tomb Guardian stun warning", () => {
  const clones = missionById("zeffo-clones");
  assert.ok(clones.mechanics.some((text) => /cannot be defeated unless they are stunned/i.test(text)));
  assert.deepEqual(clones.entry.requiredCategories, ["Clone Trooper"]);
  assert.deepEqual(clones.rewards, ["50 Mk II Guild Event Tokens per clear"]);
});

test("ROTE mission modules parse and loader remains lazy", () => {
  for (const path of [
    new URL("../public/rote-mission-data.js", import.meta.url),
    new URL("../public/rote-mission-pro.js", import.meta.url),
    new URL("../public/tb-mission-intelligence.js", import.meta.url),
  ]) execFileSync(process.execPath, ["--check", path.pathname]);
});
