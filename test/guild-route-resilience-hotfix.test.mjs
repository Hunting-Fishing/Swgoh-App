import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Guild resilience keeps built-in navigation usable without a live snapshot", async () => {
  const source = await readFile(new URL("../public/guild-route-resilience-hotfix.js", import.meta.url), "utf8");
  assert.match(source, /\/guild\/members/);
  assert.match(source, /\/guild\/tb/);
  assert.match(source, /\/guild\/tw/);
  assert.match(source, /\/guild\/raids/);
  assert.match(source, /snapshotReady\(\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /history\.pushState/);
  assert.match(source, /PopStateEvent/);
  assert.match(source, /Retry Guild Data/);
});

test("player TB cross-surface enhancer is excluded from Guild Officer routes", async () => {
  const source = await readFile(new URL("../public/guild-zeffo-readiness-router.js", import.meta.url), "utf8");
  assert.match(source, /guild-route-resilience-hotfix\.js/);
  assert.match(source, /if \(!location\.pathname\.startsWith\("\/guild"\)\)/);
  assert.match(source, /import\("\.\/tb-readiness-cross-surface\.js"\)/);
  assert.doesNotMatch(source, /^import "\.\/tb-readiness-cross-surface\.js";/m);
});
