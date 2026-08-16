import test from "node:test";
import assert from "node:assert/strict";
import {
  discordTbConfig,
  discordTbOption,
  executeDiscordTbDeferredCommand,
  handleDiscordTbCommand,
} from "../discord-tb.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const targetId = "222222222222222222";

function durableOnlyConfig() {
  return discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: guildId,
  });
}

function durableStateStore(guild = null) {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
    readGuild: async (requestedGuildId) => {
      assert.equal(requestedGuildId, guildId);
      return guild;
    },
  };
}

function identityInteraction(subcommand, options = []) {
  return {
    guild_id: guildId,
    member: { user: { id: actorId } },
    data: {
      name: "tb",
      options: [{ type: 1, name: subcommand, ...(options.length ? { options } : {}) }],
    },
  };
}

test("player identity slash commands defer even when the bootstrap fallback Ally Code is absent", () => {
  const config = durableOnlyConfig();
  const link = identityInteraction("link", [
    { type: 6, name: "member", value: targetId },
    { type: 3, name: "ally_code", value: "444-555-666" },
  ]);
  const unlink = identityInteraction("unlink", [
    { type: 6, name: "member", value: targetId },
  ]);
  const links = identityInteraction("links");

  assert.equal(handleDiscordTbCommand(link, config).type, 5);
  assert.equal(handleDiscordTbCommand(unlink, config).type, 5);
  assert.equal(handleDiscordTbCommand(links, config).type, 5);
  assert.equal(discordTbOption(link, "member"), targetId);
  assert.equal(discordTbOption(link, "ally_code"), "444-555-666");
});

test("/tb link routes an officer-approved claim through the verified durable transaction service", async () => {
  const config = durableOnlyConfig();
  const stateStore = durableStateStore();
  const interaction = identityInteraction("link", [
    { type: 6, name: "member", value: targetId },
    { type: 3, name: "ally_code", value: "444-555-666" },
  ]);
  let captured;

  const content = await executeDiscordTbDeferredCommand(interaction, config, {
    stateStore,
    linkDiscordGuildPlayer: async (args) => {
      captured = args;
      return {
        verifiedGuildMembership: true,
        link: {
          discordUserId: targetId,
          swgohAllyCode: "444555666",
          playerId: "player-444",
        },
        verification: {
          claimedAllyCode: "444555666",
          playerName: "Verified Player",
          guildName: "Command Guild",
          guildBindingSource: "durable-guild-binding",
        },
      };
    },
  });

  assert.equal(captured.discordGuildId, guildId);
  assert.equal(captured.discordUserId, targetId);
  assert.equal(captured.claimedAllyCode, "444555666");
  assert.equal(captured.actorDiscordUserId, actorId);
  assert.equal(captured.fallbackGuildAllyCode, "");
  assert.equal(captured.stateStore, stateStore);
  assert.match(content, /Player Link Saved/);
  assert.match(content, /Verified Player/);
  assert.match(content, /444-555-666/);
  assert.match(content, /durable-guild-binding/);
  assert.match(content, /does not enable DMs or assignment publishing yet/);
});

test("/tb unlink routes through the audited durable unlink transaction", async () => {
  const config = durableOnlyConfig();
  const stateStore = durableStateStore();
  const interaction = identityInteraction("unlink", [
    { type: 6, name: "member", value: targetId },
  ]);
  let captured;

  const content = await executeDiscordTbDeferredCommand(interaction, config, {
    stateStore,
    unlinkDiscordGuildPlayer: async (args) => {
      captured = args;
      return {
        unlinked: true,
        discordGuildId: guildId,
        discordUserId: targetId,
        removed: {
          discordUserId: targetId,
          swgohAllyCode: "444555666",
          playerId: "player-444",
        },
      };
    },
  });

  assert.deepEqual(captured, {
    discordGuildId: guildId,
    discordUserId: targetId,
    actorDiscordUserId: actorId,
    stateStore,
  });
  assert.match(content, /Player Link Removed/);
  assert.match(content, /444-555-666/);
  assert.match(content, /durable and audited/);
});

test("/tb links reads durable guild identity state and suppresses actual ping delivery", async () => {
  const config = durableOnlyConfig();
  const stateStore = durableStateStore({
    discordGuildId: guildId,
    userLinks: {
      [targetId]: {
        discordUserId: targetId,
        swgohAllyCode: "444555666",
        playerId: "player-444",
      },
      "333333333333333333": {
        discordUserId: "333333333333333333",
        swgohAllyCode: "777888999",
        playerId: "player-777",
      },
    },
  });

  const content = await executeDiscordTbDeferredCommand(identityInteraction("links"), config, { stateStore });
  assert.match(content, /Discord ↔ SWGOH Links/);
  assert.match(content, /Linked members: \*\*2\*\*/);
  assert.match(content, /444-555-666/);
  assert.match(content, /777-888-999/);
  assert.match(content, /Mentions are suppressed/);
});

test("player identity commands fail closed before writes when durable state is unavailable", async () => {
  const config = durableOnlyConfig();
  let transactionCalls = 0;
  const unavailableState = {
    status: () => ({ enabled: false, durable: false, reason: "durable-storage-not-configured" }),
  };

  await assert.rejects(
    executeDiscordTbDeferredCommand(
      identityInteraction("link", [
        { type: 6, name: "member", value: targetId },
        { type: 3, name: "ally_code", value: "444555666" },
      ]),
      config,
      {
        stateStore: unavailableState,
        linkDiscordGuildPlayer: async () => {
          transactionCalls += 1;
        },
      },
    ),
    /Attach a persistent Railway Volume/,
  );

  assert.equal(transactionCalls, 0);
});
