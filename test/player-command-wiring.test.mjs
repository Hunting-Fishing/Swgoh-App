import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("app shell loads Player Command after workspace tabs with cache-busted canonical fetch layer", async () => {
  const html = await text("public/index.html");
  const workspace = html.indexOf('/workspace-tabs.js?v=20260815-pro10');
  const playerCommand = html.indexOf('/player-command-dashboard.js?v=20260818-playercmd2');
  assert.ok(workspace >= 0, "workspace tabs loader missing");
  assert.ok(playerCommand > workspace, "Player Command must load after workspace creation");
  assert.match(html, /live-fetch-cache\.js\?v=20260818-cache4/);
  assert.match(html, /player-history-panel\.js\?v=20260818-history2/);
});

test("shared fetch cache coalesces player and Guild baselines plus history", async () => {
  const source = await text("public/live-fetch-cache.js");
  assert.match(source, /kind: "player-baseline"/);
  assert.match(source, /kind: "player-history"/);
  assert.match(source, /kind: "guild-baseline"/);
  assert.match(source, /kind: "guild-history"/);
  assert.match(source, /inflight\.has\(info\.key\)/);
  assert.match(source, /params\.delete\("refresh"\)/);
});

test("Player Command exposes persisted refresh, live promotion, full roster and ROTE drill-down", async () => {
  const source = await text("public/player-command-dashboard.js");
  assert.match(source, /Refresh Persisted/);
  assert.match(source, /Refresh Live Detail/);
  assert.match(source, /Open Full Roster/);
  assert.match(source, /ROTE Required Units/);
  assert.match(source, /\/api\/player\/\$\{allyCode\}\/baseline/);
  assert.match(source, /\/api\/guild\/by-player\/\$\{allyCode\}\/baseline/);
});
