import test from "node:test";
import assert from "node:assert/strict";
import { addedBoardContent, assignmentByDefense, warMapStatus } from "../public/gac-war-map-status.js";

test("war map indexes assignments by verified defense id", () => {
  const index = assignmentByDefense([
    { id: 1, defenseId: 44, status: "planned" },
    { id: 2, defenseId: 45, status: "win" },
    { id: 3, defenseId: null, status: "loss" },
  ]);
  assert.equal(index.size, 2);
  assert.equal(index.get(44).id, 1);
  assert.equal(index.get(45).id, 2);
});

test("unplanned defense remains neutral and does not claim a battle state", () => {
  assert.deepEqual(warMapStatus(null), {
    key: "unplanned",
    label: "UNPLANNED",
    attempts: 0,
    failedAttempts: 0,
    tone: "neutral",
  });
});

test("planned and in-progress assignments display operational state", () => {
  assert.equal(warMapStatus({ status: "planned", attemptCount: 0, attemptLog: [] }).label, "COUNTER LOCKED");
  assert.equal(warMapStatus({ status: "attempted", attemptCount: 1, attemptLog: [] }).label, "ATTEMPT LIVE");
});

test("planned retry is distinguished after a prior failed attempt", () => {
  const status = warMapStatus({
    status: "planned",
    attemptCount: 1,
    attemptLog: [{ status: "loss" }],
  });
  assert.equal(status.label, "RETRY LOCKED");
  assert.equal(status.failedAttempts, 1);
});

test("win, loss, and abandoned remain distinct", () => {
  const win = warMapStatus({ status: "win", attemptCount: 2, attemptLog: [{ status: "loss" }, { status: "win" }] });
  assert.equal(win.label, "CLEARED");
  assert.equal(win.attempts, 2);
  assert.equal(win.failedAttempts, 1);

  const loss = warMapStatus({ status: "loss", attemptCount: 1, attemptLog: [{ status: "loss" }] });
  assert.equal(loss.label, "FAILED · REPLAN");
  assert.equal(loss.failedAttempts, 1);

  const abandoned = warMapStatus({ status: "abandoned", attemptCount: 0, attemptLog: [] });
  assert.equal(abandoned.label, "PLAN RELEASED");
  assert.equal(abandoned.tone, "neutral");
});

test("observer refreshes for newly rendered board tiles but ignores its own status badges", () => {
  const PreviousElement = global.Element;
  class FakeElement {
    constructor({ id = "", matchesTile = false, containsTile = false } = {}) {
      this.id = id;
      this.matchesTile = matchesTile;
      this.containsTile = containsTile;
    }
    matches(selector) { return selector === "[data-saved-defense-id]" && this.matchesTile; }
    querySelector(selector) { return selector === "[data-saved-defense-id]" && this.containsTile ? {} : null; }
  }
  global.Element = FakeElement;
  try {
    assert.equal(addedBoardContent([{ addedNodes: [new FakeElement({ id: "gacSavedBoardMap" })] }]), true);
    assert.equal(addedBoardContent([{ addedNodes: [new FakeElement({ matchesTile: true })] }]), true);
    assert.equal(addedBoardContent([{ addedNodes: [new FakeElement({ containsTile: true })] }]), true);
    assert.equal(addedBoardContent([{ addedNodes: [new FakeElement()] }]), false);
  } finally {
    if (PreviousElement === undefined) delete global.Element;
    else global.Element = PreviousElement;
  }
});
