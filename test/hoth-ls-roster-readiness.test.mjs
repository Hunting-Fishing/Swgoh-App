import test from "node:test";
import assert from "node:assert/strict";
import { HOTH_LS_TERRITORIES } from "../public/hoth-ls-data.js";
import { missionRosterReadiness, ROSTER_READINESS, STRATEGY_READINESS } from "../public/tb-roster-readiness.js";

const missions = HOTH_LS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const rebel = (baseId, name = baseId, stars = 7) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Light",
  stars,
  gear: 13,
  relic: 5,
  power: 30000,
  speed: 250,
  factions: ["Rebel"],
});

test("Phase 3 ROLO shard mission blocks missing Hoth Rebel Soldier but not historical Captain Han", () => {
  const body = { units: [
    rebel("COMMANDERLUKESKYWALKER", "Commander Luke Skywalker", 7),
    rebel("CAPTAINHANSOLO", "Captain Han Solo", 7),
    rebel("HOTHLEIA", "Rebel Officer Leia Organa", 7),
  ] };
  const result = missionRosterReadiness(body, mission("p3-rolo-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "HOTHREBELSOLDIER"));
  assert.ok(!result.missingUnits.some((row) => row.baseId === "CAPTAINHANSOLO"));
  assert.equal(result.strategy.available, true);
  assert.equal(result.strategy.verified, false);
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});

test("Phase 4 ROLO special blocks missing ROLO but does not require Captain Han", () => {
  const body = { units: [
    rebel("CAPTAINHANSOLO", "Captain Han Solo", 7),
    rebel("HOTHREBELSOLDIER", "Hoth Rebel Soldier", 7),
    rebel("COMMANDERLUKESKYWALKER", "Commander Luke Skywalker", 7),
  ] };
  const result = missionRosterReadiness(body, mission("p4-rolo-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "HOTHLEIA"));
  assert.ok(!result.missingUnits.some((row) => row.baseId === "CAPTAINHANSOLO"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});

test("Phase 5 CLS special uses the actual Commander Luke gate", () => {
  const body = { units: [rebel("HOTHLEIA", "Rebel Officer Leia Organa", 7), rebel("CAPTAINHANSOLO", "Captain Han Solo", 7)] };
  const result = missionRosterReadiness(body, mission("p5-cls-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "COMMANDERLUKESKYWALKER"));
  assert.equal(result.strategy.available, true);
  assert.equal(result.strategy.verified, false);
});

test("Phase 6 ROLO special blocks missing ROLO and keeps Captain Han optional", () => {
  const body = { units: [
    rebel("CAPTAINHANSOLO", "Captain Han Solo", 7),
    rebel("COMMANDERLUKESKYWALKER", "Commander Luke Skywalker", 7),
    rebel("HOTHREBELSOLDIER", "Hoth Rebel Soldier", 7),
  ] };
  const result = missionRosterReadiness(body, mission("p6-rolo-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "HOTHLEIA"));
  assert.ok(!result.missingUnits.some((row) => row.baseId === "CAPTAINHANSOLO"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});
