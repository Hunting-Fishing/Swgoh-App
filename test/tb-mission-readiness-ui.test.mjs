import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const overlayUrl = new URL("../public/tb-combat-overlay.js", import.meta.url);
const cssUrl = new URL("../public/tb-mission-readiness.css", import.meta.url);
const overlay = readFileSync(overlayUrl, "utf8");
const css = readFileSync(cssUrl, "utf8");

test("shared TB overlay consumes roster readiness and strategy coverage engines", () => {
  assert.match(overlay, /missionRosterReadiness/);
  assert.match(overlay, /missionStrategyCoverage/);
  assert.match(overlay, /decorateMissionReadiness/);
});

test("mission readiness strip decorates ROTE, DS Geo and all legacy TB mission card shapes", () => {
  assert.match(overlay, /data-legacy-mission-id/);
  assert.match(overlay, /data-dsgeo-mission-id/);
  assert.match(overlay, /data-rote-exact-mission-card/);
  assert.match(overlay, /\.dsgeo-mission-body,\.rote-exact-body/);
});

test("mission strip exposes roster readiness and strategy evidence before detailed team prep", () => {
  assert.match(overlay, /Roster Readiness/);
  assert.match(overlay, /Strategy Evidence/);
  assert.match(overlay, /STRATEGY AVAILABLE/);
  assert.match(overlay, /NO VERIFIED STRATEGY YET/);
  assert.match(overlay, /LOAD ALLY CODE/);
  assert.match(overlay, /coverage\.coverage.*covered/s);
  assert.match(overlay, /coverage\.coverage.*partial/s);
});

test("overlay does not require a live roster before rendering strategy coverage", () => {
  const decorateIndex = overlay.indexOf("decorateMissionReadiness(panel, body, missions)");
  const bodyGuardIndex = overlay.indexOf("if (!body) return;", decorateIndex);
  assert.ok(decorateIndex > 0, "mission readiness decoration call should exist");
  assert.ok(bodyGuardIndex > decorateIndex, "strategy coverage must render before the no-roster early return");
});

test("readiness strip styles visibly distinguish ready, warning, blocked and unknown states", () => {
  assert.match(css, /\.tb-mission-readiness-strip/);
  for (const state of ["ready", "warning", "blocked", "unknown"]) {
    assert.match(css, new RegExp(`\\.tb-mission-readiness-strip \\.${state}`));
  }
  assert.match(css, /grid-template-columns:repeat\(2/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test("mission readiness UI modules parse", () => {
  execFileSync(process.execPath, ["--check", overlayUrl.pathname]);
});
