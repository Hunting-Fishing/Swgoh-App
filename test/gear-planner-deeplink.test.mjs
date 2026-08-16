import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { normalizeGearPlanRequest } from "../public/gear-planner-deeplink.js";

test("gear planner requests normalize unit and progression targets", () => {
  assert.deepEqual(normalizeGearPlanRequest({ baseId: " UNIT_A ", gear: 12, relic: 0 }), {
    baseId: "UNIT_A",
    gear: 12,
    relic: 0,
  });

  assert.deepEqual(normalizeGearPlanRequest({ baseId: "UNIT_B", gear: 8, relic: 7 }), {
    baseId: "UNIT_B",
    gear: 13,
    relic: 7,
  });
});

test("gear planner request clamps invalid progression ranges", () => {
  assert.deepEqual(normalizeGearPlanRequest({ baseId: "UNIT_A", gear: 99, relic: -3 }), {
    baseId: "UNIT_A",
    gear: 13,
    relic: 0,
  });
  assert.deepEqual(normalizeGearPlanRequest({ baseId: "UNIT_A", gear: 0, relic: 99 }), {
    baseId: "UNIT_A",
    gear: 13,
    relic: 15,
  });
});

test("gear planner deep-link asset is wired after the planner module", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const plannerPosition = index.indexOf("/gear-planner-v1.js");
  const bridgePosition = index.indexOf("/gear-planner-deeplink.js");
  assert.ok(plannerPosition >= 0);
  assert.ok(bridgePosition > plannerPosition);

  const source = fs.readFileSync(new URL("../public/gear-planner-deeplink.js", import.meta.url), "utf8");
  assert.match(source, /swgoh:gear-plan-unit/);
  assert.match(source, /swgoh:gear-plan-unit-result/);
  assert.match(source, /unit-not-owned-or-roster-not-loaded/);
});
