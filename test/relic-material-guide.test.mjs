import test from "node:test";
import assert from "node:assert/strict";
import { gearGap, relicMaterialsBetween } from "../public/relic-material-guide.js";

test("R3 to R7 totals only the required future relic tiers", () => {
  const plan = relicMaterialsBetween(3, 7);
  assert.equal(plan.levelsRemaining, 4);
  assert.deepEqual(plan.tiers, [4, 5, 6, 7]);
  assert.equal(plan.totals.Credits, 925000);
  assert.equal(plan.totals.CCB, 100);
  assert.equal(plan.totals.BW, 140);
  assert.equal(plan.totals.CT, 120);
  assert.equal(plan.totals.AH, 60);
  assert.equal(plan.totals.EC, 40);
  assert.equal(plan.totals.ZC, 10);
  assert.equal(plan.totals.FSD, 80);
  assert.equal(plan.totals.ISD, 100);
  assert.equal(plan.totals.FLSD, 75);
});

test("R7 to R9 includes current R8 and R9 costs without earlier tiers", () => {
  const plan = relicMaterialsBetween(7, 9);
  assert.equal(plan.totals.Credits, 2500000);
  assert.equal(plan.totals.FSD, 20);
  assert.equal(plan.totals.ISD, 55);
  assert.equal(plan.totals.FLSD, 100);
  assert.equal(plan.totals.EC, 40);
  assert.equal(plan.totals.GK, 20);
  assert.equal(plan.totals.DB, 20);
  assert.equal(plan.totals.CCB || 0, 0);
});

test("R9 to R10 includes new R10-only materials", () => {
  const plan = relicMaterialsBetween(9, 10);
  assert.equal(plan.levelsRemaining, 1);
  assert.equal(plan.totals.CS, 20);
  assert.equal(plan.totals.CSD, 15);
  assert.equal(plan.totals.ID, 20);
  assert.equal(plan.totals.ISD, 25);
  assert.equal(plan.totals.FLSD, 45);
});

test("completed relic targets return no material requirement", () => {
  assert.deepEqual(relicMaterialsBetween(8, 7).materials, []);
  assert.equal(relicMaterialsBetween(8, 8).levelsRemaining, 0);
});

test("gear gap reports remaining full tiers only", () => {
  assert.deepEqual(gearGap(10, 13), { from: 10, to: 13, tiersRemaining: 3, complete: false, tiers: [11, 12, 13] });
  assert.equal(gearGap(13, 13).complete, true);
});
