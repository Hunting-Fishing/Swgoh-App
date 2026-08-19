import test from "node:test";
import assert from "node:assert/strict";
import {
  backendSlotFromDisplay,
  displaySlotFromBackend,
  normalizeZone,
  readBoardPosition,
  zoneLabel,
} from "../public/gac-board-position.js";

test("blank board position preserves backward-compatible unpositioned saves", () => {
  assert.deepEqual(readBoardPosition("", ""), {
    specified: false,
    complete: true,
    zone: "",
    slot: null,
    displaySlot: "",
  });
});

test("zone and human-facing slot convert to exact backend position", () => {
  assert.deepEqual(readBoardPosition("FRONT-TOP", "1"), {
    specified: true,
    complete: true,
    zone: "FRONT-TOP",
    slot: 0,
    displaySlot: "1",
  });
  assert.deepEqual(readBoardPosition("back-bottom", "4"), {
    specified: true,
    complete: true,
    zone: "BACK-BOTTOM",
    slot: 3,
    displaySlot: "4",
  });
});

test("partial board position is incomplete and must not be persisted", () => {
  assert.equal(readBoardPosition("FRONT-TOP", "").complete, false);
  assert.equal(readBoardPosition("", "2").complete, false);
  assert.equal(readBoardPosition("NOT-A-ZONE", "2").complete, false);
});

test("slot conversion is explicitly one-based in UI and zero-based in storage", () => {
  assert.equal(backendSlotFromDisplay(1), 0);
  assert.equal(backendSlotFromDisplay(100), 99);
  assert.equal(displaySlotFromBackend(0), "1");
  assert.equal(displaySlotFromBackend(99), "100");
  assert.equal(backendSlotFromDisplay(0), null);
  assert.equal(displaySlotFromBackend(-1), "");
});

test("zone normalization and labels use only the supported character-board zones", () => {
  assert.equal(normalizeZone("front-bottom"), "FRONT-BOTTOM");
  assert.equal(zoneLabel("FRONT-BOTTOM"), "Front Bottom");
  assert.equal(normalizeZone("FLEET"), "");
});
