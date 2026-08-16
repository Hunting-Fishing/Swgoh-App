import test from "node:test";
import assert from "node:assert/strict";
import {
  discordTbConfig,
  executeDiscordTbDeferredCommand,
  handleDiscordTbCommand,
} from "../discord-tb.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const targetId = "222222222222222222";

function config() {
  return discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: guildId,
  });
}

function durableState(guild = null) {
  return {
    status: () => ({ enabled: true, durable: true, reason: "ready" }),
    readGuild: async () => guild,
  };
}

function interaction(name, options = []) {
  return {
    guild_id: guildId,
    member: { user: { id: actorId } },
    data: {
      name: "tb",
      options: [{ type: 1, name, ...(options.length ? { options } : {}) }],
    },
  };
}

test("/tb preference and /tb preferences use deferred ephemeral transport with no bootstrap Ally Code", () => {
  const set = interaction("preference", [
    { type: 6, name: "member", value: targetId },
    { type: 3, name: "unit", value: "jediknightcal" },
    { type: 3, name: "preference", value: "keep" },
  ]);
  const list = interaction("preferences", [{ type: 6, name: "member", value: targetId }]);
  assert.equal(handleDiscordTbCommand(set, config()).type, 5);
  assert.equal(handleDiscordTbCommand(list, config()).type, 5);
});

test("/tb preference routes normalized inputs through verified durable preference transaction", async () => {
  const stateStore = durableState();
  let captured;
  const content = await executeDiscordTbDeferredCommand(
    interaction("preference", [
      { type: 6, name: "member", value: targetId },
      { type: 3, name: "unit", value: "jediknightcal" },
      { type: 3, name: "preference", value: "KEEP" },
    ]),
    config(),
    {
      stateStore,
      setDiscordDonationPreference: async (args) => {
        captured = args;
        return {
          discordGuildId: guildId,
          discordUserId: targetId,
          baseId: "JEDIKNIGHTCAL",
          preference: "keep",
          verification: {
            mode: "live-bound-guild-ownership",
            playerName: "Linked Player",
            unitName: "Jedi Knight Cal Kestis",
          },
        };
      },
    },
  );

  assert.equal(captured.discordGuildId, guildId);
  assert.equal(captured.discordUserId, targetId);
  assert.equal(captured.unitBaseId, "JEDIKNIGHTCAL");
  assert.equal(captured.donationPreference, "keep");
  assert.equal(captured.actorDiscordUserId, actorId);
  assert.equal(captured.fallbackGuildAllyCode, "");
  assert.equal(captured.stateStore, stateStore);
  assert.match(content, /Donation Preference Saved/);
  assert.match(content, /Jedi Knight Cal Kestis/);
  assert.match(content, /KEEP/);
  assert.match(content, /end of the donor order/);
  assert.match(content, /No assignments were published/);
});

test("/tb preference DEFAULT reports a durable override clear", async () => {
  const content = await executeDiscordTbDeferredCommand(
    interaction("preference", [
      { type: 6, name: "member", value: targetId },
      { type: 3, name: "unit", value: "JEDIKNIGHTCAL" },
      { type: 3, name: "preference", value: "default" },
    ]),
    config(),
    {
      stateStore: durableState(),
      setDiscordDonationPreference: async () => ({
        discordGuildId: guildId,
        discordUserId: targetId,
        baseId: "JEDIKNIGHTCAL",
        preference: "default",
        verification: { mode: "durable-clear", unitName: "JEDIKNIGHTCAL" },
      }),
    },
  );
  assert.match(content, /Donation Preference Cleared/);
  assert.match(content, /normal mission-safety ranking applies/);
});

test("/tb preferences lists durable GIVE/KEEP controls without ping delivery", async () => {
  const content = await executeDiscordTbDeferredCommand(
    interaction("preferences"),
    config(),
    {
      stateStore: durableState({
        discordGuildId: guildId,
        memberPreferences: {
          one: { discordUserId: targetId, baseId: "JEDIKNIGHTCAL", preference: "keep" },
          two: { discordUserId: "333333333333333333", baseId: "DARTHVADER", preference: "give" },
        },
      }),
    },
  );
  assert.match(content, /Donation Preferences/);
  assert.match(content, /Active GIVE\/KEEP overrides: \*\*2\*\*/);
  assert.match(content, /JEDIKNIGHTCAL.*KEEP/);
  assert.match(content, /DARTHVADER.*GIVE/);
  assert.match(content, /Mentions are suppressed/);
});

test("/tb preference rejects malformed Base IDs before transaction execution", async () => {
  let calls = 0;
  await assert.rejects(
    executeDiscordTbDeferredCommand(
      interaction("preference", [
        { type: 6, name: "member", value: targetId },
        { type: 3, name: "unit", value: "bad unit spaces" },
        { type: 3, name: "preference", value: "keep" },
      ]),
      config(),
      {
        stateStore: durableState(),
        setDiscordDonationPreference: async () => { calls += 1; },
      },
    ),
    /valid SWGOH unit Base ID/,
  );
  assert.equal(calls, 0);
});
