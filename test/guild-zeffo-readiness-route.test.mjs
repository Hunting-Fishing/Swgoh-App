import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const unitRouter = await readFile(new URL("../public/guild-unit-matrix-router.js", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-zeffo-readiness-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-zeffo-readiness-page.js", import.meta.url), "utf8");
const model = await readFile(new URL("../public/guild-zeffo-readiness-model.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-zeffo-readiness.css", import.meta.url), "utf8");

test("Zeffo officer page is loaded by the existing Guild route asset", () => {
  assert.match(unitRouter, /guild-zeffo-readiness-router\.js/);
  assert.match(router, /const ZEFFO_ROUTE = "\/guild\/zeffo"/);
  assert.match(router, /guildZeffoReadinessNav/);
  assert.match(router, /guildZeffoOverviewCard/);
  assert.match(router, /guildTbZeffoReadinessLink/);
  assert.match(router, /TB Readiness/);
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

test("TB readiness view is profile-first and prepared for additional mission tabs", () => {
  assert.match(page, /MISSION_TABS/);
  assert.match(page, /Zeffo \/ Bracca/);
  assert.match(page, /Mandalore/);
  assert.match(page, /Reva/);
  assert.match(page, /Wat Tambor/);
  assert.match(page, /guild-zeffo-member-profile/);
  assert.match(page, /guild-zeffo-member-gp/);
  assert.match(page, /Overall GP/);
  assert.match(css, /guild-zeffo-member-card/);
  assert.match(css, /guild-tb-mission-tabs/);
});

test("model preserves profile metadata when the live guild payload exposes it", () => {
  assert.match(model, /profileTitle/);
  assert.match(model, /memberRole/);
  assert.match(model, /portraitKey/);
});

test("model encodes exact Bracca gate and preferred JKCK path", () => {
  assert.match(model, /CEREJUNDA/);
  assert.match(model, /JEDIKNIGHTCAL/);
  assert.match(model, /CALKESTIS/);
  assert.match(model, /ZEFFO_UNLOCK_TARGET = 30/);
  assert.match(model, /JKCK/);
});
