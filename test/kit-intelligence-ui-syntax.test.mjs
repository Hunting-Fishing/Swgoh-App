import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

for (const file of [
  "public/kit-semantics.js",
  "public/kit-intelligence-ui.js",
  "public/rote-squad-bridge.js",
  "scripts/enrich-kit-intelligence.mjs",
]) {
  test(`node syntax check: ${file}`, () => {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}\n${result.stderr || result.stdout}`);
  });
}
