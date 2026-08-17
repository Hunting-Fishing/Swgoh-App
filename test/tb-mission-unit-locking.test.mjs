import test from "node:test";
import assert from "node:assert/strict";
import { HOTH_LS_TERRITORIES } from "../public/hoth-ls-data.js";
import { HOTH_DS_TERRITORIES } from "../public/hoth-ds-data.js";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";
import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import { normalizeRoteMission } from "../public/rote-mission-overrides.js";
import {
  isMandatoryMissionUnit,
  legalRosterCandidates,
  missionRosterEntrySummary,
} from "../public/tb-mission-intelligence.js";

function missionFromTerritories(territories, id) {
  return territories.flatMap((territory) => territory.missions || []).find((mission) => mission.id === id);
}

function character(baseId, name, alignment, stars, factions = []) {
  return { baseId, name, unitType: "Character", alignment, stars, relic: 9, power: 40000, factions, categories: factions };
}

function ship(baseId, name, alignment, stars, factions = []) {
  return { baseId, name, unitType: "Ship", alignment, stars, power: 80000, factions, categories: factions };
}

test("ROTE Scythe is a locked Mission Unit, not an optional fleet candidate", () => {
  const raw = ROTE_MISSIONS_BY_PLANET.mustafar.find((mission) => mission.id === "mustafar-fleet");
  const mission = normalizeRoteMission(raw);
  const scythe = ship("SCYTHE", "Scythe", "Dark", 7, ["Empire", "Inquisitorius"]);
  const tie = ship("TIEFIGHTERIMPERIAL", "Imperial TIE Fighter", "Dark", 7, ["Empire"]);

  assert.deepEqual(mission.entry.mandatoryMembers.map((member) => member.baseId), ["SCYTHE"]);
  assert.equal(isMandatoryMissionUnit(scythe, mission), true);
  assert.deepEqual(legalRosterCandidates({ ships: [scythe, tie] }, mission).map((unit) => unit.baseId), ["TIEFIGHTERIMPERIAL"]);

  const summary = missionRosterEntrySummary({ ships: [scythe, tie] }, mission, 2);
  assert.equal(summary.lockedSlots, 1);
  assert.equal(summary.selectableSlots, 1);
  assert.equal(summary.mandatory.complete, true);
  assert.equal(summary.ready, true);
});

test("missing a ROTE Mission Unit blocks entry even when selectable ships are available", () => {
  const raw = ROTE_MISSIONS_BY_PLANET.mustafar.find((mission) => mission.id === "mustafar-fleet");
  const mission = normalizeRoteMission(raw);
  const tie = ship("TIEFIGHTERIMPERIAL", "Imperial TIE Fighter", "Dark", 7, ["Empire"]);
  const bomber = ship("TIEBOMBERIMPERIAL", "TIE Bomber", "Dark", 7, ["Empire"]);
  const summary = missionRosterEntrySummary({ ships: [tie, bomber] }, mission, 2);

  assert.equal(summary.candidates.length, 2);
  assert.equal(summary.mandatory.complete, false);
  assert.equal(summary.ready, false);
});

test("Hoth LS named Hoth Rebel Soldier occupies a locked mission slot", () => {
  const mission = missionFromTerritories(HOTH_LS_TERRITORIES, "p2-ion-rebel");
  const hrs = character("HOTHREBELSOLDIER", "Hoth Rebel Soldier", "Light", 3, ["Rebel"]);
  const luke = character("COMMANDERLUKESKYWALKER", "Commander Luke Skywalker", "Light", 3, ["Rebel"]);

  const summary = missionRosterEntrySummary({ units: [hrs, luke] }, mission, 2);
  assert.equal(summary.lockedSlots, 1);
  assert.deepEqual(summary.candidates.map((unit) => unit.baseId), ["COMMANDERLUKESKYWALKER"]);
  assert.equal(summary.ready, true);
});

test("Hoth DS named Darth Vader occupies a locked mission slot", () => {
  const mission = missionFromTerritories(HOTH_DS_TERRITORIES, "p1-vader-sm");
  const vader = character("VADER", "Darth Vader", "Dark", 4, ["Empire"]);
  const palpatine = character("EMPERORPALPATINE", "Emperor Palpatine", "Dark", 4, ["Empire"]);

  const summary = missionRosterEntrySummary({ units: [vader, palpatine] }, mission, 2);
  assert.equal(summary.lockedSlots, 1);
  assert.deepEqual(summary.candidates.map((unit) => unit.baseId), ["EMPERORPALPATINE"]);
  assert.equal(summary.ready, true);
});

test("Geo LS Anakin Eta-2 is a locked fleet Mission Unit", () => {
  const mission = missionFromTerritories(GEO_LS_TERRITORIES, "p3-fleet-sm");
  const eta = ship("JEDISTARFIGHTERANAKIN", "Anakin's Eta-2 Starfighter", "Light", 7, ["Galactic Republic"]);
  const negotiator = ship("CAPITALNEGOTIATOR", "Negotiator", "Light", 7, ["Galactic Republic"]);

  const summary = missionRosterEntrySummary({ ships: [eta, negotiator] }, mission, 2);
  assert.equal(summary.lockedSlots, 1);
  assert.deepEqual(summary.candidates.map((unit) => unit.baseId), ["CAPITALNEGOTIATOR"]);
  assert.equal(summary.ready, true);
});

test("fixed all-mandatory missions need no optional candidate slots", () => {
  const mission = missionFromTerritories(GEO_LS_TERRITORIES, "p2-mid-gas");
  const gas = character("GENERALSKYWALKER", "General Skywalker", "Light", 7, ["Galactic Republic", "Jedi"]);
  const ahsoka = character("AHSOKATANO", "Ahsoka Tano", "Light", 7, ["Galactic Republic", "Jedi"]);
  gas.power = 22000;
  ahsoka.power = 22000;

  const summary = missionRosterEntrySummary({ units: [gas, ahsoka] }, mission);
  assert.equal(summary.lockedSlots, 2);
  assert.equal(summary.selectableSlots, 0);
  assert.equal(summary.candidates.length, 0);
  assert.equal(summary.ready, true);
});
