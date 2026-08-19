import test from "node:test";
import assert from "node:assert/strict";
import { deleteDefensePayload, savedDefenseCount, selectedDefenseId } from "../public/gac-enemy-defense-delete.js";

test("delete payload contains only saved defense id and current round", () => {
  assert.deepEqual(deleteDefensePayload(44, 3), { id: 44, round: 3 });
});

test("invalid defense id or round cannot create a delete payload", () => {
  assert.equal(deleteDefensePayload(0, 3), null);
  assert.equal(deleteDefensePayload("bad", 3), null);
  assert.equal(deleteDefensePayload(44, 0), null);
  assert.equal(deleteDefensePayload(44, 4), null);
});

test("selected defense id accepts only positive persisted ids", () => {
  assert.equal(selectedDefenseId({ value: "44" }), 44);
  assert.equal(selectedDefenseId({ value: "" }), null);
  assert.equal(selectedDefenseId({ value: "not-an-id" }), null);
  assert.equal(selectedDefenseId(null), null);
});

test("saved defense count ignores selector placeholders", () => {
  const select = { options: [{ value: "" }, { value: "44" }, { value: "45" }, { value: "none" }] };
  assert.equal(savedDefenseCount(select), 2);
});
