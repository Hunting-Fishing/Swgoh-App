import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const unitRouter = await readFile(new URL("../public/guild-unit-matrix-router.js", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-zeffo-readiness-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-zeffo-readiness-page.js", import.meta.url), "utf8");
const model = await readFile(new URL("../public/guild-zeffo-readiness-model.js", import.meta.url), "utf8");

test("Zeffo officer page is loaded by the existing Guild route asset", () => {
  assert.match(unitRouter, /guild-zeffo-readiness-router\.js/);
  assert.match(router, /const ZEFFO_ROUTE = "\/guild\/zeffo"/);
  assert.match(router, /guildZeffoReadinessNav/);
  assert.match(router, /guildZeffoOverviewCard/);
  assert.match(router, /guildTbZeffoReadinessLink/);
});

test("Zeffo page uses the live generic guild roster endpoint", () => {
  assert.match(router, /\/api\/guild\/by-player\/\$\{allyCode\}\/roster/);
  assert.match(page, /This page is calculated from the current guild roster response/);
});

test("officer view keeps all three toon columns and a separate not-ready action list", () => {
  assert.match(page, /Cere Junda/);
  assert.match(page, /JKCK/);
  assert.match(page, /Baby Cal/);
  assert.match(page, /OFFICER ACTION LIST/);
  assert.match(page, /Members not ready/);
  assert.match(page, /Copy Action List/);
  assert.match(page, /Download CSV/);
});

test("model encodes exact Bracca gate and preferred JKCK path", () => {
  assert.match(model, /CEREJUNDA/);
  assert.match(model, /JEDIKNIGHTCAL/);
  assert.match(model, /CALKESTIS/);
  assert.match(model, /ZEFFO_UNLOCK_TARGET = 30/);
  assert.match(model, /JKCK/);
});
