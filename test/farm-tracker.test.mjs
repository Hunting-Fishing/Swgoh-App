import test from "node:test";
import assert from "node:assert/strict";
import { farmCompletion, farmRequirementRows, farmStatus } from "../public/farm-tracker.js";

test("farm completion compares only explicitly required character tracks", () => {
  const result = farmCompletion(
    { stars: 7, level: 85, gear: 13, relic: 5 },
    { stars: 7, level: 85, gear: 13, relic: 7 },
    "Character",
  );

  assert.equal(result.rows.length, 4);
  assert.equal(result.rows.find((row) => row.key === "relic").complete, false);
  assert.equal(result.percent, 93);
  assert.equal(farmStatus(result), "Close");
});

test("ship tracker excludes character gear and relic requirements", () => {
  const rows = farmRequirementRows(
    { stars: 7, level: 85, gear: 0, relic: 0 },
    { stars: 7, level: 85, gear: 13, relic: 9 },
    "Ship",
  );

  assert.deepEqual(rows.map((row) => row.key), ["stars", "level"]);
  assert.equal(farmCompletion({ stars: 7, level: 85 }, { stars: 7, level: 85 }, "Ship").percent, 100);
});

test("unowned requirement target correctly starts at zero instead of unknown", () => {
  const result = farmCompletion({}, { stars: 7, level: 85, gear: 13, relic: 5 }, "Character");
  assert.equal(result.percent, 0);
  assert.equal(result.complete, false);
  assert.equal(farmStatus(result), "Early");
});
