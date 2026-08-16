import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-unit-matrix-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-unit-matrix-page.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-unit-matrix-page.css", import.meta.url), "utf8");

test("Unit Matrix is an addressable dedicated Guild page", () => {
  assert.match(router, /const UNIT_ROUTE = "\/guild\/units"/);
  assert.match(router, /guildRouteUnitMatrixNav/);
  assert.match(router, /Unit Matrix/);
  assert.match(router, /renderUnitRoute/);
});

test("Unit Matrix stays inside Guild navigation and overview", () => {
  assert.match(router, /guild-route-nav/);
  assert.match(router, /guildUnitMatrixOverviewCard/);
  assert.match(router, /injectMembersLink/);
  assert.match(router, /routeUrl\(UNIT_ROUTE\)/);
});

test("TB tables receive exact unit ownership deep links", () => {
  assert.match(router, /enhanceTbTables/);
  assert.match(router, /guildUnitMatrixEnhanced/);
  assert.match(router, /phaseFromRow/);
  assert.match(router, /unit: baseId/);
  assert.match(css, /guild-rote-unit-matrix-link/);
});

test("dedicated Unit Matrix page supports generic and ROTE Operation contexts", () => {
  assert.match(page, /All roster · no Operation gate/);
  assert.match(page, /P1 Operations/);
  assert.match(page, /Operation Quick Pick/);
  assert.match(page, /Safe\/GIVE donors/);
  assert.match(page, /Mission-protected\/KEEP status is planning intelligence|Mission-protected\/KEEP status/);
  assert.match(page, /Open Player Roster|Open Roster →/);
});

test("Unit Matrix page is lazy-loaded only when its route is opened", () => {
  assert.match(router, /import\("\.\/guild-unit-matrix-page\.js"\)/);
  assert.equal(index.includes('/guild-unit-matrix-page.js?v='), false);
  assert.match(index, /guild-unit-matrix-router\.js\?v=20260817-guildunit2/);
});

test("Unit Matrix styling and router load after dedicated Guild route assets", () => {
  const routeCss = index.indexOf('/guild-route-pages.css?v=20260817-guildroutes1');
  const unitCss = index.indexOf('/guild-unit-matrix-page.css?v=20260817-guildunit2');
  const routeJs = index.indexOf('/guild-route-pages.js?v=20260817-guildroutes1');
  const unitRouter = index.indexOf('/guild-unit-matrix-router.js?v=20260817-guildunit2');
  assert.ok(unitCss > routeCss);
  assert.ok(unitRouter > routeJs);
});
