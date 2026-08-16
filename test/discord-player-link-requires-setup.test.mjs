import test from "node:test";
import assert from "node:assert/strict";
import { linkDiscordGuildPlayer } from "../discord-player-link-service.mjs";

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const targetId = "222222222222222222";

test("player-link writes require a durable /tb setup guild binding before live roster verification", async () => {
  let rosterRead = false;
  let linkWrite = false;
  await assert.rejects(
    linkDiscordGuildPlayer({
      discordGuildId: guildId,
      discordUserId: targetId,
      claimedAllyCode: "444555666",
      actorDiscordUserId: actorId,
      stateStore: {
        status: () => ({ enabled: true, durable: true, reason: "ready" }),
        readGuild: async () => ({ swgohAllyCode: "" }),
        async linkPlayer() {
          linkWrite = true;
        },
      },
      rosterService: {
        async getGuildRoster() {
          rosterRead = true;
          return { value: { members: [] } };
        },
      },
    }),
    (error) => error?.code === "DISCORD_GUILD_NOT_BOUND" && /\/tb setup/.test(error.message),
  );

  assert.equal(rosterRead, false);
  assert.equal(linkWrite, false);
});
