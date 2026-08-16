import test from "node:test";
import assert from "node:assert/strict";
import { getDiscordLinkedPlayerSnapshot } from "../discord-linked-player-service.mjs";

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

function rosterService(members, calls = []) {
  return {
    async getGuildRoster(allyCode, options) {
      calls.push({ allyCode, options });
      return {
        value: {
          source: "live",
          guild: { id: "guild-live", name: "Command Guild" },
          members,
        },
        cache: "fresh",
        ageMs: 321,
      };
    },
  };
}

test("linked player read resolves the durable identity against the bound live guild roster", async () => {
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
  assert.equal(result.guildName, "Command Guild");
  assert.equal(result.link.swgohAllyCode, "444555666");
  assert.equal(result.member.name, "Linked Player");
  assert.equal(result.member.galacticPower, 9876543);
  assert.equal(result.rosterCache, "fresh");
  assert.equal(result.rosterAgeMs, 321);
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
