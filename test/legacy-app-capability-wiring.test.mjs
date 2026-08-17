import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("legacy hero loader uses shared canonical-first roster source policy", async () => {
  const source = await text("public/app.js");
  assert.match(source, /from "\.\/roster-source-policy\.js"/);
  assert.match(source, /rosterEndpoint\(code, \{ forceLive \}\)/);
  assert.match(source, /loadPreferredRoster\(code\)/);
  assert.match(source, /\[404, 503\]\.includes\(Number\(error\?\.status\)\)/);
  assert.doesNotMatch(source, /body\?\.source !== "live"/);
  assert.doesNotMatch(source, /Live player fetched/);
});

test("legacy profile keeps unavailable persisted evidence unknown instead of zero", async () => {
  const source = await text("public/app.js");
  assert.match(source, /capabilities\.omegas === true/);
  assert.match(source, /Omegas \/ Eta/);
  assert.match(source, /optionalNumber\(omegas, "N\/A"\)/);
  assert.match(source, /capabilities\.sixDotMods === true/);
  assert.match(source, /capabilities\.datacrons === true/);
  assert.match(source, /capabilities\.competitiveProfile === true/);
  assert.match(source, /rosterSourceStatus\(body, rosterCount\)/);
});

test("legacy roster suppresses readiness and mod claims on canonical baseline", async () => {
  const source = await text("public/app.js");
  assert.match(source, /const liveDetail = isLiveRosterBody\(state\.lastBody\)/);
  assert.match(source, /readiness = liveDetail \? readinessAnalysis\(unit\) : null/);
  assert.match(source, /The persisted baseline does not claim mod-slot or readiness evidence/);
  assert.match(source, /Static ability definition · live ownership tier not loaded/);
  assert.match(source, /Full persisted roster loaded\. Squad readiness depends on live mod\/readiness evidence/);
});