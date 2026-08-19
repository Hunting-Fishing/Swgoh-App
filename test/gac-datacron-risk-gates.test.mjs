import test from "node:test";
import assert from "node:assert/strict";
import { counterEvidenceStatus, tacticalRiskGates } from "../public/gac-datacron-risk-gates.js";

test("datacron mechanics map to tactical gates without a numeric score", () => {
  const gates = tacticalRiskGates([
    "Start of Battle",
    "Turn Meter",
    "Speed",
    "Revive",
    "Protection Recovery",
    "Stun",
    "Tenacity",
    "Critical Damage",
  ]);
  assert.deepEqual(gates.map((gate) => gate.id), [
    "opening-tempo",
    "revive",
    "sustain",
    "control",
    "debuff-resilience",
    "damage-pressure",
  ]);
  assert.ok(gates[0].evidence.includes("Turn Meter"));
  assert.ok(gates[1].instruction.includes("revival"));
  assert.equal(gates.some((gate) => Object.prototype.hasOwnProperty.call(gate, "score")), false);
  assert.equal(gates.some((gate) => Object.prototype.hasOwnProperty.call(gate, "multiplier")), false);
});

test("verified current datacron is explicitly separated from ordinary historical counter evidence", () => {
  const status = counterEvidenceStatus({ selected: true });
  assert.equal(status.datacronKnown, true);
  assert.equal(status.datacronSpecificCounterEvidence, false);
  assert.equal(status.label, "DATACRON NOT MODELED IN WIN RATE");
  assert.match(status.note, /separate tactical condition/);
});

test("unknown assignment does not alter counter confidence", () => {
  const status = counterEvidenceStatus({ selected: false });
  assert.equal(status.datacronKnown, false);
  assert.equal(status.datacronSpecificCounterEvidence, false);
  assert.match(status.note, /Do not adjust historical counter confidence/);
  assert.deepEqual(tacticalRiskGates([]), []);
});
