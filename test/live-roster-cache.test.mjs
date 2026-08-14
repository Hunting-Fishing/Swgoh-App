import test from "node:test";
import assert from "node:assert/strict";
import { LiveRosterCache } from "../live-roster-cache.mjs";

test("coalesces simultaneous Ally Code loads into one upstream request", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new LiveRosterCache({ freshMs: 100, staleMs: 1_000, now: () => now });
  const loader = async () => {
    loads += 1;
    await Promise.resolve();
    return { player: "same" };
  };

  const [first, second, third] = await Promise.all([
    cache.getOrLoad("732764286", loader),
    cache.getOrLoad("732764286", loader),
    cache.getOrLoad("732764286", loader),
  ]);

  assert.equal(loads, 1);
  assert.deepEqual(first.value, { player: "same" });
  assert.deepEqual(second.value, { player: "same" });
  assert.deepEqual(third.value, { player: "same" });
});

test("serves fresh entries without reloading", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new LiveRosterCache({ freshMs: 100, staleMs: 1_000, now: () => now });
  await cache.getOrLoad("a", async () => ({ version: ++loads }));
  now += 50;
  const result = await cache.getOrLoad("a", async () => ({ version: ++loads }));

  assert.equal(result.cache, "fresh");
  assert.equal(result.value.version, 1);
  assert.equal(loads, 1);
});

test("serves stale data immediately and coalesces revalidation", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new LiveRosterCache({ freshMs: 100, staleMs: 1_000, now: () => now });
  await cache.getOrLoad("a", async () => ({ version: ++loads }));
  now += 200;

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const loader = async () => {
    loads += 1;
    await gate;
    return { version: loads };
  };

  const stale1 = await cache.getOrLoad("a", loader);
  const stale2 = await cache.getOrLoad("a", loader);
  assert.equal(stale1.cache, "stale");
  assert.equal(stale2.cache, "stale");
  assert.equal(stale1.value.version, 1);
  assert.equal(loads, 2);

  release();
  await cache.pending.get("a");
  const refreshed = cache.inspect("a");
  assert.equal(refreshed.state, "fresh");
  assert.equal(refreshed.value.version, 2);
});

test("expired entries block for a new load", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new LiveRosterCache({ freshMs: 100, staleMs: 500, now: () => now });
  await cache.getOrLoad("a", async () => ({ version: ++loads }));
  now += 600;
  const result = await cache.getOrLoad("a", async () => ({ version: ++loads }));

  assert.equal(result.cache, "miss");
  assert.equal(result.value.version, 2);
  assert.equal(loads, 2);
});
