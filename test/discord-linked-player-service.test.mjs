import test from "node:test";
import assert from "node:assert/strict";
import { cacheDisplay, getDiscordLinkedPlayerSnapshot } from "../discord-linked-player-service.mjs";

const guildId = "987654321098765432";
const userId = "222222222222222222";

function durableState({ linked = true, bound = true } = {}) {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
    readGuild: async (requestedGuildId) => {
      assert.equal(requestedGuildId, guildId);
      return {
        discordGuildId: guildId,
        swgohAllyCode: bound ? "123456789" : "",
        userLinks: linked ? {
          [userId]: {
            discordUserId: userId,
            swgohAllyCode: "444555666",
            playerId: "player-444",
          },
        } : {},
      };
    },
  };
}

function rosterService(members, calls = [], cache = "fresh") {
  return {
    async getGuildRoster(allyCode, options) {
      calls.push({ allyCode, options });
      return {
        value: {
          source: "live",
          guild: { id: "guild-live", name: "Command Guild" },
          members,
        },
        cache,
        ageMs: 321,
      };
    },
  };
}

test("linked player read resolves the durable identity against the bound live rich guild roster", async () => {
  const calls = [];
  const result = await getDiscordLinkedPlayerSnapshot({
    discordGuildId: guildId,
    discordUserId: userId,
    stateStore: durableState(),
    rosterService: rosterService([{
      playerId: "player-444",
      allyCode: "444555666",
      name: "Linked Player",
      galacticPower: 9876543,
      rosterAvailable: true,
      units: [],
    }], calls),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].allyCode, "123456789");
  assert.equal(calls[0].options.staleWhileRevalidate, false);
  assert.equal(calls[0].options.includeActivity, true);
  assert.equal(result.guildName, "Command Guild");
  assert.equal(result.link.swgohAllyCode, "444555666");
  assert.equal(result.member.name, "Linked Player");
  assert.equal(result.member.galacticPower, 9876543);
  assert.equal(result.rosterCache, "fresh live cache");
  assert.equal(result.rosterCacheState, "fresh");
  assert.equal(result.rosterAgeMs, 321);
});

test("cold cache miss is presented as a successful fresh live fetch", async () => {
  const result = await getDiscordLinkedPlayerSnapshot({
    discordGuildId: guildId,
    discordUserId: userId,
    stateStore: durableState(),
    rosterService: rosterService([{
      playerId: "player-444",
      allyCode: "444555666",
      name: "Linked Player",
      galacticPower: 9876543,
      rosterAvailable: true,
      units: [],
    }], [], "miss"),
  });
  assert.equal(result.rosterCache, "live refresh (fresh fetch)");
  assert.equal(result.rosterCacheState, "miss");
  assert.equal(cacheDisplay("refreshed"), "live refresh (cache renewed)");
});

test("unlinked Discord member fails before any guild roster request", async () => {
  let rosterRead = false;
  await assert.rejects(
    getDiscordLinkedPlayerSnapshot({
      discordGuildId: guildId,
      discordUserId: userId,
      stateStore: durableState({ linked: false }),
      rosterService: {
        async getGuildRoster() {
          rosterRead = true;
          return { value: { members: [] } };
        },
      },
    }),
    (error) => error?.code === "DISCORD_PLAYER_NOT_LINKED",
  );
  assert.equal(rosterRead, false);
});

test("linked player that left the bound guild fails closed instead of returning stale identity evidence", async () => {
  await assert.rejects(
    getDiscordLinkedPlayerSnapshot({
      discordGuildId: guildId,
      discordUserId: userId,
      stateStore: durableState(),
      rosterService: rosterService([{ allyCode: "777888999", name: "Different Player" }]),
    }),
    (error) => error?.code === "LINKED_PLAYER_NOT_IN_BOUND_GUILD" && /no longer present/.test(error.message),
  );
});

test("linked player read requires durable guild setup and durable storage", async () => {
  await assert.rejects(
    getDiscordLinkedPlayerSnapshot({
      discordGuildId: guildId,
      discordUserId: userId,
      stateStore: durableState({ bound: false }),
      rosterService: rosterService([]),
    }),
    (error) => error?.code === "DISCORD_GUILD_NOT_BOUND",
  );

  await assert.rejects(
    getDiscordLinkedPlayerSnapshot({
      discordGuildId: guildId,
      discordUserId: userId,
      stateStore: {
        status: () => ({ enabled: false, durable: false, reason: "no-volume" }),
      },
      rosterService: rosterService([]),
    }),
    (error) => error?.code === "DISCORD_STATE_NOT_DURABLE",
  );
});
