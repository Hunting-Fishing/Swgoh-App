import test from "node:test";
import assert from "node:assert/strict";
import { nextDisplaySlot, saveNextEligible } from "../public/gac-save-next-slot.js";

test("next slot advances only within the same human-facing slot sequence", () => {
  assert.equal(nextDisplaySlot(1), 2);
  assert.equal(nextDisplaySlot(42), 43);
  assert.equal(nextDisplaySlot(99), 100);
});

test("slot 100 and invalid slots do not invent another zone or slot", () => {
  assert.equal(nextDisplaySlot(100), null);
  assert.equal(nextDisplaySlot(0), null);
  assert.equal(nextDisplaySlot(-1), null);
  assert.equal(nextDisplaySlot("bad"), null);
});

test("Save and Next requires an exact positioned defense and enabled validated save", () => {
  const positioned = { specified: true, complete: true, zone: "FRONT-TOP", displaySlot: "1" };
  assert.equal(saveNextEligible(positioned, false, null), true);
  assert.equal(saveNextEligible(positioned, true, null), false);
  assert.equal(saveNextEligible(positioned, false, { round: 3 }), false);
});

test("unpositioned or partial board input stays on normal Save Current Defense", () => {
  assert.equal(saveNextEligible({ specified: false, complete: true, displaySlot: "" }, false, null), false);
  assert.equal(saveNextEligible({ specified: true, complete: false, displaySlot: "2" }, false, null), false);
});

test("slot 100 is saved with the normal button because no automatic next slot exists", () => {
  const position = { specified: true, complete: true, zone: "BACK-BOTTOM", displaySlot: "100" };
  assert.equal(saveNextEligible(position, false, null), false);
});
