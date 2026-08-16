import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-raid-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-raid-order66-page.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../public/guild-raid-order66-rules.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-raid-order66.css", import.meta.url), "utf8");

test("Raid Command is split into dedicated nested Guild pages", () => {
  for (const path of ["/guild/raids", "/guild/raids/order-66", "/guild/raids/members", "/guild/raids/units", "/guild/raids/milestones"]) {
    assert.ok(router.includes(`\"${path}\"`), `missing Raid route ${path}`);
  }
  assert.match(router, /sectionFromPath/);
  assert.match(router, /guildRaidSubnav/);
});

test("Raid nested pages preserve the parent Guild Raid navigation state", () => {
  assert.match(router, /fixGuildNav/);
  assert.match(router, /href\.startsWith\("\/guild\/raids"\)/);
  assert.match(router, /link\.classList\.toggle\("active", isRaid\)/);
});

test("Raid subnav is guarded against MutationObserver feedback", () => {
  assert.match(router, /nav\.dataset\.renderKey === renderKey/);
  assert.match(router, /nav\.dataset\.renderKey = renderKey/);
  assert.match(router, /new MutationObserver/);
});

test("heavy Raid capability page is lazy-loaded only on Raid routes", () => {
  assert.match(router, /import\("\.\/guild-raid-order66-page\.js"\)/);
  assert.equal(index.includes('/guild-raid-order66-page.js?v='), false);
  assert.match(index, /guild-raid-router\.js\?v=20260817-guildraid1/);
});

test("Raid page keeps roster facts separate from score forecasts", () => {
  assert.match(page, /does not infer submitted attempts, battle success, team damage, or projected guild raid score/);
  assert.match(page, /do not assert a valid optimized team, an unused attempt, or a score/);
  assert.match(page, /no guild score is projected from roster depth/);
});

test("Order 66 rules are tag-first with an official fallback and character-only eligibility", () => {
  assert.match(rules, /raid order66 allowed/);
  assert.match(rules, /catalog-tag\+fallback/);
  assert.match(rules, /official-fallback/);
  assert.match(rules, /unitType\(unit\) === "Character"/);
  assert.match(rules, /Pirates/);
  assert.match(rules, /Jedi Vanguard/);
  assert.match(rules, /Dark Side Clone Troopers/);
});

test("Raid pages expose member unit milestone and Unit Matrix drilldowns", () => {
  assert.match(page, /Raid Member Depth/);
  assert.match(page, /Eligible Unit Coverage/);
  assert.match(page, /Order 66 Guild Milestones/);
  assert.match(page, /Open Unit Matrix →/);
  assert.match(page, /Open Roster →/);
});

test("Raid assets load after Guild route, Unit Matrix and TW assets", () => {
  const routeCss = index.indexOf('/guild-route-pages.css?v=20260817-guildroutes1');
  const unitCss = index.indexOf('/guild-unit-matrix-page.css?v=20260817-guildunit2');
  const twCss = index.indexOf('/guild-tw-capability.css?v=20260817-guildtw1');
  const raidCss = index.indexOf('/guild-raid-order66.css?v=20260817-guildraid1');
  const twRouter = index.indexOf('/guild-tw-router.js?v=20260817-guildtw1');
  const raidRouter = index.indexOf('/guild-raid-router.js?v=20260817-guildraid1');
  assert.ok(raidCss > routeCss && raidCss > unitCss && raidCss > twCss);
  assert.ok(raidRouter > twRouter);
  assert.match(css, /guild-raid-subnav/);
});
