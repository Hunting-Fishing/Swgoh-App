import test from "node:test";
import assert from "node:assert/strict";
import {
  fastestSpeed,
  formatSigned,
  matchupDelta,
  normalizeBaseId,
  rosterIndex,
  unitsForIds,
} from "../public/gac-war-room-matchup-deltas.js";

function unit(baseId, overrides = {}) {
  return {
    baseId,
    unitType: "Character",
    relic: 5,
    zetas: 1,
    omicrons: 0,
    speed: 300,
    abilities: [
      { id: `${baseId}_basic`, displayTier: 8, omega: true },
      { id: `${baseId}_unique`, displayTier: 8, zeta: true },
    ],
    ...overrides,
  };
}

test("matchup delta exposes relic, zeta, omicron, speed and ability-readiness differences", () => {
  const attackers = [
    unit("A", { relic: 8, zetas: 2, omicrons: 1, speed: 365 }),
    unit("B", { relic: 7, zetas: 1, omicrons: 0, speed: 330 }),
    unit("C", { relic: 7, zetas: 1, omicrons: 0, speed: 320 }),
  ];
  const defenders = [
    unit("X", { relic: 7, zetas: 1, omicrons: 1, speed: 350 }),
    unit("Y", { relic: 6, zetas: 1, omicrons: 0, speed: 305 }),
    unit("Z", { relic: 6, zetas: 1, omicrons: 0, speed: 300 }),
  ];
  const result = matchupDelta(attackers, defenders);
  assert.equal(result.known, true);
  assert.equal(result.relicDelta, 3);
  assert.equal(result.zetaDelta, 1);
  assert.equal(result.omicronDelta, 0);
  assert.equal(result.speedDelta, 15);
  assert.equal(result.abilityDelta, 0);
  assert.equal(result.attackerAbilityScore, result.defenderAbilityScore);
});

test("unknown speed and ability evidence remain unknown rather than fake zero", () => {
  const result = matchupDelta(
    [{ baseId: "A", unitType: "Character", relic: 5, zetas: 1, omicrons: 0, speed: 0, abilities: [] }],
    [{ baseId: "B", unitType: "Character", relic: 5, zetas: 1, omicrons: 0, speed: 0, abilities: [] }],
  );
  assert.equal(result.known, true);
  assert.equal(result.speedDelta, null);
  assert.equal(result.abilityDelta, null);
  assert.equal(result.attackerAbilityScore, null);
  assert.equal(result.defenderAbilityScore, null);
  assert.equal(formatSigned(result.speedDelta), "—");
  assert.equal(formatSigned(result.abilityDelta), "—");
});

test("formatting keeps signed matchup direction explicit", () => {
  assert.equal(formatSigned(7), "+7");
  assert.equal(formatSigned(-12), "−12");
  assert.equal(formatSigned(0), "0");
  assert.equal(formatSigned(null), "—");
});

test("roster lookup normalizes base IDs and excludes ships", () => {
  const body = {
    units: [
      unit("char_a:SEVEN_STAR"),
      { baseId: "SHIP_A", unitType: "Ship", relic: 9 },
    ],
  };
  const index = rosterIndex(body);
  assert.equal(index.has("CHAR_A"), true);
  assert.equal(index.has("SHIP_A"), false);
  assert.equal(normalizeBaseId("char_a:SEVEN_STAR"), "CHAR_A");
  assert.equal(unitsForIds(index, ["char_a"]).length, 1);
});

test("fastest speed reports the strongest known turn-order point", () => {
  assert.equal(fastestSpeed([{ speed: 250 }, { speed: 333 }, { speed: 299 }]), 333);
  assert.equal(fastestSpeed([]), 0);
});
