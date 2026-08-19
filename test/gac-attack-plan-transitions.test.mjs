import test from "node:test";
import assert from "node:assert/strict";
import { transitionAllowed } from "../gac-attack-plan-service.mjs";

test("planned counter can start, finish directly, or be released before battle", () => {
  for (const next of ["planned", "attempted", "win", "loss", "abandoned"]) {
    assert.equal(transitionAllowed("planned", next), true, `planned -> ${next}`);
  }
});

test("attempt in progress must resolve as win or loss and cannot be released/replanned by status mutation", () => {
  assert.equal(transitionAllowed("attempted", "attempted"), true);
  assert.equal(transitionAllowed("attempted", "win"), true);
  assert.equal(transitionAllowed("attempted", "loss"), true);
  assert.equal(transitionAllowed("attempted", "planned"), false);
  assert.equal(transitionAllowed("attempted", "abandoned"), false);
});

test("terminal operational states cannot be mutated backward", () => {
  for (const terminal of ["win", "loss", "abandoned"]) {
    assert.equal(transitionAllowed(terminal, terminal), true);
    for (const next of ["planned", "attempted", "win", "loss", "abandoned"].filter((value) => value !== terminal)) {
      assert.equal(transitionAllowed(terminal, next), false, `${terminal} -> ${next} should be rejected`);
    }
  }
});

test("invalid status values never pass the transition gate", () => {
  assert.equal(transitionAllowed("planned", "deleted"), false);
  assert.equal(transitionAllowed("attempted", ""), false);
});
