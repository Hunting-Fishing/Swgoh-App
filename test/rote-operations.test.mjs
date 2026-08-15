import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRoteOperations, readyOccurrences } from "../rote-operations.mjs";

const fixture = [
  {
    id: "P1-C1",
    linkedConflictId: "tb3_mixed_phase01_conflict01",
    phase: "P1",
    squads: [{ id: "platoon-1", units: [
      { baseId: "A", nameKey: "Alpha", combatType: 1, unitRelicTier: 7, rarity: 7 },
      { baseId: "SHIP", nameKey: "Ship", combatType: 2, unitRelicTier: 7, rarity: 7 },
    ] }],
  },
  {
    id: "P2-C1",
    phase: "P2",
    squads: [{ id: "platoon-2", units: [
      { baseId: "A", nameKey: "Alpha", combatType: 1, unitRelicTier: 8, rarity: 7 },
      { baseId: "B", nameKey: "Beta", combatType: 1, unitRelicTier: 9, rarity: 7 },
    ] }],
  },
];

test("aggregates exact ROTE operation demand, slots and normalized relic tiers", () => {
  const result = aggregateRoteOperations(fixture);
  assert.equal(result.totalSlots, 4);
  assert.equal(result.slots.length, 4);
  assert.deepEqual(result.slots[0], {
    id: "P1:P1-C1:platoon-1:1:A",
    phase: "P1",
    conflictId: "P1-C1",
    linkedConflictId: "tb3_mixed_phase01_conflict01",
    squadId: "platoon-1",
    slot: 1,
    baseId: "A",
    name: "Alpha",
    combatType: 1,
    unitType: "Character",
    requiredRelic: 5,
    requiredRarity: 7,
  });
  assert.equal(result.uniqueUnits, 3);
  const alpha = result.requirements.find((entry) => entry.baseId === "A");
  assert.equal(alpha.requiredCount, 2);
  assert.equal(alpha.minRelic, 5);
  assert.equal(alpha.maxRelic, 6);
  assert.deepEqual(alpha.relicCounts, { 5: 1, 6: 1 });
  assert.deepEqual(alpha.phases, ["P1", "P2"]);
});

test("calculates how many operation occurrences the live unit can currently satisfy", () => {
  const result = aggregateRoteOperations(fixture);
  const alpha = result.requirements.find((entry) => entry.baseId === "A");
  const ship = result.requirements.find((entry) => entry.baseId === "SHIP");
  assert.equal(readyOccurrences(alpha, { relic: 5 }), 1);
  assert.equal(readyOccurrences(alpha, { relic: 6 }), 2);
  assert.equal(readyOccurrences(ship, { stars: 6 }), 0);
  assert.equal(readyOccurrences(ship, { stars: 7 }), 1);
});
