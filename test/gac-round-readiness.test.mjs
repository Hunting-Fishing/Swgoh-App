import test from "node:test";
import assert from "node:assert/strict";
import { deriveReadiness } from "../public/gac-round-readiness.js";

function gate(model, id) { return model.gates.find((entry) => entry.id === id); }

test("readiness starts by requiring a roster", () => {
  const model = deriveReadiness({ playerReady: false });
  assert.equal(model.overall, "load-roster");
  assert.equal(gate(model, "roster").state, "action");
  assert.equal(gate(model, "round").state, "blocked");
  assert.equal(model.ready, false);
});

test("round is the next gate after player context", () => {
  const model = deriveReadiness({ playerReady: true });
  assert.equal(model.overall, "select-round");
  assert.equal(gate(model, "roster").state, "complete");
  assert.equal(gate(model, "round").state, "action");
});

test("signed-in verified-owner access is required before pairing evidence", () => {
  const model = deriveReadiness({ playerReady: true, round: 3, authStatus: "required" });
  assert.equal(model.overall, "sign-in");
  assert.equal(gate(model, "auth").state, "action");
  assert.equal(gate(model, "pairing").state, "blocked");
});

test("missing pairing points to current opponent confirmation", () => {
  const model = deriveReadiness({ playerReady: true, round: 3, authStatus: "ok", pairingStatus: "missing" });
  assert.equal(model.overall, "confirm-opponent");
  assert.equal(gate(model, "pairing").state, "action");
  assert.equal(gate(model, "enemy-board").state, "blocked");
});

test("confirmed pairing without saved enemy defenses requires board capture", () => {
  const model = deriveReadiness({ playerReady: true, round: 3, authStatus: "ok", pairingStatus: "confirmed", enemyCount: 0 });
  assert.equal(model.overall, "save-enemy-board");
  assert.equal(gate(model, "pairing").state, "complete");
  assert.equal(gate(model, "enemy-board").state, "action");
  assert.equal(gate(model, "own-defense").state, "optional");
});

test("saved enemy board makes the round ready even when own defense reserve is optional", () => {
  const model = deriveReadiness({ playerReady: true, round: 3, authStatus: "ok", pairingStatus: "confirmed", enemyCount: 4, ownCount: 0, assignmentCount: 0, opponentName: "Navygators" });
  assert.equal(model.overall, "ready-to-plan");
  assert.equal(model.ready, true);
  assert.equal(gate(model, "war-room").state, "ready");
  assert.equal(gate(model, "own-defense").state, "optional");
});

test("tracked attack assignments promote readiness to active", () => {
  const model = deriveReadiness({ playerReady: true, round: 3, authStatus: "ok", pairingStatus: "confirmed", enemyCount: 6, ownCount: 3, assignmentCount: 2 });
  assert.equal(model.overall, "active");
  assert.equal(model.ready, true);
  assert.equal(gate(model, "enemy-board").state, "complete");
  assert.equal(gate(model, "own-defense").state, "complete");
  assert.equal(gate(model, "war-room").state, "complete");
});

test("missing current event blocks pairing instead of claiming a live matchup", () => {
  const model = deriveReadiness({ playerReady: true, round: 3, authStatus: "ok", pairingStatus: "missing", currentEventAvailable: false });
  assert.equal(gate(model, "pairing").state, "blocked");
  assert.match(gate(model, "pairing").detail, /No current GAC event/i);
  assert.equal(model.ready, false);
});
