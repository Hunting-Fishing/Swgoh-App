import test from "node:test";
import assert from "node:assert/strict";
import {
  compareRosters,
  rankRosterFitSquads,
  unitDeltaRows,
} from "../public/gac-counter-engine.js";

function unit(baseId, overrides = {}) {
  return {
    baseId,
    name: baseId,
    unitType: "Character",
    stars: 7,
    gear: 13,
    relic: 5,
    power: 30_000,
    speed: 250,
    zetas: 1,
    omicrons: 0,
    factions: ["Galactic Republic", "Jedi"],
    abilities: [],
    ...overrides,
  };
}

function player(name, units, overrides = {}) {
  return {
    player: { name, allyCode: name === "Warmbacon" ? "732764286" : "123456789", galacticPower: 10_000_000, characterGalacticPower: 6_000_000 },
    competitive: { gacSkillRating: 2500, gacLeague: "Chromium", gacDivision: 3 },
    summary: { sixDotMods: 300 },
    units,
    ...overrides,
  };
}

test("compareRosters calculates relic, zeta and omicron deltas from live normalized units", () => {
  const mine = player("Warmbacon", [
    unit("A", { relic: 8, zetas: 2, omicrons: 1 }),
    unit("B", { relic: 7, zetas: 1 }),
  ]);
  const theirs = player("Navygators", [
    unit("A", { relic: 7, zetas: 1, omicrons: 0 }),
    unit("B", { relic: 5, zetas: 1, omicrons: 0 }),
  ]);
  const comparison = compareRosters(mine, theirs);
  assert.equal(comparison.delta.relicTotal, 3);
  assert.equal(comparison.delta.zetas, 1);
  assert.equal(comparison.delta.omicrons, 1);
});

test("unitDeltaRows aligns the same character across both rosters", () => {
  const mine = player("Warmbacon", [unit("A", { relic: 8, speed: 310, omicrons: 1 })]);
  const theirs = player("Navygators", [unit("A", { relic: 7, speed: 290, omicrons: 0 })]);
  const [row] = unitDeltaRows(mine, theirs);
  assert.equal(row.baseId, "A");
  assert.equal(row.relicDelta, 1);
  assert.equal(row.speedDelta, 20);
  assert.equal(row.omicronDelta, 1);
});

test("rankRosterFitSquads only returns squads that exist in the owned roster", () => {
  const leader = unit("LEADER", {
    relic: 8,
    speed: 330,
    zetas: 2,
    omicrons: 1,
    abilities: [{ id: "leader_test", type: "Leader" }],
  });
  const mine = player("Warmbacon", [
    leader,
    unit("ALLY1", { relic: 8 }),
    unit("ALLY2", { relic: 7 }),
    unit("ALLY3", { relic: 7 }),
    unit("ALLY4", { relic: 6 }),
    unit("OUTSIDER", { factions: ["Empire"], relic: 9 }),
  ]);
  const defense = [
    unit("DEF1", { relic: 7, factions: ["Sith"] }),
    unit("DEF2", { relic: 7, factions: ["Sith"] }),
    unit("DEF3", { relic: 7, factions: ["Sith"] }),
    unit("DEF4", { relic: 7, factions: ["Sith"] }),
    unit("DEF5", { relic: 7, factions: ["Sith"] }),
  ];
  const results = rankRosterFitSquads(mine, defense, { size: 5 });
  assert.ok(results.length > 0);
  assert.equal(results[0].squad.length, 5);
  const ownedIds = new Set(mine.units.map((entry) => entry.baseId));
  assert.ok(results[0].squad.every((entry) => ownedIds.has(entry.baseId)));
});