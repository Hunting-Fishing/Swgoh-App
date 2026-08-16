import test from "node:test";
import assert from "node:assert/strict";
import { DS_GEO_MISSIONS } from "../public/ds-geo-mission-overrides.js";
import { missionRosterReadiness, ROSTER_READINESS, STRATEGY_READINESS } from "../public/tb-roster-readiness.js";

const mission = (id) => DS_GEO_MISSIONS.find((row) => row.id === id);
const sep = (baseId, name = baseId, power = 30000) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Dark",
  stars: 7,
  gear: 13,
  relic: 5,
  power,
  speed: 250,
  factions: ["Separatist"],
});

test("P4 Wat readiness blocks on the actual mandatory Wat roster gate", () => {
  const body = { units: [sep("COUNTDOOKU"), sep("B1BATTLEDROIDV2"), sep("B2SUPERBATTLEDROID"), sep("DROIDEKA"), sep("MAGNAGUARD")] };
  const result = missionRosterReadiness(body, mission("s4"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "WATTAMBOR"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
  assert.equal(result.strategy.available, true);
  assert.equal(result.strategy.verified, false);
});

test("P4 Dooku strategy is verified independently from a roster gap", () => {
  const body = { units: [sep("WATTAMBOR"), sep("B1BATTLEDROIDV2"), sep("B2SUPERBATTLEDROID"), sep("DROIDEKA"), sep("MAGNAGUARD")] };
  const result = missionRosterReadiness(body, mission("c21"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "COUNTDOOKU"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
  assert.equal(result.strategy.verified, true);
});

test("P1 Nute special readiness checks the verified four-unit core", () => {
  const body = { units: [sep("NUTEGUNRAY"), sep("B1BATTLEDROIDV2"), sep("B2SUPERBATTLEDROID"), sep("MAGNAGUARD"), sep("COUNTDOOKU")] };
  const result = missionRosterReadiness(body, mission("s1"));
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.ok(result.missingUnits.some((row) => row.baseId === "DROIDEKA"));
  assert.ok(!result.missingUnits.some((row) => row.baseId === "MAGNAGUARD"));
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
});
