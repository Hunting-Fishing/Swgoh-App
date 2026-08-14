import assert from "node:assert/strict";
import test from "node:test";
import { intrinsicUpgradeScore, readinessAnalysis } from "../public/readiness-policy.js";

test("crewless maxed ship is 100 percent without speed or pilot assumptions", () => {
  const ship = {
    unitType: "Ship",
    stars: 7,
    level: 85,
    maxRarity: 7,
    maxLevel: 85,
    crew: [],
    speed: 98,
    abilities: [
      { tier: 8, maxTier: 8 },
      { tier: 8, maxTier: 8 },
      { tier: 3, maxTier: 3 },
    ],
    readiness: 57,
  };

  const result = readinessAnalysis(ship);
  assert.equal(result.score, 100);
  assert.equal(result.band, "MAXED");
  assert.equal(result.crewless, true);
  assert.equal(ship.readiness, 100);
});

test("ship ability progression lowers completion while speed does not", () => {
  const base = {
    unitType: "Ship",
    stars: 7,
    level: 85,
    maxRarity: 7,
    maxLevel: 85,
    crew: ["PILOT"],
    abilities: [{ tier: 4, maxTier: 8 }],
  };

  const slow = intrinsicUpgradeScore({ ...base, speed: 90 });
  const fast = intrinsicUpgradeScore({ ...base, speed: 220 });
  assert.equal(slow.score, fast.score);
  assert.equal(slow.score, 83);
});

test("character completion includes stars level gear/relic and abilities but not speed", () => {
  const character = {
    unitType: "Character",
    stars: 7,
    level: 85,
    gear: 13,
    relic: 9,
    maxRelic: 9,
    speed: 100,
    abilities: [{ tier: 8, maxTier: 8 }],
  };
  assert.equal(intrinsicUpgradeScore(character).score, 100);
  assert.equal(intrinsicUpgradeScore({ ...character, speed: 400 }).score, 100);
});
