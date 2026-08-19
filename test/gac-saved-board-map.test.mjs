import test from "node:test";
import assert from "node:assert/strict";
import { groupBoardDefenses, normalizeDefense } from "../public/gac-saved-board-map.js";

test("saved defenses group by exact zone and backend slot order", () => {
  const model = groupBoardDefenses([
    { id: 2, leaderBaseId: "B", members: ["B", "B2", "B3"], zone: "FRONT-TOP", slot: 2 },
    { id: 1, leaderBaseId: "A", members: ["A", "A2", "A3"], zone: "FRONT-TOP", slot: 0 },
    { id: 3, leaderBaseId: "C", members: ["C", "C2", "C3"], zone: "BACK-BOTTOM", slot: 1 },
  ]);
  assert.equal(model.total, 3);
  assert.equal(model.positioned, 3);
  const frontTop = model.zones.find((zone) => zone.value === "FRONT-TOP");
  assert.deepEqual(frontTop.defenses.map((defense) => defense.id), [1, 2]);
  const backBottom = model.zones.find((zone) => zone.value === "BACK-BOTTOM");
  assert.equal(backBottom.defenses[0].id, 3);
});

test("unpositioned saves remain visible rather than being assigned to a guessed zone", () => {
  const model = groupBoardDefenses([
    { id: 1, leaderBaseId: "A", members: ["A", "A2", "A3"], zone: "", slot: null },
    { id: 2, leaderBaseId: "B", members: ["B", "B2", "B3"], zone: "FRONT-TOP", slot: null },
  ]);
  assert.equal(model.positioned, 0);
  assert.equal(model.unpositioned.length, 2);
  assert.deepEqual(model.unpositioned.map((defense) => defense.id), [1, 2]);
});

test("unsupported zones are normalized to unpositioned instead of invented board truth", () => {
  const defense = normalizeDefense({ id: 4, leaderBaseId: "FLEET", members: ["FLEET"], zone: "FLEET", slot: 0 });
  assert.equal(defense.zone, "");
  const model = groupBoardDefenses([defense]);
  assert.equal(model.positioned, 0);
  assert.equal(model.unpositioned.length, 1);
});

test("datacron and source evidence are preserved on board tiles", () => {
  const defense = normalizeDefense({
    id: 5,
    leaderBaseId: "DEF",
    members: ["DEF", "D2", "D3"],
    zone: "BACK-TOP",
    slot: 0,
    datacron: { id: "DC-9", level: 9 },
    confidence: 1,
    source: "user-confirmed-current-board",
  });
  assert.equal(defense.datacron.id, "DC-9");
  assert.equal(defense.confidence, 1);
  assert.equal(defense.source, "user-confirmed-current-board");
});
