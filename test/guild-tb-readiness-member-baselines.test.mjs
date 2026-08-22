import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/guild-safe-readiness-entry.js", import.meta.url), "utf8");

test("TB readiness prefers one compact Guild progression response", () => {
  assert.match(source, /\/api\/guild\/by-player\/\$\{allyCode\}\/planning-overlay/);
  assert.match(source, /overlay\?\.tbReadinessRoster/);
  assert.match(source, /Loaded compact TB progression/);
});

test("persisted player baselines remain a bounded fallback only", () => {
  assert.match(source, /\/api\/player\/\$\{code\}\/baseline/);
  assert.match(source, /BASELINE_CONCURRENCY\s*=\s*6/);
  assert.match(source, /persisted-player-baselines-fallback/);
  assert.match(source, /member\?\.rosterAvailable\s*===\s*true\s*\|\|\s*units\.length\s*>\s*0/);
});

test("TB readiness does not force-refresh the live Comlink guild roster", () => {
  assert.doesNotMatch(source, /roster\?refresh=1/);
  assert.match(source, /\/api\/guild\/by-player\/\$\{allyCode\}\/roster/);
});
