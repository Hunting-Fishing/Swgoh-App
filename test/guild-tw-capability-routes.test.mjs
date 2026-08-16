import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-tw-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-tw-capability-page.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-tw-capability.css", import.meta.url), "utf8");

test("TW command is split into addressable nested Guild pages", () => {
  for (const path of ["/guild/tw", "/guild/tw/teams", "/guild/tw/members", "/guild/tw/bottlenecks"]) {
    assert.ok(router.includes(`\"${path}\"`), `missing TW route ${path}`);
  }
  assert.match(router, /sectionFromPath/);
  assert.match(router, /guildTwSubnav/);
});

test("TW nested pages preserve the parent Guild Territory Wars navigation state", () => {
  assert.match(router, /fixGuildNav/);
  assert.match(router, /href\.startsWith\("\/guild\/tw"\)/);
  assert.match(router, /link\.classList\.toggle\("active", isTw\)/);
});

test("TW subnav uses a stable render key to avoid MutationObserver feedback", () => {
  assert.match(router, /nav\.dataset\.renderKey === renderKey/);
  assert.match(router, /nav\.dataset\.renderKey = renderKey/);
  assert.match(router, /new MutationObserver/);
});

test("heavy TW capability page is lazy-loaded only on TW routes", () => {
  assert.match(router, /import\("\.\/guild-tw-capability-page\.js"\)/);
  assert.equal(index.includes('/guild-tw-capability-page.js?v='), false);
  assert.match(index, /guild-tw-router\.js\?v=20260817-guildtw1/);
});

test("TW pages keep roster capability separate from meta and counter claims", () => {
  assert.match(page, /ROSTER EVIDENCE ONLY/);
  assert.match(page, /not current TW meta rankings/);
  assert.match(page, /not a TW meta-team list/);
  assert.match(page, /not a directive to farm the unit for TW/);
});

test("TW pages include teams members bottlenecks and Unit Matrix drilldowns", () => {
  assert.match(page, /Faction Team Coverage/);
  assert.match(page, /Member TW Roster Depth/);
  assert.match(page, /Faction Upgrade Bottlenecks/);
  assert.match(page, /Open Unit Matrix →/);
  assert.match(page, /Open Roster →/);
});

test("TW route assets load after core Guild route and Unit Matrix assets", () => {
  const routeCss = index.indexOf('/guild-route-pages.css?v=20260817-guildroutes1');
  const unitCss = index.indexOf('/guild-unit-matrix-page.css?v=20260817-guildunit2');
  const twCss = index.indexOf('/guild-tw-capability.css?v=20260817-guildtw1');
  const unitRouter = index.indexOf('/guild-unit-matrix-router.js?v=20260817-guildunit2');
  const twRouter = index.indexOf('/guild-tw-router.js?v=20260817-guildtw1');
  assert.ok(twCss > routeCss && twCss > unitCss);
  assert.ok(twRouter > unitRouter);
  assert.match(css, /guild-tw-subnav/);
});
