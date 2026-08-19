import test from "node:test";
import assert from "node:assert/strict";
import { boardEvidenceDetail, dispatchBoardEvidenceUpdated } from "../public/gac-board-evidence-events.js";
import { savedDefenseCount } from "../public/gac-board-save-refresh.js";

test("board evidence event detail normalizes owner, round, action, and defense id", () => {
  assert.deepEqual(boardEvidenceDetail({ owner: "opponent", round: 3, action: "saved", defenseId: 44 }), {
    owner: "opponent",
    round: 3,
    action: "saved",
    defenseId: 44,
  });
  assert.deepEqual(boardEvidenceDetail({ owner: "PLAYER", round: 9, action: "unknown", defenseId: 0 }), {
    owner: "player",
    round: null,
    action: "updated",
    defenseId: null,
  });
});

test("dispatch publishes the shared board-evidence event with normalized detail", () => {
  const previousWindow = global.window;
  const previousCustomEvent = global.CustomEvent;
  let captured = null;
  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  global.CustomEvent = FakeCustomEvent;
  global.window = { dispatchEvent(event) { captured = event; } };
  try {
    const detail = dispatchBoardEvidenceUpdated({ owner: "opponent", round: 2, action: "loaded" });
    assert.equal(captured.type, "gac-board-evidence-updated");
    assert.deepEqual(captured.detail, detail);
    assert.deepEqual(detail, { owner: "opponent", round: 2, action: "loaded", defenseId: null });
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousCustomEvent === undefined) delete global.CustomEvent;
    else global.CustomEvent = previousCustomEvent;
  }
});

test("saved defense count ignores placeholder options and counts persisted defense ids", () => {
  const select = {
    options: [
      { value: "" },
      { value: "44" },
      { value: "45" },
      { value: "not-an-id" },
    ],
  };
  assert.equal(savedDefenseCount(select), 2);
  assert.equal(savedDefenseCount(null), 0);
});
