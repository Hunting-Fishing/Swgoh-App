import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiscordStateStore } from "../discord-state-store.mjs";
import { linkDiscordGuildPlayer, unlinkDiscordGuildPlayer } from "../discord-player-link-service.mjs";

async function durableStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-discord-link-service-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let sequence = 0;
  return createDiscordStateStore({
    SWGOH_STATE_DIR: directory,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  }, {
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  });
}

const guildId = "987654321098765432";
const actorId = "111111111111111111";
const targetId = "222222222222222222";

function liveRosterService(members) {
  return {
    async getGuildRoster(allyCode, options) {
      assert.equal(allyCode, "123456789");
      assert.equal(options.staleWhileRevalidate, false);
      return {
        value: {
          source: "live",
          guild: { id: "guild-live", name: "Command Guild" },
          members,
        },
        cache: "fresh",
        ageMs: 250,
      };
    },
  };
}

test("verified link transaction checks bound live guild membership before persisting", async (t) => {
  const store = await durableStore(t);
  await store.bootstrapGuild({
    discordGuildId: guildId,
    swgohAllyCode: "123456789",
    actorDiscordUserId: actorId,
  });

  const result = await linkDiscordGuildPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    claimedAllyCode: "444-555-666",
    actorDiscordUserId: actorId,
    fallbackGuildAllyCode: "999888777",
    stateStore: store,
    rosterService: liveRosterService([{
      playerId: "player-444",
      allyCode: "444555666",
      name: "Target Player",
      rosterAvailable: true,
    }]),
  });

  assert.equal(result.verifiedGuildMembership, true);
  assert.equal(result.verification.guildBindingSource, "durable-guild-binding");
  assert.equal(result.verification.playerName, "Target Player");
  assert.equal(result.link.discordUserId, targetId);
  assert.equal(result.link.swgohAllyCode, "444555666");
  assert.equal(result.link.playerId, "player-444");

  const state = await store.readState();
  assert.equal(state.guilds[guildId].userLinks[targetId].swgohAllyCode, "444555666");
  assert.deepEqual(state.audit.map((row) => row.action), ["guild-bootstrap-updated", "player-linked"]);
  assert.equal(state.audit[1].actorDiscordUserId, actorId);
});

test("out-of-guild claim is rejected without persisting a player link", async (t) => {
  const store = await durableStore(t);
  await store.bootstrapGuild({
    discordGuildId: guildId,
    swgohAllyCode: "123456789",
    actorDiscordUserId: actorId,
  });

  await assert.rejects(
    linkDiscordGuildPlayer({
      discordGuildId: guildId,
      discordUserId: targetId,
      claimedAllyCode: "444555666",
      actorDiscordUserId: actorId,
      stateStore: store,
      rosterService: liveRosterService([{ allyCode: "777888999", name: "Other Player" }]),
    }),
    (error) => error?.code === "PLAYER_NOT_IN_BOUND_GUILD",
  );

  const state = await store.readState();
  assert.equal(state.guilds[guildId].userLinks[targetId], undefined);
  assert.deepEqual(state.audit.map((row) => row.action), ["guild-bootstrap-updated"]);
});

test("link transaction refuses non-durable storage before live verification", async () => {
  let rosterRead = false;
  await assert.rejects(
    linkDiscordGuildPlayer({
      discordGuildId: guildId,
      discordUserId: targetId,
      claimedAllyCode: "444555666",
      actorDiscordUserId: actorId,
      stateStore: {
        status: () => ({ enabled: false, durable: false, reason: "no-volume" }),
      },
      rosterService: {
        async getGuildRoster() {
          rosterRead = true;
          return { value: { members: [] } };
        },
      },
    }),
    (error) => error?.code === "DISCORD_STATE_NOT_DURABLE",
  );
  assert.equal(rosterRead, false);
});

test("unlink transaction removes the persisted link through the audited state API", async (t) => {
  const store = await durableStore(t);
  await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    swgohAllyCode: "444555666",
    playerId: "player-444",
    actorDiscordUserId: actorId,
  });

  const result = await unlinkDiscordGuildPlayer({
    discordGuildId: guildId,
    discordUserId: targetId,
    actorDiscordUserId: actorId,
    stateStore: store,
  });

  assert.equal(result.unlinked, true);
  assert.equal(result.removed.swgohAllyCode, "444555666");
  const state = await store.readState();
  assert.equal(state.guilds[guildId].userLinks[targetId], undefined);
  assert.deepEqual(state.audit.map((row) => row.action), ["player-linked", "player-unlinked"]);
});
