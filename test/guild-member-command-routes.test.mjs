import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const router = await readFile(new URL("../public/guild-member-command-router.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-member-command-page.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-member-command.css", import.meta.url), "utf8");

test("Guild member profiles have addressable Ally Code routes", () => {
  assert.match(router, /MEMBER_ROUTE_RE = \/\^\\\/guild\\\/members\\\/\(\\d\{9\}\)/);
  assert.match(router, /targetMemberAllyCode/);
  assert.match(router, /memberProfileUrl/);
});

test("Guild Members TW and Raid tables gain Guild Profile links", () => {
  assert.match(router, /enhanceMemberList/);
  assert.match(router, /guild-tw-member-table/);
  assert.match(router, /guild-raid-member-table/);
  assert.match(router, /Guild Profile/);
  assert.match(css, /guild-member-profile-link/);
});

test("member profile keeps parent Guild Members navigation active", () => {
  assert.match(router, /fixGuildNav/);
  assert.match(router, /href\.startsWith\("\/guild\/members"\)/);
  assert.match(router, /link\.classList\.toggle\("active"/);
});

test("cross-mode profile is lazy-loaded only on member profile routes", () => {
  assert.match(router, /import\("\.\/guild-member-command-model\.js"\)/);
  assert.match(router, /import\("\.\/guild-member-command-page\.js"\)/);
  assert.equal(index.includes('/guild-member-command-page.js?v='), false);
  assert.equal(index.includes('/guild-member-command-model.js?v='), false);
  assert.match(index, /guild-member-command-router\.js\?v=20260817-guildmember1/);
});

test("member page exposes TB TW Raid and player drilldowns without a universal score", () => {
  assert.match(page, /Territory Battles/);
  assert.match(page, /Territory Wars/);
  assert.match(page, /Order 66 Raid/);
  assert.match(page, /Open Player Roster/);
  assert.match(page, /does not collapse GP, TB coverage, TW faction depth and Raid eligibility into a fabricated universal member score/);
});

test("member command CSS and router load after other Guild mode assets", () => {
  const raidCss = index.indexOf('/guild-raid-order66.css?v=20260817-guildraid1');
  const memberCss = index.indexOf('/guild-member-command.css?v=20260817-guildmember1');
  const raidRouter = index.indexOf('/guild-raid-router.js?v=20260817-guildraid1');
  const memberRouter = index.indexOf('/guild-member-command-router.js?v=20260817-guildmember1');
  assert.ok(memberCss > raidCss);
  assert.ok(memberRouter > raidRouter);
  assert.match(css, /guild-member-command-header/);
});
