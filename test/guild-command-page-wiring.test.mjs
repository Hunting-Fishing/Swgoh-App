import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const page = await readFile(new URL("../public/guild-command-page.js", import.meta.url), "utf8");
const cache = await readFile(new URL("../public/live-fetch-cache.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

test("Guild Command Page assets load after existing guild intelligence modules", () => {
  const strategy = index.indexOf('/guild-rote-strategy-audit.js?v=20260816-guildstrategy1');
  const guildPage = index.indexOf('/guild-command-page.js?v=20260817-guildpage1');
  assert.ok(strategy >= 0);
  assert.ok(guildPage > strategy);
  assert.match(index, /guild-command-page\.css\?v=20260817-guildpage1/);
  assert.match(index, /live-fetch-cache\.js\?v=20260817-cache3/);
});

test("full Guild Page exposes overview members TB TW and raid sections", () => {
  for (const marker of ["Overview", "Members", "Territory Battles", "Territory Wars", "Raids"]) assert.match(page, new RegExp(marker));
  assert.match(page, /guildPageTbTools/);
  assert.match(page, /Refresh Guild Now/);
  assert.match(page, /Load This Member/);
  assert.match(page, /guildTab\.textContent = "Guild"/);
});

test("forced guild refresh bypasses browser cache and uses the shared web Discord guild service", () => {
  assert.match(page, /\?refresh=1/);
  assert.match(cache, /const force = url\.searchParams\.get\("refresh"\) === "1"/);
  assert.match(cache, /if \(info\.force\) cache\.delete\(info\.key\)/);
  assert.match(server, /const forceRefresh = url\.searchParams\.get\("refresh"\) === "1"/);
  assert.match(server, /guildRosterService\.getGuildRoster\(allyCode/);
  assert.match(server, /forceRefresh,/);
  assert.match(server, /staleWhileRevalidate: !forceRefresh/);
  assert.match(server, /"X-Guild-Refresh": forceRefresh \? "requested" : "normal"/);
});

test("Guild Page preserves evidence boundaries for TW and raids", () => {
  assert.match(page, /not a TW win\/readiness score/);
  assert.match(page, /Current raid-specific rules must be encoded before this becomes a raid readiness score/);
  assert.match(page, /Membership history is browser-local/);
});
