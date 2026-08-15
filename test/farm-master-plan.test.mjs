import test from "node:test";
import assert from "node:assert/strict";
import { buildMasterFarmPlan, strongerRequirement } from "../public/farm-master-plan.js";
import { relicMaterialsBetween } from "../public/relic-material-guide.js";

test("strongerRequirement keeps the progression target that satisfies both farms", () => {
  assert.deepEqual(strongerRequirement(
    { baseId: "UNIT", type: "GEAR", tier: 12 },
    { baseId: "UNIT", type: "RELIC", tier: 5 },
  ), { baseId: "UNIT", type: "RELIC", tier: 5 });
  assert.deepEqual(strongerRequirement(
    { baseId: "SHIP", type: "STAR", tier: 4 },
    { baseId: "SHIP", type: "STAR", tier: 7 },
  ), { baseId: "SHIP", type: "STAR", tier: 7 });
});

test("overlapping character is deduped and only the highest relic target is costed once", () => {
  const events = [
    { id: "A", name: "Farm A", requirements: [{ baseId: "GAS", type: "RELIC", tier: 8 }] },
    { id: "B", name: "Farm B", requirements: [{ baseId: "GAS", type: "RELIC", tier: 9 }] },
  ];
  const units = [{ baseId: "GAS", stars: 7, level: 85, gear: 13, relic: 7 }];
  const plan = buildMasterFarmPlan(events, units);
  const expected = relicMaterialsBetween(7, 9);

  assert.equal(plan.uniqueTargetCount, 1);
  assert.equal(plan.sharedTargetCount, 1);
  assert.equal(plan.queue[0].impactCount, 2);
  assert.equal(plan.queue[0].targetLabel, "R9");
  assert.deepEqual(plan.materialTotals, expected.totals);
});

test("material shopping list sums unique unfinished targets", () => {
  const events = [{
    id: "A",
    name: "Farm A",
    requirements: [
      { baseId: "ONE", type: "RELIC", tier: 7 },
      { baseId: "TWO", type: "RELIC", tier: 5 },
    ],
  }];
  const units = [
    { baseId: "ONE", stars: 7, level: 85, gear: 13, relic: 5 },
    { baseId: "TWO", stars: 7, level: 85, gear: 13, relic: 3 },
  ];
  const plan = buildMasterFarmPlan(events, units);
  const one = relicMaterialsBetween(5, 7).totals;
  const two = relicMaterialsBetween(3, 5).totals;
  for (const key of new Set([...Object.keys(one), ...Object.keys(two)])) {
    assert.equal(plan.materialTotals[key], Number(one[key] || 0) + Number(two[key] || 0));
  }
});

test("completed requirements do not add shopping-list materials", () => {
  const events = [{ id: "A", name: "Farm A", requirements: [{ baseId: "DONE", type: "RELIC", tier: 7 }] }];
  const units = [{ baseId: "DONE", stars: 7, level: 85, gear: 13, relic: 8 }];
  const plan = buildMasterFarmPlan(events, units);
  assert.equal(plan.incompleteTargetCount, 0);
  assert.deepEqual(plan.materialTotals, {});
  assert.equal(plan.materials.length, 0);
});

test("shared targets rank before single-farm targets and owned units rank before missing peers", () => {
  const events = [
    { id: "A", name: "Farm A", requirements: [{ baseId: "SHARED", type: "RELIC", tier: 7 }, { baseId: "OWNED", type: "RELIC", tier: 7 }] },
    { id: "B", name: "Farm B", requirements: [{ baseId: "SHARED", type: "RELIC", tier: 7 }, { baseId: "MISSING", type: "RELIC", tier: 7 }] },
  ];
  const units = [
    { baseId: "SHARED", stars: 7, level: 85, gear: 13, relic: 3 },
    { baseId: "OWNED", stars: 7, level: 85, gear: 13, relic: 6 },
  ];
  const plan = buildMasterFarmPlan(events, units);
  assert.equal(plan.queue[0].baseId, "SHARED");
  assert.equal(plan.queue.findIndex((row) => row.baseId === "OWNED") < plan.queue.findIndex((row) => row.baseId === "MISSING"), true);
});

test("star-only ship blockers do not invent relic materials", () => {
  const events = [{ id: "FLEET", name: "Fleet", requirements: [{ baseId: "SHIP", type: "STAR", tier: 7 }] }];
  const units = [{ baseId: "SHIP", stars: 5 }];
  const plan = buildMasterFarmPlan(events, units);
  assert.equal(plan.queue[0].starsRemaining, 2);
  assert.equal(plan.queue[0].relicPlan.levelsRemaining, 0);
  assert.deepEqual(plan.materialTotals, {});
});
