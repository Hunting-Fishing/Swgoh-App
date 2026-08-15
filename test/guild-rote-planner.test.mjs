import assert from "node:assert/strict";
import test from "node:test";
import { planGuildRoteAssignments, unitMeetsRoteSlot } from "../public/guild-rote-planner.js";

const members = [
  { playerId: "p1", name: "One", galacticPower: 10_000_000, rosterAvailable: true, units: [
    { baseId: "A", stars: 7, gear: 13, relic: 7 },
    { baseId: "B", stars: 7, gear: 13, relic: 8 },
    { baseId: "SHIP", stars: 7, gear: 1, relic: 0 },
  ] },
  { playerId: "p2", name: "Two", galacticPower: 9_000_000, rosterAvailable: true, units: [
    { baseId: "A", stars: 7, gear: 13, relic: 5 },
    { baseId: "B", stars: 7, gear: 13, relic: 7 },
  ] },
  { playerId: "p3", name: "Three", galacticPower: 8_000_000, rosterAvailable: true, units: [
    { baseId: "A", stars: 7, gear: 13, relic: 7 },
    { baseId: "C", stars: 7, gear: 13, relic: 9 },
  ] },
];

function slot(id, baseId, extra = {}) {
  return {
    id,
    phase: "P1",
    conflictId: "P1-C1",
    squadId: "platoon",
    slot: Number(id.replace(/\D/g, "")) || 1,
    baseId,
    name: baseId,
    unitType: "Character",
    requiredRelic: 5,
    requiredRarity: 7,
    ...extra,
  };
}

test("checks character relic and ship rarity gates exactly", () => {
  assert.equal(unitMeetsRoteSlot({ stars: 7, relic: 6 }, slot("1", "A", { requiredRelic: 7 })), false);
  assert.equal(unitMeetsRoteSlot({ stars: 7, relic: 7 }, slot("1", "A", { requiredRelic: 7 })), true);
  assert.equal(unitMeetsRoteSlot({ stars: 6, relic: 0 }, slot("2", "SHIP", { unitType: "Ship", requiredRarity: 7 })), false);
  assert.equal(unitMeetsRoteSlot({ stars: 7, relic: 0 }, slot("2", "SHIP", { unitType: "Ship", requiredRarity: 7 })), true);
});

test("assigns duplicate same-phase unit demand to distinct owners and preserves scarce specialists", () => {
  const operations = { slots: [
    slot("1", "A", { requiredRelic: 7 }),
    slot("2", "A", { requiredRelic: 7 }),
    slot("3", "B", { requiredRelic: 8 }),
    slot("4", "C", { requiredRelic: 9 }),
    slot("5", "SHIP", { unitType: "Ship", requiredRarity: 7, requiredRelic: 0 }),
  ] };
  const plan = planGuildRoteAssignments({ members }, operations);
  assert.equal(plan.assignedSlots, 5);
  assert.equal(plan.unfilledSlots, 0);
  const aAssignments = plan.assignments.filter((entry) => entry.baseId === "A");
  assert.equal(new Set(aAssignments.map((entry) => entry.member.playerId)).size, 2, "same owned unit cannot fill two Operations in the same phase");
  assert.equal(plan.assignments.find((entry) => entry.baseId === "B").member.playerId, "p1");
  assert.equal(plan.assignments.find((entry) => entry.baseId === "C").member.playerId, "p3");
  assert.equal(plan.assignments.find((entry) => entry.baseId === "SHIP").member.playerId, "p1");
});

test("enforces the per-member territory contribution cap", () => {
  const oneMember = [{ playerId: "p1", name: "One", rosterAvailable: true, units: [
    { baseId: "A", stars: 7, relic: 9 },
    { baseId: "B", stars: 7, relic: 9 },
    { baseId: "C", stars: 7, relic: 9 },
  ] }];
  const plan = planGuildRoteAssignments({ members: oneMember }, { slots: [slot("1", "A"), slot("2", "B"), slot("3", "C")] }, { maxPerTerritory: 2 });
  assert.equal(plan.assignedSlots, 2);
  assert.equal(plan.unfilledSlots, 1);
  assert.equal(plan.memberLoads[0].territories["P1-C1"], 2);
});

test("surfaces zero-owner and low-margin scarcity", () => {
  const operations = { slots: [
    slot("1", "C", { requiredRelic: 9 }),
    slot("2", "MISSING", { requiredRelic: 9 }),
  ] };
  const plan = planGuildRoteAssignments({ members }, operations);
  assert.equal(plan.assignedSlots, 1);
  assert.equal(plan.unfilledSlots, 1);
  assert.equal(plan.unfilled[0].baseId, "MISSING");
  assert.equal(plan.unfilled[0].eligibleOwners, 0);
  assert.equal(plan.scarcity[0].baseId, "MISSING");
});
