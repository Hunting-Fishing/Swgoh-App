import test from "node:test";
import assert from "node:assert/strict";
import {
  compareRosters,
  rankRosterFitSquads,
  speedProfile,
  unitDeltaRows,
} from "../public/gac-counter-engine.js";

function abilities(tier = 8, { leader = false, zeta = true } = {}) {
  return [
    { id: "basic", type: "Basic", displayTier: tier, omega: tier >= 8 },
    { id: leader ? "leader_test" : "special", type: leader ? "Leader" : "Special", displayTier: tier, zeta: zeta && tier >= 7 },
    { id: "unique", type: "Unique", displayTier: tier, zeta: zeta && tier >= 7 },
  ];
}

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
    abilities: abilities(8),
    ...overrides,
  };
}

function player(name, units, overrides = {}) {
  return {
    player: { name, allyCode: name === "Warmbacon" ? "732764286" : "123456789", galacticPower: 10_000_000, characterGalacticPower: 6_000_000 },
    competitive: { gacSkillRating: 2500, gacLeague: "Chromium", gacDivision: 3 },
    summary: { sixDotMods: 300, datacrons: 12 },
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
  ], { summary: { sixDotMods: 300, datacrons: 8 } });
  const comparison = compareRosters(mine, theirs);
  assert.equal(comparison.delta.relicTotal, 3);
  assert.equal(comparison.delta.zetas, 1);
  assert.equal(comparison.delta.omicrons, 1);
  assert.equal(comparison.delta.datacrons, 4);
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

test("speed profile distinguishes fastest, leader and median disadvantages", () => {
  const mine = [
    unit("LEAD", { speed: 270 }),
    unit("A", { speed: 280 }),
    unit("B", { speed: 260 }),
  ];
  const enemy = [
    unit("E_LEAD", { speed: 330 }),
    unit("E_A", { speed: 320 }),
    unit("E_B", { speed: 300 }),
  ];
  const profile = speedProfile(mine, enemy);
  assert.equal(profile.known, true);
  assert.equal(profile.fastestEdge, -50);
  assert.equal(profile.leaderEdge, -60);
  assert.equal(profile.medianEdge, -40);
  assert.ok(profile.risk >= 18);
  assert.equal(profile.label, "Severe speed risk");
});

test("rankRosterFitSquads only returns squads that exist in the owned roster", () => {
  const leader = unit("LEADER", {
    relic: 8,
    speed: 330,
    zetas: 2,
    omicrons: 1,
    abilities: abilities(8, { leader: true }),
  });
  const mine = player("Warmbacon", [
    leader,
    unit("ALLY1", { relic: 8 }),
    unit("ALLY2", { relic: 7 }),
    unit("ALLY3", { relic: 7 }),
    unit("ALLY4", { relic: 6 }),
    unit("OUTSIDER", { factions: ["Empire"], relic: 9, abilities: abilities(8, { leader: true }) }),
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
  assert.equal(results[0].abilityReadiness.known, true);
  assert.ok(Number.isFinite(results[0].speedRisk));
});

test("strategic reserve units are penalized rather than silently excluded", () => {
  const reserveLeader = unit("RESERVE_LEAD", {
    relic: 9,
    power: 48_000,
    speed: 350,
    abilities: abilities(8, { leader: true }),
  });
  const normalLeader = unit("NORMAL_LEAD", {
    relic: 8,
    power: 43_000,
    speed: 335,
    factions: ["Rebel"],
    abilities: abilities(8, { leader: true }),
  });
  const mine = player("Warmbacon", [
    reserveLeader,
    unit("R2", { relic: 9 }),
    unit("R3", { relic: 9 }),
    unit("R4", { relic: 9 }),
    unit("R5", { relic: 9 }),
    normalLeader,
    unit("N2", { relic: 8, factions: ["Rebel"] }),
    unit("N3", { relic: 8, factions: ["Rebel"] }),
    unit("N4", { relic: 8, factions: ["Rebel"] }),
    unit("N5", { relic: 8, factions: ["Rebel"] }),
  ]);
  const defense = [
    unit("D1", { relic: 7, factions: ["Sith"] }),
    unit("D2", { relic: 7, factions: ["Sith"] }),
    unit("D3", { relic: 7, factions: ["Sith"] }),
    unit("D4", { relic: 7, factions: ["Sith"] }),
    unit("D5", { relic: 7, factions: ["Sith"] }),
  ];
  const ranked = rankRosterFitSquads(mine, defense, {
    size: 5,
    reserveBaseIds: ["RESERVE_LEAD"],
    reservePenaltyPerUnit: 40,
  });
  const reserve = ranked.find((result) => result.reserveUses.includes("RESERVE_LEAD"));
  const normal = ranked.find((result) => result.squad[0]?.baseId === "NORMAL_LEAD");
  assert.ok(reserve, "expected the reserve squad to remain available as a fallback");
  assert.ok(normal, "expected a non-reserve alternative");
  assert.equal(reserve.reservePenalty, 40);
  assert.ok(normal.score > reserve.score, "reserve penalty should protect the stronger strategic squad when a normal alternative exists");
});
