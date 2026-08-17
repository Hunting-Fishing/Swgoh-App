import test from "node:test";
import assert from "node:assert/strict";
import { createGuildRosterService } from "../guild-roster-service.mjs";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function guildSnapshot(name, gp = 1) {
  return {
    source: "live",
    guild: { id: "guild-1", name, galacticPower: gp },
    members: [{ playerId: "p1", allyCode: "123456789", name: "Officer", rosterAvailable: true, units: [] }],
  };
}

test("shared guild roster service lets a forced Discord sync replace the snapshot later read by the web path", async () => {
  const bodies = [guildSnapshot("Before Sync", 100), guildSnapshot("After Sync", 200)];
  let fetches = 0;
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "secret",
    SWGOH_GUILD_CACHE_FRESH_SECONDS: "600",
    SWGOH_GUILD_CACHE_STALE_SECONDS: "1800",
    SWGOH_GUILD_CACHE_MAX_ENTRIES: "100",
  }, {
    fetch: async (url, options) => {
      assert.equal(url, "https://gateway.test/v1/guild/by-player/123456789/roster");
      assert.equal(options.headers["X-API-Key"], "secret");
      return response(bodies[Math.min(fetches++, bodies.length - 1)]);
    },
  });

  const webBefore = await service.getGuildRoster("123-456-789", { staleWhileRevalidate: true });
  assert.equal(webBefore.cache, "miss");
  assert.equal(webBefore.value.guild.name, "Before Sync");

  const discordSync = await service.refreshGuildRoster("123456789");
  assert.equal(discordSync.cache, "refreshed");
  assert.equal(discordSync.value.guild.name, "After Sync");

  const webAfter = await service.getGuildRoster("123456789", { staleWhileRevalidate: true });
  assert.equal(webAfter.cache, "fresh");
  assert.equal(webAfter.value.guild.name, "After Sync");
  assert.equal(webAfter.value.guild.galacticPower, 200);
  assert.equal(fetches, 2);
});

test("rich guild reads normalize total member GP from calculated character and ship GP", async () => {
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "secret",
  }, {
    fetch: async (url, options) => {
      assert.equal(url, "https://gateway.test/v1/guild/by-player/123456789/roster?activity=1");
      assert.equal(options.headers["X-API-Key"], "secret");
      return response({
        source: "live",
        guild: { id: "guild-1", name: "GP Guild", galacticPower: 0 },
        members: [{
          playerId: "p1",
          allyCode: "123456789",
          name: "Officer",
          galacticPower: 0,
          characterGalacticPower: 6_250_000,
          shipGalacticPower: 3_750_000,
          rosterAvailable: true,
          units: [],
        }],
      });
    },
  });

  const result = await service.getGuildRoster("123456789", {
    staleWhileRevalidate: false,
    includeActivity: true,
  });

  assert.equal(result.includeActivity, true);
  assert.equal(result.value.members[0].galacticPower, 10_000_000);
  assert.equal(result.value.guild.galacticPower, 10_000_000);
});

test("Discord-style fresh-or-refresh reads block on stale entries instead of planning from stale data", async () => {
  let now = 0;
  let fetches = 0;
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "secret",
    SWGOH_GUILD_CACHE_FRESH_SECONDS: "10",
    SWGOH_GUILD_CACHE_STALE_SECONDS: "30",
  }, {
    now: () => now,
    fetch: async () => response(guildSnapshot(`Version ${++fetches}`)),
  });

  const first = await service.getGuildRoster("123456789", { staleWhileRevalidate: false });
  assert.equal(first.value.guild.name, "Version 1");

  now = 11_000;
  const refreshed = await service.getGuildRoster("123456789", { staleWhileRevalidate: false });
  assert.equal(refreshed.cache, "refreshed");
  assert.equal(refreshed.value.guild.name, "Version 2");
  assert.equal(fetches, 2);
});

test("web stale-while-revalidate returns stale immediately but updates the same shared entry", async () => {
  let now = 0;
  let fetches = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "secret",
    SWGOH_GUILD_CACHE_FRESH_SECONDS: "10",
    SWGOH_GUILD_CACHE_STALE_SECONDS: "30",
  }, {
    now: () => now,
    fetch: async () => {
      fetches += 1;
      if (fetches === 2) await refreshGate;
      return response(guildSnapshot(`Version ${fetches}`));
    },
  });

  await service.getGuildRoster("123456789");
  now = 11_000;
  const stale = await service.getGuildRoster("123456789", { staleWhileRevalidate: true });
  assert.equal(stale.cache, "stale");
  assert.equal(stale.value.guild.name, "Version 1");
  assert.equal(fetches, 2);

  releaseRefresh();
  await new Promise((resolve) => setImmediate(resolve));
  const fresh = await service.getGuildRoster("123456789", { staleWhileRevalidate: false });
  assert.equal(fresh.cache, "fresh");
  assert.equal(fresh.value.guild.name, "Version 2");
});

test("shared guild roster service remains fail-closed for invalid Ally Codes and invalid upstream bodies", async () => {
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "secret",
  }, {
    fetch: async () => response({ source: "live", guild: null, members: [] }),
  });

  await assert.rejects(() => service.getGuildRoster("123"), /valid 9-digit Ally Code/);
  await assert.rejects(() => service.getGuildRoster("123456789"), /unexpected guild roster response/);
});

test("cache status distinguishes in-process web/Discord sharing from cross-instance sharing", () => {
  const service = createGuildRosterService({
    SWGOH_GATEWAY_URL: "https://gateway.test",
    SWGOH_GATEWAY_API_KEY: "secret",
    SWGOH_GUILD_CACHE_FRESH_SECONDS: "600",
    SWGOH_GUILD_CACHE_STALE_SECONDS: "1800",
    SWGOH_GUILD_CACHE_MAX_ENTRIES: "100",
  }, { fetch: async () => response(guildSnapshot("Unused")) });

  const status = service.status();
  assert.equal(status.sharedBetweenWebAndDiscord, true);
  assert.equal(status.sharedAcrossInstances, false);
  assert.equal(status.shared, false);
  assert.equal(status.freshSeconds, 600);
  assert.equal(status.staleSeconds, 1800);
  assert.equal(status.maxEntries, 100);
});
