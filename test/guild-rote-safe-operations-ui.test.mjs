import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const ui = await readFile(new URL("../public/guild-rote-safe-operations-ui.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-rote-safe-operations.css", import.meta.url), "utf8");

test("safe Operations UI assets are wired after the existing guild planner", () => {
  const oldPlanner = index.indexOf('/guild-rote-pro.js?v=20260815-pro10');
  const safeUi = index.indexOf('/guild-rote-safe-operations-ui.js?v=20260816-guildsafe1');
  assert.ok(oldPlanner >= 0);
  assert.ok(safeUi > oldPlanner);
  assert.match(index, /guild-rote-safe-operations\.css\?v=20260816-guildsafe1/);
});

test("safe Operations UI mounts in both Guild and ROTE Operations surfaces", () => {
  assert.match(ui, /guildRoteSafeOperations/);
  assert.match(ui, /roteGuildSafeOperations/);
  assert.match(ui, /data-workspace-panel=\"guild\"/);
  assert.match(ui, /roteOperationsView/);
});

test("officer surface exposes GIVE KEEP ignore and HELP semantics", () => {
  assert.match(ui, /GIVE/);
  assert.match(ui, /KEEP/);
  assert.match(ui, /Ignore Member/);
  assert.match(ui, /HELP · MISSION RISK/);
  assert.match(css, /guild-safe-status\.keep/);
  assert.match(css, /guild-safe-status\.protected/);
});
