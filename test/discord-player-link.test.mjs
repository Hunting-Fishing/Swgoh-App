import test from "node:test";
import assert from "node:assert/strict";
import { verifyDiscordGuildPlayerClaim } from "../discord-player-link.mjs";

function rosterService(snapshot, calls = []) {
  return {
    async getGuildRoster(allyCode, options) {
      calls.push({ allyCode, options });
      return {
        value: snapshot,
        cache: "fresh",
        ageMs: 1234,
      };
    },
  };
}

function durableStateStore(swgohAllyCode = "111222333") {
  return {
    status: () => ({ enabled: true, durable: true }),
    readGuild: async () => ({ swgohAllyCode }),
  };
}

test("Discord player claim verification uses the durable guild binding and returns matched live member evidence", async () => {
  const calls = [];
  const result = await verifyDiscordGuildPlayerClaim({
    discordGuildId: "987654321098765432",
    claimedAllyCode: "444-555-666",
    fallbackGuildAllyCode: "999888777",
    stateStore: durableStateStore(),
    rosterService: rosterService({
      source: "live",
      guild: { id: "guild-1", name: "Verified Guild" },
      members: [
        {
          playerId: "player-1",
          allyCode: "444555666",
          name: "Verified Player",
          rosterAvailable: true,
        },
      ],
    }, calls),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].allyCode, "111222333");
  assert.equal(calls[0].options.staleWhileRevalidate, false);
  assert.deepEqual(result, {
    verified: true,
    discordGuildId: "987654321098765432",
    claimedAllyCode: "444555666",
    guildBindingAllyCode: "111222333",
    guildBindingSource: "durable-guild-binding",
    guildId: "guild-1",
    guildName: "Verified Guild",
    playerId: "player-1",
    playerName: "Verified Player",
    rosterAvailable: true,
    rosterCache: "fresh",
    rosterAgeMs: 1234,
  });
});

test("Discord player claim verification rejects an Ally Code that is not in the bound live guild", async () => {
  await assert.rejects(
    verifyDiscordGuildPlayerClaim({
      discordGuildId: "987654321098765432",
      claimedAllyCode: "444555666",
      fallbackGuildAllyCode: "999888777",
      stateStore: durableStateStore(),
      rosterService: rosterService({
        source: "live",
        guild: { id: "guild-1", name: "Verified Guild" },
        members: [{ allyCode: "777888999", name: "Someone Else" }],
      }),
    }),
    (error) => error?.code === "PLAYER_NOT_IN_BOUND_GUILD" && /not present/.test(error.message),
  );
});

test("Discord player claim verification can use the pilot fallback before durable guild setup exists", async () => {
  const calls = [];
  const result = await verifyDiscordGuildPlayerClaim({
    discordGuildId: "987654321098765432",
    claimedAllyCode: "444555666",
    fallbackGuildAllyCode: "999888777",
    stateStore: {
      status: () => ({ enabled: false, durable: false }),
      readGuild: async () => {
        throw new Error("disabled state must not be read");
      },
    },
    rosterService: rosterService({
      source: "live",
      guild: { id: "guild-1", name: "Pilot Guild" },
      members: [{ allyCode: "444555666", name: "Pilot Player" }],
    }, calls),
  });

  assert.equal(calls[0].allyCode, "999888777");
  assert.equal(result.guildBindingSource, "explicit-fallback");
  assert.equal(result.playerName, "Pilot Player");
});

test("Discord player claim verification inherits fail-closed durable binding reads", async () => {
  let rosterRead = false;
  await assert.rejects(
    verifyDiscordGuildPlayerClaim({
      discordGuildId: "987654321098765432",
      claimedAllyCode: "444555666",
      fallbackGuildAllyCode: "999888777",
      stateStore: {
        status: () => ({ enabled: true, durable: true }),
        readGuild: async () => {
          throw new Error("volume failure");
        },
      },
      rosterService: {
        async getGuildRoster() {
          rosterRead = true;
          throw new Error("must not reach roster lookup");
        },
      },
    }),
    (error) => error?.code === "DISCORD_GUILD_BINDING_READ_FAILED",
  );
  assert.equal(rosterRead, false);
});

test("Discord player claim verification rejects malformed IDs before any live work", async () => {
  await assert.rejects(
    verifyDiscordGuildPlayerClaim({
      discordGuildId: "not-a-guild",
      claimedAllyCode: "444555666",
      fallbackGuildAllyCode: "999888777",
      stateStore: durableStateStore(),
      rosterService: rosterService({ members: [] }),
    }),
    (error) => error?.code === "INVALID_DISCORD_SNOWFLAKE",
  );

  await assert.rejects(
    verifyDiscordGuildPlayerClaim({
      discordGuildId: "987654321098765432",
      claimedAllyCode: "1234",
      fallbackGuildAllyCode: "999888777",
      stateStore: durableStateStore(),
      rosterService: rosterService({ members: [] }),
    }),
    (error) => error?.code === "INVALID_ALLY_CODE",
  );
});
