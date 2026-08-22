import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const router = await readFile(new URL("../public/guild-zeffo-readiness-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-tb-readiness-page.js", import.meta.url), "utf8");
const reva = await readFile(new URL("../public/guild-reva-readiness-model.js", import.meta.url), "utf8");
const wat = await readFile(new URL("../public/guild-wat-readiness-model.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-tb-readiness.css", import.meta.url), "utf8");

test("Guild TB Readiness router loads the unified multi-mission page", () => {
  assert.match(router, /guild-tb-readiness-page\.js/);
  assert.match(router, /renderGuildTbReadinessPage/);
  assert.match(router, /TB Mission Readiness/);
});

test("Reva and Wat tabs are live alongside Zeffo and Mandalore", () => {
  assert.match(page, /id: "zeffo"/);
  assert.match(page, /id: "mandalore"/);
  assert.match(page, /id: "reva"/);
  assert.match(page, /id: "wat"/);
  assert.match(page, /buildGuildRevaReadiness/);
  assert.match(page, /buildGuildWatReadiness/);
  assert.match(page, /potential shards/);
});

test("Reva model encodes GI plus four dynamic Inquisitorius at R7", () => {
  assert.match(reva, /GRANDINQUISITOR/);
  assert.match(reva, /REVA_REQUIRED_SUPPORTS = 4/);
  assert.match(reva, /Inquisitorius/);
  assert.match(reva, /relic >= 7/);
});

test("Wat model encodes the exact 7-star and 16,500 power gate", () => {
  assert.match(wat, /WAT_REQUIRED_POWER = 16500/);
  assert.match(wat, /WAT_REQUIRED_STARS = 7/);
  assert.match(wat, /GEONOSIANBROODALPHA/);
  assert.match(wat, /GEONOSIANSOLDIER/);
  assert.match(wat, /GEONOSIANSPY/);
  assert.match(wat, /POGGLETHELESSER/);
  assert.match(wat, /SUNFAC/);
});

test("multi-unit mission cards support five requirement columns", () => {
  assert.match(css, /guild-tb-requirements-5/);
  assert.match(css, /repeat\(5/);
});
