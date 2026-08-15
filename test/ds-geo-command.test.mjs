import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  DS_GEO_TERRITORIES,
  DS_GEO_MISSIONS,
  dsGeoTerritoryById,
  dsGeoTerritoriesForPhase,
} from "../public/ds-geo-data.js";
import {
  createMissionRecord,
  normalizeRecommendation,
  rosterUnitMeetsEntry,
  recommendationRosterFit,
  legalRosterCandidates,
} from "../public/tb-mission-intelligence.js";

test("DS Geo full map has all 11 territories and 28 missions", () => {
  assert.equal(DS_GEO_TERRITORIES.length, 11);
  assert.equal(DS_GEO_MISSIONS.length, 28);
  assert.equal(dsGeoTerritoriesForPhase(1).length, 2);
  assert.equal(dsGeoTerritoriesForPhase(2).length, 3);
  assert.equal(dsGeoTerritoriesForPhase(3).length, 3);
  assert.equal(dsGeoTerritoriesForPhase(4).length, 3);
});

test("DS Geo territory star thresholds match the verified zone table", () => {
  assert.deepEqual(dsGeoTerritoryById("p1-top").starThresholds, [65720000, 84340000, 109530000]);
  assert.deepEqual(dsGeoTerritoryById("p2-middle").starThresholds, [61025000, 95355000, 190710000]);
  assert.deepEqual(dsGeoTerritoryById("p4-middle").starThresholds, [70460000, 192160000, 320265000]);
  assert.deepEqual(dsGeoTerritoryById("p4-bottom").starThresholds, [67565000, 144775000, 241295000]);
});

test("Wat mission is a verified 7-star 16.5k Geonosian gate", () => {
  const wat = DS_GEO_MISSIONS.find((mission) => mission.id === "s3");
  assert.ok(wat);
  assert.equal(wat.entry.verified, true);
  assert.equal(wat.entry.starsMin, 7);
  assert.equal(wat.entry.powerMin, 16500);
  assert.deepEqual(wat.entry.requiredCategories, ["Geonosian"]);
  assert.match(wat.rewards[0], /Wat Tambor/i);
});

test("Separatist Droid mission requires both Separatist and Droid categories", () => {
  const mission = DS_GEO_MISSIONS.find((item) => item.id === "c15");
  const legal = { unitType: "Character", alignment: "Dark", stars: 7, power: 25000, factions: ["Separatist", "Droid"] };
  const onlyDroid = { ...legal, factions: ["Droid"] };
  assert.equal(rosterUnitMeetsEntry(legal, mission), true);
  assert.equal(rosterUnitMeetsEntry(onlyDroid, mission), false);
});

test("Dark/Neutral character gates reject Light Side and ships", () => {
  const mission = DS_GEO_MISSIONS.find((item) => item.id === "c1");
  assert.equal(rosterUnitMeetsEntry({ unitType: "Character", alignment: "Dark", stars: 6 }, mission), true);
  assert.equal(rosterUnitMeetsEntry({ unitType: "Character", alignment: "Neutral", stars: 6 }, mission), true);
  assert.equal(rosterUnitMeetsEntry({ unitType: "Character", alignment: "Light", stars: 7 }, mission), false);
  assert.equal(rosterUnitMeetsEntry({ unitType: "Ship", alignment: "Dark", stars: 7 }, mission), false);
});

test("fleet mission evaluates body.ships instead of character roster only", () => {
  const mission = DS_GEO_MISSIONS.find((item) => item.id === "c5");
  const body = {
    units: [{ baseId: "VADER", name: "Darth Vader", unitType: "Character", alignment: "Dark", stars: 7, power: 30000 }],
    ships: [
      { baseId: "SHIP_A", name: "Dark Ship A", unitType: "Ship", alignment: "Dark", stars: 7, power: 90000 },
      { baseId: "SHIP_B", name: "Light Ship", unitType: "Ship", alignment: "Light", stars: 7, power: 90000 },
    ],
  };
  const candidates = legalRosterCandidates(body, mission);
  assert.deepEqual(candidates.map((unit) => unit.baseId), ["SHIP_A"]);
});

test("community recommendation members resolve by live roster name and expose entry gaps", () => {
  const mission = createMissionRecord({
    id: "geo-test",
    entry: { verified: true, unitType: "Character", starsMin: 7, powerMin: 16500, requiredCategories: ["Geonosian"] },
  });
  const recommendation = normalizeRecommendation({ members: ["Geonosian Brood Alpha", "Geonosian Spy"] });
  const body = { units: [
    { baseId: "GBA", name: "Geonosian Brood Alpha", unitType: "Character", stars: 7, power: 22000, factions: ["Geonosian"] },
    { baseId: "SPY", name: "Geonosian Spy", unitType: "Character", stars: 6, power: 15000, factions: ["Geonosian"] },
  ] };
  const fit = recommendationRosterFit(body, mission, recommendation);
  assert.equal(fit.owned, 2);
  assert.equal(fit.legal, 1);
  assert.equal(fit.rows[1].gap.stars, 1);
  assert.equal(fit.rows[1].gap.power, 1500);
});

test("ambiguous Dooku/Asajj restriction stays fail-closed", () => {
  const mission = DS_GEO_MISSIONS.find((item) => item.id === "c8");
  assert.equal(mission.entry.verified, false);
  assert.match(mission.entry.notes, /unverified/i);
});

test("DS Geo browser modules parse", () => {
  for (const path of [
    new URL("../public/ds-geo-data.js", import.meta.url),
    new URL("../public/ds-geo-command.js", import.meta.url),
    new URL("../public/tb-mission-intelligence.js", import.meta.url),
    new URL("../public/tb-command-center.js", import.meta.url),
  ]) {
    execFileSync(process.execPath, ["--check", path.pathname]);
  }
});
