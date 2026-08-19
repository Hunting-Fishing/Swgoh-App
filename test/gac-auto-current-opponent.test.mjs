import test from "node:test";
import assert from "node:assert/strict";
import {
  allyCode,
  escapeHtml,
  exactPairingFromBracket,
  formatAllyCode,
  shouldAutoApplyPairing,
  validRound,
} from "../public/gac-auto-current-opponent.js";

test("exact bracket evidence resolves current opponent and round without guessing", () => {
  const pairing = exactPairingFromBracket({
    event: { eventInstanceId: "GAC-82", round: 3 },
    currentOpponent: { allyCode: "987-654-321", name: "Navygators" },
    opponentResolution: {
      exact: true,
      round: 3,
      source: "comlink-live",
      confidence: 1,
    },
  }, "123456789");

  assert.deepEqual(pairing, {
    ownerAllyCode: "123456789",
    opponentAllyCode: "987654321",
    opponentName: "Navygators",
    round: 3,
    eventInstanceId: "GAC-82",
    source: "comlink-live",
    confidence: 1,
    key: "GAC-82|3|987654321",
  });
});

test("public bracket membership without exact pairing evidence is never auto-selected", () => {
  const pairing = exactPairingFromBracket({
    event: { eventInstanceId: "GAC-82", round: 2 },
    currentOpponent: { allyCode: "987654321", name: "Possible Rival" },
    opponentResolution: { exact: false, method: "public-bracket-only", round: 2 },
    opponents: [
      { allyCode: "987654321" },
      { allyCode: "222333444" },
    ],
  }, "123456789");
  assert.equal(pairing, null);
});

test("exact pairing requires a valid round and cannot point back to the owner", () => {
  assert.equal(exactPairingFromBracket({
    currentOpponent: { allyCode: "123456789" },
    opponentResolution: { exact: true, round: 1 },
  }, "123456789"), null);

  assert.equal(exactPairingFromBracket({
    currentOpponent: { allyCode: "987654321" },
    opponentResolution: { exact: true, round: 0 },
  }, "123456789"), null);
});

test("manual opponent choice is preserved when it conflicts with a later exact pairing", () => {
  const pairing = {
    opponentAllyCode: "987654321",
    key: "GAC-82|3|987654321",
  };
  assert.equal(shouldAutoApplyPairing(pairing, {
    currentOpponent: "555-666-777",
    manualOpponentTouched: true,
    appliedKey: "",
  }), false);
  assert.equal(shouldAutoApplyPairing(pairing, {
    currentOpponent: "987-654-321",
    manualOpponentTouched: true,
    appliedKey: "",
  }), true);
});

test("the same exact event-round pairing is applied only once", () => {
  const pairing = { opponentAllyCode: "987654321", key: "GAC-82|3|987654321" };
  assert.equal(shouldAutoApplyPairing(pairing, {
    currentOpponent: "",
    manualOpponentTouched: false,
    appliedKey: pairing.key,
  }), false);
});

test("ally-code formatting and status escaping remain deterministic", () => {
  assert.equal(allyCode("987-654-321"), "987654321");
  assert.equal(formatAllyCode("987654321"), "987-654-321");
  assert.equal(validRound("2"), 2);
  assert.equal(validRound("4"), null);
  assert.equal(escapeHtml('<img src=x onerror="boom"> & Rival'), "&lt;img src=x onerror=&quot;boom&quot;&gt; &amp; Rival");
});
