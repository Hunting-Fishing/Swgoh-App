import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const ui = await readFile(new URL("../public/guild-tb-phase-command-board.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-tb-phase-command-board.css", import.meta.url), "utf8");

test("Guild TB command assets load after the existing Guild planner", () => {
  const planner = index.indexOf('/guild-rote-safe-operations-ui.js?v=20260816-guildsafe1');
  const board = index.indexOf('/guild-tb-phase-command-board.js?v=20260817-guildtb1');
  assert.ok(planner >= 0);
  assert.ok(board > planner);
  assert.match(index, /guild-tb-phase-command-board\.css\?v=20260817-guildtb1/);
});

test("board stays capability-oriented and exposes officer phase controls", () => {
  assert.match(ui, /Phase Command Board/);
  assert.match(ui, /data-tb-phase/);
  assert.match(ui, /Open ROTE Map/);
  assert.match(ui, /Load Member/);
  assert.match(ui, /does not claim that an Operation has actually been filled/);
});

test("board styles critical warning and member burden states", () => {
  assert.match(css, /guild-tb-alert\.critical/);
  assert.match(css, /guild-tb-alert\.warning/);
  assert.match(css, /guild-tb-member-table/);
  assert.match(css, /guild-tb-chip\.bad/);
});
