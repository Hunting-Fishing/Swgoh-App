import test from "node:test";
import assert from "node:assert/strict";

import { historicalEvent } from "../gac-defense-prediction-service.mjs";

test("historical defense privacy gate never treats incomplete-like statuses as completed", () => {
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  assert.equal(historicalEvent({ status: "incomplete" }, now), false);
  assert.equal(historicalEvent({ status: "not-complete" }, now), false);
  assert.equal(historicalEvent({ status: "completion-pending" }, now), false);
  assert.equal(historicalEvent({ status: "attack-phase", ends_at: "2026-08-21T00:00:00.000Z" }, now), false);
  assert.equal(historicalEvent({ status: "history-published" }, now), true);
  assert.equal(historicalEvent({ status: "completed" }, now), true);
  assert.equal(historicalEvent({ status: "", ends_at: "2026-08-19T00:00:00.000Z" }, now), true);
});
