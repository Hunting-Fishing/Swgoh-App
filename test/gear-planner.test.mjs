import assert from "node:assert/strict";
import test from "node:test";
import { gearRelicPlan, gearRelicStatus } from "../public/gear-planner.js";

const staticUnit = {
  unitType: "Character",
  gearTiers: [
    { tier: 10, equipment: ["a", "b", "c", "d", "e", "f"] },
    { tier: 11, equipment: ["g", "h", "i", "j", "k", "l"] },
    { tier: 12, equipment: ["m", "n", "o", "p", "q", "r"] },
  ],
};

test("plans gear tiers and relic levels without inventing current-tier slot completion", () => {
  const plan = gearRelicPlan({ gear: 10, relic: 0 }, staticUnit, { gear: 13, relic: 7 });
  assert.equal(plan.targetGear, 13);
  assert.equal(plan.gearTiersRemaining, 3);
  assert.equal(plan.relicLevelsRemaining, 7);
  assert.equal(plan.tierRows.length, 3);
  assert.equal(plan.tierRows[0].currentTier, true);
  assert.equal(plan.tierRows[0].exactPieceCount, false);
  assert.equal(plan.knownFuturePieces, 12);
  assert.equal(plan.relicLockedByGear, true);
  assert.equal(gearRelicStatus(plan), "3 gear tiers + 7 relic levels remaining");
});

test("relic target forces gear 13 and reports only the live relic gap once gear is complete", () => {
  const plan = gearRelicPlan({ gear: 13, relic: 5 }, staticUnit, { gear: 12, relic: 8 });
  assert.equal(plan.targetGear, 13);
  assert.equal(plan.gearTiersRemaining, 0);
  assert.equal(plan.relicLevelsRemaining, 3);
  assert.equal(plan.tierRows.length, 0);
  assert.equal(plan.relicLockedByGear, false);
  assert.equal(gearRelicStatus(plan), "3 relic levels remaining");
});

test("completed targets stay complete and ships are excluded", () => {
  const complete = gearRelicPlan({ gear: 13, relic: 8 }, staticUnit, { gear: 13, relic: 7 });
  assert.equal(complete.complete, true);
  assert.equal(gearRelicStatus(complete), "Target complete");

  const ship = gearRelicPlan({ gear: 1 }, { unitType: "Ship" }, { gear: 13, relic: 7 });
  assert.equal(ship.supported, false);
  assert.match(gearRelicStatus(ship), /Ships do not use/);
});
