import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../public/guild-safe-readiness-entry.js", import.meta.url), "utf8");

test("TB readiness hydrates detailed member units from persisted player baselines", () => {
  assert.match(source, /\/api\/player\/\$\{code\}\/baseline/);
  assert.match(source, /BASELINE_CONCURRENCY\s*=\s*6/);
  assert.match(source, /units:\s*units/);
  assert.match(source, /rosterAvailable:\s*units\.length\s*>\s*0/);
  assert.match(source, /persisted-player-baselines/);
});

test("TB readiness does not force-refresh the live Comlink guild roster", () => {
  assert.doesNotMatch(source, /roster\?refresh=1/);
  assert.match(source, /\/api\/guild\/by-player\/\$\{allyCode\}\/roster/);
});
