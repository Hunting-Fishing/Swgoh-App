import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiscordStateStore } from "../discord-state-store.mjs";

async function createStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-discord-link-state-"));
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
const firstUserId = "222222222222222222";
const secondUserId = "333333333333333333";

test("one SWGOH Ally Code cannot be linked to two Discord users in the same server", async (t) => {
  const store = await createStore(t);
  await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: firstUserId,
    swgohAllyCode: "444555666",
    playerId: "player-one",
    actorDiscordUserId: actorId,
  });

  await assert.rejects(
    store.linkPlayer({
      discordGuildId: guildId,
      discordUserId: secondUserId,
      swgohAllyCode: "444555666",
      playerId: "player-one",
      actorDiscordUserId: actorId,
    }),
    (error) => error?.code === "ALLY_CODE_ALREADY_LINKED" && /already linked/.test(error.message),
  );

  const state = await store.readState();
  assert.equal(Object.keys(state.guilds[guildId].userLinks).length, 1);
  assert.equal(state.guilds[guildId].userLinks[firstUserId].swgohAllyCode, "444555666");
  assert.equal(state.audit.length, 1);
  assert.equal(state.audit[0].action, "player-linked");
});

test("concurrent duplicate link attempts are serialized so exactly one can win", async (t) => {
  const store = await createStore(t);
  const results = await Promise.allSettled([
    store.linkPlayer({
      discordGuildId: guildId,
      discordUserId: firstUserId,
      swgohAllyCode: "444555666",
      actorDiscordUserId: actorId,
    }),
    store.linkPlayer({
      discordGuildId: guildId,
      discordUserId: secondUserId,
      swgohAllyCode: "444555666",
      actorDiscordUserId: actorId,
    }),
  ]);

  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(results.filter((row) => row.status === "rejected").length, 1);
  const rejected = results.find((row) => row.status === "rejected");
  assert.equal(rejected.reason.code, "ALLY_CODE_ALREADY_LINKED");

  const state = await store.readState();
  assert.equal(Object.keys(state.guilds[guildId].userLinks).length, 1);
  assert.equal(state.audit.filter((row) => row.action === "player-linked").length, 1);
});

test("a Discord user's existing link may be updated without tripping the uniqueness guard", async (t) => {
  const store = await createStore(t);
  const first = await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: firstUserId,
    swgohAllyCode: "444555666",
    playerId: "player-one",
    actorDiscordUserId: actorId,
  });
  const updated = await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: firstUserId,
    swgohAllyCode: "777888999",
    playerId: "player-two",
    actorDiscordUserId: actorId,
  });

  assert.equal(updated.swgohAllyCode, "777888999");
  assert.equal(updated.playerId, "player-two");
  assert.equal(updated.linkedAt, first.linkedAt);
  const state = await store.readState();
  assert.equal(state.audit.filter((row) => row.action === "player-linked").length, 2);
});

test("unlink removes the identity mapping and records an explicit audit event", async (t) => {
  const store = await createStore(t);
  await store.linkPlayer({
    discordGuildId: guildId,
    discordUserId: firstUserId,
    swgohAllyCode: "444555666",
    playerId: "player-one",
    actorDiscordUserId: actorId,
  });

  const removed = await store.unlinkPlayer({
    discordGuildId: guildId,
    discordUserId: firstUserId,
    actorDiscordUserId: actorId,
  });
  assert.equal(removed.swgohAllyCode, "444555666");

  const state = await store.readState();
  assert.equal(state.guilds[guildId].userLinks[firstUserId], undefined);
  assert.deepEqual(state.audit.map((row) => row.action), ["player-linked", "player-unlinked"]);
  assert.equal(state.audit[1].details.discordUserId, firstUserId);
});

test("unlinking a missing player link fails without writing an audit event", async (t) => {
  const store = await createStore(t);
  await assert.rejects(
    store.unlinkPlayer({
      discordGuildId: guildId,
      discordUserId: firstUserId,
      actorDiscordUserId: actorId,
    }),
    (error) => error?.code === "PLAYER_LINK_NOT_FOUND",
  );

  const state = await store.readState();
  assert.equal(state.audit.length, 0);
});
