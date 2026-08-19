import test from "node:test";
import assert from "node:assert/strict";
import { attemptOutcome, verificationKey, verificationPayload } from "../public/gac-verified-battle-ui.js";

test("verification payload contains only assignment pointer, attempt pointer, round, and explicit confirm", () => {
  assert.deepEqual(verificationPayload(17, 0, 3), {
    assignmentId: 17,
    attemptIndex: 0,
    round: 3,
    confirm: true,
  });
});

test("invalid assignment, attempt, or round cannot produce a verification payload", () => {
  assert.equal(verificationPayload(0, 0, 3), null);
  assert.equal(verificationPayload(17, -1, 3), null);
  assert.equal(verificationPayload(17, 0, 4), null);
  assert.equal(verificationPayload("bad", 0, 3), null);
});

test("verification key is deterministic per assignment attempt", () => {
  assert.equal(verificationKey(17, 0), "17:0");
  assert.equal(verificationKey(17, 1), "17:1");
  assert.notEqual(verificationKey(17, 0), verificationKey(18, 0));
});

test("attempt outcome label recognizes completed War Room rows without changing the result", () => {
  assert.equal(attemptOutcome({ textContent: "1 · WIN · 65 banners · A / B / C" }), "WIN");
  assert.equal(attemptOutcome({ textContent: "2 · LOSS · 0 banners · A / B / C" }), "LOSS");
  assert.equal(attemptOutcome({ textContent: "unknown" }), "RESULT");
});
