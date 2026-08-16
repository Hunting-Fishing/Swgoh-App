import test from "node:test";
import assert from "node:assert/strict";
import {
  discordTbConfig,
  discordTbSelfServiceTargetAllowed,
  executeDiscordTbDeferredCommand,
  handleDiscordTbCommand,
} from "../discord-tb.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const otherId = "222222222222222222";

function config() {
  return discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: guildId,
  });
}

function interaction(options = []) {
  return {
    guild_id: guildId,
    member: { permissions: "0", roles: [], user: { id: actorId } },
    data: {
      name: "tb",
      options: [{ type: 1, name: "availability", ...(options.length ? { options } : {}) }],
    },
  };
}

function durableState(guild) {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
    readGuild: async (requestedGuildId) => {
      assert.equal(requestedGuildId, guildId);
      return guild;
    },
  };
}

function linkedGuild(availability = {}) {
  return {
    discordGuildId: guildId,
    userLinks: {
      [actorId]: { discordUserId: actorId, swgohAllyCode: "444555666", playerId: "player-self" },
      [otherId]: { discordUserId: otherId, swgohAllyCode: "777888999", playerId: "player-other" },
    },
    memberAvailability: availability,
  };
}

test("/tb availability is deferred and is a self-service command only for the caller target", () => {
  assert.equal(handleDiscordTbCommand(interaction(), config()).type, 5);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction()), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction([
    { type: 6, name: "member", value: actorId },
  ])), true);
  assert.equal(discordTbSelfServiceTargetAllowed(interaction([
    { type: 6, name: "member", value: otherId },
  ])), false);
});

test("/tb availability with no state reads the caller status without mutation", async () => {
  const content = await executeDiscordTbDeferredCommand(interaction(), config(), {
    authorizedAsOfficer: false,
    stateStore: durableState(linkedGuild({
      [actorId]: {
        discordUserId: actorId,
        memberId: "player-self",
        availability: "unavailable",
      },
    })),
    setDiscordMemberAvailability: async () => {
      throw new Error("read must not mutate");
    },
  });

  assert.match(content, /TB Availability/);
  assert.match(content, /UNAVAILABLE/);
  assert.match(content, /excluded from ROTE Operation donor candidates/);
  assert.match(content, /No guild state was changed/);
});

test("normal member can mark only their own linked player unavailable", async () => {
  let captured;
  const content = await executeDiscordTbDeferredCommand(interaction([
    { type: 3, name: "state", value: "unavailable" },
  ]), config(), {
    authorizedAsOfficer: false,
    stateStore: durableState(linkedGuild()),
    setDiscordMemberAvailability: async (args) => {
      captured = args;
      return {
        discordGuildId: guildId,
        discordUserId: actorId,
        availability: "unavailable",
        verification: {
          mode: "live-bound-guild-membership",
          playerName: "Self Player",
          guildName: "Command Guild",
        },
      };
    },
  });

  assert.equal(captured.discordGuildId, guildId);
  assert.equal(captured.discordUserId, actorId);
  assert.equal(captured.memberAvailability, "unavailable");
  assert.equal(captured.actorDiscordUserId, actorId);
  assert.match(content, /UNAVAILABLE/);
  assert.match(content, /Self Player/);
  assert.match(content, /removed from ROTE Operation donor candidates/);
});

test("normal member cannot read or change another linked member availability", async () => {
  await assert.rejects(
    executeDiscordTbDeferredCommand(interaction([
      { type: 6, name: "member", value: otherId },
    ]), config(), {
      authorizedAsOfficer: false,
      stateStore: durableState(linkedGuild()),
    }),
    /only for their own linked SWGOH player/,
  );

  await assert.rejects(
    executeDiscordTbDeferredCommand(interaction([
      { type: 6, name: "member", value: otherId },
      { type: 3, name: "state", value: "unavailable" },
    ]), config(), {
      authorizedAsOfficer: false,
      stateStore: durableState(linkedGuild()),
      setDiscordMemberAvailability: async () => {
        throw new Error("must not reach mutation");
      },
    }),
    /only for their own linked SWGOH player/,
  );
});

test("officer may target another linked member and AVAILABLE clears the exclusion", async () => {
  let captured;
  const content = await executeDiscordTbDeferredCommand(interaction([
    { type: 6, name: "member", value: otherId },
    { type: 3, name: "state", value: "available" },
  ]), config(), {
    authorizedAsOfficer: true,
    stateStore: durableState(linkedGuild({
      [otherId]: { discordUserId: otherId, memberId: "player-other", availability: "unavailable" },
    })),
    setDiscordMemberAvailability: async (args) => {
      captured = args;
      return {
        discordGuildId: guildId,
        discordUserId: otherId,
        availability: "available",
        verification: { mode: "durable-clear" },
      };
    },
  });

  assert.equal(captured.discordUserId, otherId);
  assert.equal(captured.memberAvailability, "available");
  assert.match(content, /AVAILABLE/);
  assert.match(content, /exclusion was cleared/);
});
