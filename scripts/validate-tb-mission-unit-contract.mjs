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

const missionFromTerritories = (territories, id) => territories
  .flatMap((territory) => territory.missions || [])
  .find((mission) => mission.id === id);

const character = (baseId, name, alignment, stars, factions = []) => ({
  baseId,
  name,
  unitType: "Character",
  alignment,
  stars,
  relic: 9,
  power: 40000,
  factions,
  categories: factions,
});

const ship = (baseId, name, alignment, stars, factions = []) => ({
  baseId,
  name,
  unitType: "Ship",
  alignment,
  stars,
  power: 80000,
  factions,
  categories: factions,
});

// ROTE: screenshot/in-game semantics — Scythe is shown as a Mission Unit and
// therefore occupies a locked fleet slot rather than an optional candidate slot.
const mustafarRaw = ROTE_MISSIONS_BY_PLANET.mustafar.find((mission) => mission.id === "mustafar-fleet");
const mustafar = normalizeRoteMission(mustafarRaw);
const scythe = ship("SCYTHE", "Scythe", "Dark", 7, ["Empire", "Inquisitorius"]);
const tie = ship("TIEFIGHTERIMPERIAL", "Imperial TIE Fighter", "Dark", 7, ["Empire"]);
assert.deepEqual(mustafar.entry.mandatoryMembers.map((member) => member.baseId), ["SCYTHE"]);
assert.equal(isMandatoryMissionUnit(scythe, mustafar), true);
assert.deepEqual(legalRosterCandidates({ ships: [scythe, tie] }, mustafar).map((unit) => unit.baseId), ["TIEFIGHTERIMPERIAL"]);
const mustafarSummary = missionRosterEntrySummary({ ships: [scythe, tie] }, mustafar, 2);
assert.equal(mustafarSummary.lockedSlots, 1);
assert.equal(mustafarSummary.selectableSlots, 1);
assert.equal(mustafarSummary.ready, true);
assert.equal(missionRosterEntrySummary({ ships: [tie] }, mustafar, 1).ready, false, "Missing Scythe must block the Mustafar fleet mission");

// Hoth LS: Hoth Rebel Soldier is a named mission unit.
const hothLs = missionFromTerritories(HOTH_LS_TERRITORIES, "p2-ion-rebel");
const hrs = character("HOTHREBELSOLDIER", "Hoth Rebel Soldier", "Light", 3, ["Rebel"]);
const cls = character("COMMANDERLUKESKYWALKER", "Commander Luke Skywalker", "Light", 3, ["Rebel"]);
const hothLsSummary = missionRosterEntrySummary({ units: [hrs, cls] }, hothLs, 2);
assert.equal(hothLsSummary.lockedSlots, 1);
assert.deepEqual(hothLsSummary.candidates.map((unit) => unit.baseId), ["COMMANDERLUKESKYWALKER"]);
assert.equal(hothLsSummary.ready, true);

// Hoth DS: Darth Vader is a named mission unit.
const hothDs = missionFromTerritories(HOTH_DS_TERRITORIES, "p1-vader-sm");
const vader = character("VADER", "Darth Vader", "Dark", 4, ["Empire"]);
const palp = character("EMPERORPALPATINE", "Emperor Palpatine", "Dark", 4, ["Empire"]);
const hothDsSummary = missionRosterEntrySummary({ units: [vader, palp] }, hothDs, 2);
assert.equal(hothDsSummary.lockedSlots, 1);
assert.deepEqual(hothDsSummary.candidates.map((unit) => unit.baseId), ["EMPERORPALPATINE"]);
assert.equal(hothDsSummary.ready, true);

// Geo LS: Anakin's Eta-2 is a named fleet mission unit.
const geoFleet = missionFromTerritories(GEO_LS_TERRITORIES, "p3-fleet-sm");
const eta = ship("JEDISTARFIGHTERANAKIN", "Anakin's Eta-2 Starfighter", "Light", 7, ["Galactic Republic"]);
const negotiator = ship("CAPITALNEGOTIATOR", "Negotiator", "Light", 7, ["Galactic Republic"]);
const geoFleetSummary = missionRosterEntrySummary({ ships: [eta, negotiator] }, geoFleet, 2);
assert.equal(geoFleetSummary.lockedSlots, 1);
assert.deepEqual(geoFleetSummary.candidates.map((unit) => unit.baseId), ["CAPITALNEGOTIATOR"]);
assert.equal(geoFleetSummary.ready, true);

// Fixed missions consisting entirely of named Mission Units have zero optional slots.
const gasAhsoka = missionFromTerritories(GEO_LS_TERRITORIES, "p2-mid-gas");
const gas = character("GENERALSKYWALKER", "General Skywalker", "Light", 7, ["Galactic Republic", "Jedi"]);
const ahsoka = character("AHSOKATANO", "Ahsoka Tano", "Light", 7, ["Galactic Republic", "Jedi"]);
gas.power = 22000;
ahsoka.power = 22000;
const gasSummary = missionRosterEntrySummary({ units: [gas, ahsoka] }, gasAhsoka);
assert.equal(gasSummary.lockedSlots, 2);
assert.equal(gasSummary.selectableSlots, 0);
assert.equal(gasSummary.candidates.length, 0);
assert.equal(gasSummary.ready, true);

console.log("[tb-mission-unit-contract] validated Mission Unit = locked mandatory slot across ROTE, Hoth LS/DS and Geo LS");
