import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/live-fetch-cache.js", import.meta.url), "utf8");

function responseBody(url) {
  const text = String(url);
  if (text.includes("/data/catalog.json")) return { units: [{ baseId: "UNIT_A" }] };
  if (text.includes("/api/guild/by-player/") && text.includes("/roster")) return { guild: { name: "Guild" }, members: [{ playerId: "p1", units: [] }] };
  if (text.includes("/api/guild/by-player/")) return { guild: { name: "Guild" }, members: [{ playerId: "p1" }] };
  if (text.includes("/api/player/")) return { source: "live", player: { allyCode: "123456789" }, units: [], ships: [] };
  if (text.includes("/api/rote/operations")) return { requirements: [], totalSlots: 0 };
  return { passthrough: true };
}

function harness({ delayMs = 0 } = {}) {
  const calls = [];
  const nativeFetch = async (input) => {
    calls.push(String(input));
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return new Response(JSON.stringify(responseBody(input)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const window = {
    location: { href: "https://app.test/", origin: "https://app.test" },
    fetch: nativeFetch,
  };
  const context = vm.createContext({
    window,
    Request,
    Response,
    URL,
    Map,
    Set,
    Date,
    Object,
    String,
    Number,
    Array,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(source, context, { filename: "live-fetch-cache.js" });
  return { window, calls };
}

test("catalog query variants share one canonical cached response", async () => {
  const { window, calls } = harness();
  const first = await window.fetch("/data/catalog.json?journey=3", { cache: "no-store" });
  const second = await window.fetch("/data/catalog.json?gear-planner=1", { cache: "no-cache" });
  assert.equal(calls.length, 1);
  assert.deepEqual(await first.json(), { units: [{ baseId: "UNIT_A" }] });
  assert.deepEqual(await second.json(), { units: [{ baseId: "UNIT_A" }] });
  assert.equal(window.__swgohSharedFetchCache.stats().keys.includes("/data/catalog.json"), true);
  assert.equal(Array.isArray(window.__swgohCatalogSnapshot?.body?.units), true);
});

test("concurrent hydrated guild roster requests share one in-flight network call", async () => {
  const { window, calls } = harness({ delayMs: 10 });
  const [first, second, third] = await Promise.all([
    window.fetch("/api/guild/by-player/123456789/roster", { cache: "no-store" }),
    window.fetch("/api/guild/by-player/123456789/roster", { cache: "no-store" }),
    window.fetch("/api/guild/by-player/123456789/roster", { cache: "no-store" }),
  ]);
  assert.equal(calls.length, 1);
  assert.equal((await first.json()).members.length, 1);
  assert.equal((await second.json()).members.length, 1);
  assert.equal((await third.json()).members.length, 1);
  assert.equal(window.__swgohGuildRosterSnapshot?.allyCode, "123456789");
});

test("player cache remains backward-compatible and publishes the existing live snapshot", async () => {
  const { window, calls } = harness();
  await window.fetch("/api/player/123456789", { cache: "no-store" });
  await window.fetch("/api/player/123456789", { cache: "no-store" });
  assert.equal(calls.length, 1);
  assert.equal(window.__swgohLiveSnapshot?.allyCode, "123456789");
  assert.equal(window.__swgohRosterFetchCache.ttlMs, 25_000);
  window.__swgohRosterFetchCache.clear("123456789");
  await window.fetch("/api/player/123456789", { cache: "no-store" });
  assert.equal(calls.length, 2);
});

test("shared cache clear can invalidate guild catalog and operations scopes independently", async () => {
  const { window, calls } = harness();
  await window.fetch("/api/guild/by-player/123456789/roster");
  await window.fetch("/data/catalog.json?a=1");
  await window.fetch("/api/rote/operations");
  assert.equal(calls.length, 3);

  window.__swgohSharedFetchCache.clear("guild", "123456789");
  await window.fetch("/api/guild/by-player/123456789/roster");
  await window.fetch("/data/catalog.json?b=2");
  await window.fetch("/api/rote/operations");
  assert.equal(calls.length, 4, "only the cleared guild request should re-fetch");

  window.__swgohSharedFetchCache.clear("catalog");
  window.__swgohSharedFetchCache.clear("operations");
  await window.fetch("/data/catalog.json?c=3");
  await window.fetch("/api/rote/operations");
  assert.equal(calls.length, 6);
});

test("unrecognized same-origin requests and all cross-origin requests bypass the cache", async () => {
  const { window, calls } = harness();
  await window.fetch("/api/health");
  await window.fetch("/api/health");
  await window.fetch("https://example.com/data.json");
  await window.fetch("https://example.com/data.json");
  assert.equal(calls.length, 4);
});
