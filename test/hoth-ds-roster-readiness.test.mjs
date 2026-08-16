import test from "node:test";
import assert from "node:assert/strict";
import { HOTH_DS_TERRITORIES } from "../public/hoth-ds-data.js";
import { missionRosterReadiness, ROSTER_READINESS, STRATEGY_READINESS } from "../public/tb-roster-readiness.js";

const missions = HOTH_DS_TERRITORIES.flatMap((territory) => territory.missions || []);
const mission = (id) => missions.find((row) => row.id === id);
const character = (baseId, name = baseId, factions = ["Empire", "Imperial Trooper"], stars = 7) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Dark",
  stars,
  gear: 13,
  relic: 5,
  power: 30000,
  speed: 250,
  factions,
});
const ship = (baseId, name = baseId, stars = 7) => ({ baseId, name, unitType: "Ship", alignment: "Dark", stars, power: 80000, factions: ["Empire"] });

test("Phase 3 IPD shard mission blocks missing Starck while verified strategy remains available", () => {
  const body = { units: [
    character("VEERS", "General Veers"),
    character("ADMIRALPIETT", "Admiral Piett"),
    character("RANGETROOPER", "Range Trooper"),
    character("STORMTROOPER", "Stormtrooper"),
  ] };
  const result = missionRosterReadiness(body, mission("p3-ipd-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "COLONELSTARCK"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
  assert.equal(result.strategy.verified, true);
});

test("Phase 6 special blocks missing IPD while verified strategy remains available", () => {
  const body = { units: [
    character("VEERS", "General Veers", ["Empire", "Imperial Trooper"]),
    character("COLONELSTARCK", "Colonel Starck", ["Empire", "Imperial Trooper"]),
    character("DEATHTROOPER", "Death Trooper", ["Empire", "Imperial Trooper"]),
    character("SHORETROOPER", "Shoretrooper", ["Empire", "Imperial Trooper"]),
  ] };
  const result = missionRosterReadiness(body, mission("p6-ipd-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "IMPERIALPROBEDROID"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
  assert.equal(result.strategy.verified, true);
});

test("Jabba Hoth battle distinguishes roster block from strategy availability", () => {
  const body = { units: [character("VADER", "Darth Vader", ["Empire"]), character("VEERS", "General Veers")] };
  const result = missionRosterReadiness(body, mission("p4-jabba-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "JABBATHEHUTT"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
});

test("Chimaera fleet special blocks missing Chimaera but strategy remains explicitly unverified", () => {
  const body = { units: [ship("CAPITALEXECUTOR", "Executor"), ship("HOUNDSTOOTH", "Hound's Tooth")] };
  const result = missionRosterReadiness(body, mission("p4-fleet-sm"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "CAPITALCHIMAERA"));
  assert.equal(result.strategy.available, true);
  assert.equal(result.strategy.verified, false);
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});
