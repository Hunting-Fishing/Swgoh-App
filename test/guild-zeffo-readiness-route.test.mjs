import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const unitRouter = await readFile(new URL("../public/guild-unit-matrix-router.js", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-zeffo-readiness-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-zeffo-readiness-page.js", import.meta.url), "utf8");
const model = await readFile(new URL("../public/guild-zeffo-readiness-model.js", import.meta.url), "utf8");
const mandaloreModel = await readFile(new URL("../public/guild-mandalore-readiness-model.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-zeffo-readiness.css", import.meta.url), "utf8");

test("TB readiness officer page is loaded by the existing Guild route asset", () => {
  assert.match(unitRouter, /guild-zeffo-readiness-router\.js/);
  assert.match(router, /const ZEFFO_ROUTE = "\/guild\/zeffo"/);
  assert.match(router, /guildZeffoReadinessNav/);
  assert.match(router, /guildZeffoOverviewCard/);
  assert.match(router, /guildTbZeffoReadinessLink/);
  assert.match(router, /TB Readiness/);
});

test("TB readiness uses the live generic guild roster plus static catalog", () => {
  assert.match(router, /\/api\/guild\/by-player\/\$\{allyCode\}\/roster/);
  assert.match(router, /\/data\/catalog\.json\?tb-readiness=1/);
  assert.match(page, /buildGuildMandaloreReadiness/);
});

test("officer view keeps profile-first rows and a separate not-ready action list", () => {
  assert.match(page, /guild-zeffo-member-profile/);
  assert.match(page, /guild-zeffo-member-gp/);
  assert.match(page, /OFFICER ACTION LIST/);
  assert.match(page, /Members not ready/);
  assert.match(page, /Copy Action List/);
  assert.match(page, /Download CSV/);
  assert.match(css, /guild-zeffo-member-card/);
});

test("Zeffo and Mandalore are live mission tabs while future missions remain placeholders", () => {
  assert.match(page, /MISSION_TABS/);
  assert.match(page, /Zeffo \/ Bracca/);
  assert.match(page, /\{ id: "mandalore", label: "Mandalore", live: true \}/);
  assert.match(page, /\{ id: "reva", label: "Reva", comingSoon: true \}/);
  assert.match(page, /Wat Tambor/);
  assert.match(page, /setMission/);
  assert.match(css, /guild-tb-mission-tabs/);
});

test("Zeffo model preserves profile metadata and exact Bracca gate", () => {
  assert.match(model, /profileTitle/);
  assert.match(model, /memberRole/);
  assert.match(model, /CEREJUNDA/);
  assert.match(model, /JEDIKNIGHTCAL/);
  assert.match(model, /CALKESTIS/);
  assert.match(model, /ZEFFO_UNLOCK_TARGET = 30/);
});

test("Mandalore model encodes exact core units, dynamic third Mandalorian and 25-clear target", () => {
  assert.match(mandaloreModel, /MANDALORBOKATAN/);
  assert.match(mandaloreModel, /THEMANDALORIANBESKARARMOR/);
  assert.match(mandaloreModel, /MANDALORE_UNLOCK_TARGET = 25/);
  assert.match(mandaloreModel, /bestAdditionalMandalorian/);
  assert.match(mandaloreModel, /Mandalorian/);
  assert.match(mandaloreModel, /relic >= 7/);
});
