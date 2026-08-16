import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const routes = await readFile(new URL("../public/guild-route-pages.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/guild-route-pages.css", import.meta.url), "utf8");
const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");

test("Guild is split into dedicated addressable pages", () => {
  for (const path of ["/guild", "/guild/members", "/guild/tb", "/guild/tw", "/guild/raids"]) {
    assert.ok(routes.includes(`\"${path}\"`), `missing Guild route ${path}`);
  }
  assert.match(routes, /routeFromPath/);
  assert.match(routes, /guild-route-nav/);
});

test("home Guild workspace control becomes a route link instead of opening an embedded panel", () => {
  assert.match(routes, /button\[data-workspace-tab=\\"guild\\"\]/);
  assert.match(routes, /document\.createElement\("a"\)/);
  assert.match(routes, /button\.replaceWith\(link\)/);
  assert.match(routes, /link\.textContent = "Guild"/);
  assert.match(routes, /location\.hash\.toLowerCase\(\) === "#guild"/);
});

test("dedicated Guild page preserves Ally Code across pages and back to player roster", () => {
  assert.match(routes, /swgoh:guild-route-ally-code/);
  assert.match(routes, /\?allyCode=/);
  assert.match(routes, /Open Player Roster/);
  assert.match(routes, /requestSubmit/);
});

test("Territory Battles reuses existing officer tooling only inside the TB route page", () => {
  assert.match(routes, /state\.route === "tb"/);
  assert.match(routes, /guildPageTbTools/);
  assert.match(routes, /state\.tbTools\.dataset\.workspacePanel = "guild"/);
  assert.match(routes, /ROTE mission coverage, Phase Command, Operations, redundancy, farm priorities and officer tools are isolated on this page/);
});

test("TW and Raid pages remain evidence-safe foundations", () => {
  assert.match(routes, /no fabricated TW readiness or win score/);
  assert.match(routes, /Current metrics are roster depth only until current raid restrictions, teams and score bands are encoded/);
});

test("route assets are loaded after the existing Guild Command page", () => {
  const command = index.indexOf('/guild-command-page.js?v=20260817-guildpage1');
  const route = index.indexOf('/guild-route-pages.js?v=20260817-guildroutes1');
  assert.ok(command >= 0 && route > command);
  assert.match(index, /guild-route-pages\.css\?v=20260817-guildroutes1/);
  assert.match(css, /guild-route-shell/);
});

test("server static fallback keeps direct Guild URLs refresh-safe", () => {
  assert.match(server, /readFile\(path\.join\(root, "index\.html"\)\)/);
  assert.match(server, /serveStatic\(response, url\.pathname\)/);
});
