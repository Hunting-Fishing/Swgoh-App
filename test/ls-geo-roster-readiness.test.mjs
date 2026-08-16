import test from "node:test";
import assert from "node:assert/strict";
import { GEO_LS_TERRITORIES } from "../public/geo-ls-data.js";
import { missionRosterReadiness, ROSTER_READINESS, STRATEGY_READINESS } from "../public/tb-roster-readiness.js";

const missions = GEO_LS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const unit = (baseId, name = baseId, factions = ["Galactic Republic"]) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Light",
  stars: 7,
  gear: 13,
  relic: 5,
  power: 35000,
  speed: 260,
  factions,
});

test("GAS+Ahsoka P2 readiness blocks the actual missing mandatory unit while strategy stays available", () => {
  const body = { units: [unit("GENERALSKYWALKER", "General Skywalker", ["Galactic Republic", "501st"])] };
  const result = missionRosterReadiness(body, mission("p2-mid-gas"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "AHSOKATANO"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
  assert.equal(result.strategy.verified, true);
});

test("GK/Cody/Clone Sergeant P2 uses the exact three-character roster gate but partial strategy stays unverified", () => {
  const body = { units: [
    unit("GENERALKENOBI", "General Kenobi"),
    unit("CLONESERGEANTPHASEI", "Clone Sergeant - Phase I", ["Galactic Republic", "Clone Trooper"]),
  ] };
  const result = missionRosterReadiness(body, mission("p2-bot-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "CC2224"));
  assert.equal(result.strategy.available, true);
  assert.equal(result.strategy.verified, false);
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});

test("P4 KAM+Shaak special blocks missing KAM without promoting the partial strategy", () => {
  const body = { units: [unit("SHAAKTI", "Shaak Ti", ["Galactic Republic", "Jedi"])] };
  const result = missionRosterReadiness(body, mission("p4-mid-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "KIADIMUNDI"));
  assert.equal(result.strategy.available, true);
  assert.equal(result.strategy.verified, false);
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});

test("P4 GAS+501st missing GAS reports roster block while the battle strategy remains verified", () => {
  const body = { units: [
    unit("CT7567", "CT-7567 Rex", ["Galactic Republic", "Clone Trooper", "501st"]),
    unit("CT5555", "CT-5555 Fives", ["Galactic Republic", "Clone Trooper", "501st"]),
    unit("CT210408", "CT-21-0408 Echo", ["Galactic Republic", "Clone Trooper", "501st"]),
    unit("ARCTROOPER501ST", "ARC Trooper", ["Galactic Republic", "Clone Trooper", "501st"]),
  ] };
  const result = missionRosterReadiness(body, mission("p4-bot-501"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "GENERALSKYWALKER"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
  assert.equal(result.strategy.verified, true);
});
