import assert from "node:assert/strict";
import test from "node:test";
import { planGuildRoteAssignments } from "../public/guild-rote-planner.js";

function slot(id, baseId = "A", extra = {}) {
  return {
    id,
    phase: "P2",
    conflictId: "P2-C1",
    squadId: "operation-1",
    slot: Number(id.replace(/\D/g, "")) || 1,
    baseId,
    name: baseId,
    unitType: "Character",
    requiredRelic: 7,
    requiredRarity: 7,
    ...extra,
  };
}

const members = [
  { playerId: "p1", name: "One", galacticPower: 10_000_000, rosterAvailable: true, units: [
    { baseId: "A", stars: 7, gear: 13, relic: 8 },
    { baseId: "B", stars: 7, gear: 13, relic: 7 },
  ] },
  { playerId: "p2", name: "Two", galacticPower: 9_000_000, rosterAvailable: true, units: [
    { baseId: "A", stars: 7, gear: 13, relic: 7 },
    { baseId: "B", stars: 7, gear: 13, relic: 6 },
  ] },
];

test("mission reserve removes a unit from assignment availability without creating a false farm shortage", () => {
  const plan = planGuildRoteAssignments({ members }, { slots: [slot("slot-1")] }, {
    reservations: [{ memberId: "p1", phase: "P2", baseId: "A" }],
  });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].member.playerId, "p2");
  assert.equal(plan.assignments[0].eligibleOwners, 2);
  assert.equal(plan.assignments[0].availableOwners, 1);
  assert.equal(plan.controls.reservations, 1);
  assert.equal(plan.developmentTargets.length, 0, "physical ownership still satisfies one-slot demand");
});

test("valid officer lock is applied before the automatic draft", () => {
  const plan = planGuildRoteAssignments({ members }, { slots: [slot("slot-1")] }, {
    locks: [{ slotId: "slot-1", memberId: "p2" }],
  });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.assignments[0].member.playerId, "p2");
  assert.equal(plan.assignments[0].locked, true);
  assert.equal(plan.controls.requestedLocks, 1);
  assert.equal(plan.controls.appliedLocks, 1);
  assert.equal(plan.controls.lockIssues.length, 0);
});

test("invalid lock remains visibly unfilled instead of silently assigning another member", () => {
  const plan = planGuildRoteAssignments({ members }, { slots: [slot("slot-1", "B")] }, {
    locks: [{ slotId: "slot-1", memberId: "p2" }],
  });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.unfilled.length, 1);
  assert.equal(plan.unfilled[0].locked, true);
  assert.match(plan.unfilled[0].lockIssue, /does not meet/i);
  assert.equal(plan.controls.lockIssues.length, 1);
  assert.equal(plan.controls.appliedLocks, 0);
});

test("same owned unit cannot satisfy two officer locks in the same phase", () => {
  const plan = planGuildRoteAssignments({ members }, { slots: [slot("slot-1"), slot("slot-2")] }, {
    locks: [
      { slotId: "slot-1", memberId: "p1" },
      { slotId: "slot-2", memberId: "p1" },
    ],
  });
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.unfilled.length, 1);
  assert.match(plan.unfilled[0].lockIssue, /already uses this unit/i);
  assert.equal(plan.controls.appliedLocks, 1);
  assert.equal(plan.controls.lockIssues.length, 1);
});
