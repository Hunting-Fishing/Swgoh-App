import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiscordStateStore } from "../discord-state-store.mjs";

async function tempDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-discord-state-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function deterministicOptions() {
  let sequence = 0;
  return {
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  };
}

test("durable Discord state stays disabled when no persistent storage is configured", async () => {
  const store = createDiscordStateStore({}, deterministicOptions());
  assert.deepEqual(store.status().enabled, false);
  assert.equal(store.status().durable, false);
  assert.equal(store.status().mode, "disabled");
  assert.equal(store.status().reason, "durable-storage-not-configured");
  await assert.rejects(() => store.readState(), /Durable Discord state is disabled/);
});

test("a Railway volume automatically enables atomic durable Discord state inside the mount", async (t) => {
  const mount = await tempDirectory(t);
  const store = createDiscordStateStore({ RAILWAY_VOLUME_MOUNT_PATH: mount }, deterministicOptions());
  const status = store.status();
  assert.equal(status.enabled, true);
  assert.equal(status.durable, true);
  assert.equal(status.mode, "atomic-json-volume");
  assert.equal(status.source, "RAILWAY_VOLUME_MOUNT_PATH");

  const guild = await store.upsertGuildConnection({
    discordGuildId: "987654321098765432",
    swgohAllyCode: "123-456-789",
    commandChannelId: "222222222222222222",
    actorDiscordUserId: "111111111111111111",
  });
  assert.equal(guild.swgohAllyCode, "123456789");
  assert.equal(guild.commandChannelId, "222222222222222222");

  const persisted = await store.readState();
  assert.equal(persisted.guilds["987654321098765432"].swgohAllyCode, "123456789");
  assert.equal(persisted.audit.length, 1);
  assert.equal(persisted.audit[0].action, "guild-connection-upserted");

  const disk = JSON.parse(await readFile(path.join(mount, "swgoh-command-center", "discord-state-v1.json"), "utf8"));
  assert.equal(disk.schemaVersion, 1);
  assert.equal(disk.audit.length, 1);
});

test("an arbitrary explicit directory is rejected unless durable storage is positively confirmed", async (t) => {
  const directory = await tempDirectory(t);
  const rejected = createDiscordStateStore({ SWGOH_STATE_DIR: directory }, deterministicOptions());
  assert.equal(rejected.status().enabled, false);
  assert.equal(rejected.status().reason, "state-directory-not-confirmed-durable");

  const confirmed = createDiscordStateStore({
    SWGOH_STATE_DIR: directory,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  }, deterministicOptions());
  assert.equal(confirmed.status().enabled, true);
  assert.equal(confirmed.status().durable, true);
  assert.equal(confirmed.status().source, "SWGOH_STATE_DIR");
});

test("explicit state directories under the Railway volume are recognized as durable without an override", async (t) => {
  const mount = await tempDirectory(t);
  const directory = path.join(mount, "command-center-state");
  const store = createDiscordStateStore({
    RAILWAY_VOLUME_MOUNT_PATH: mount,
    SWGOH_STATE_DIR: directory,
  }, deterministicOptions());
  assert.equal(store.status().enabled, true);
  assert.equal(store.status().durable, true);
  assert.equal(store.status().source, "SWGOH_STATE_DIR");
});

test("guild connection, officer roles, player links, plan versions, and audit survive subsequent reads", async (t) => {
  const directory = await tempDirectory(t);
  const store = createDiscordStateStore({
    SWGOH_STATE_DIR: directory,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
    SWGOH_STATE_MAX_PLAN_VERSIONS: "2",
  }, deterministicOptions());
  const guildId = "987654321098765432";
  const actorId = "111111111111111111";

  await store.upsertGuildConnection({ discordGuildId: guildId, swgohAllyCode: "123456789", actorDiscordUserId: actorId });
  await Promise.all([
    store.setOfficerRoleIds({
      discordGuildId: guildId,
      roleIds: ["333333333333333333", "222222222222222222", "333333333333333333"],
      actorDiscordUserId: actorId,
    }),
    store.linkPlayer({
      discordGuildId: guildId,
      discordUserId: "444444444444444444",
      swgohAllyCode: "987654321",
      playerId: "player-4",
      actorDiscordUserId: actorId,
    }),
  ]);
  await store.savePlanVersion({ discordGuildId: guildId, rotePhase: "P1", versionId: "plan-1", summary: { assigned: 10 }, actorDiscordUserId: actorId });
  await store.savePlanVersion({ discordGuildId: guildId, rotePhase: "P2", versionId: "plan-2", summary: { assigned: 20 }, actorDiscordUserId: actorId });
  await store.savePlanVersion({ discordGuildId: guildId, rotePhase: "P3", versionId: "plan-3", summary: { assigned: 30 }, actorDiscordUserId: actorId });

  const guild = await store.readGuild(guildId);
  assert.deepEqual(guild.officerRoleIds, ["222222222222222222", "333333333333333333"]);
  assert.equal(guild.userLinks["444444444444444444"].swgohAllyCode, "987654321");
  assert.deepEqual(guild.planVersions.map((row) => row.versionId), ["plan-2", "plan-3"]);

  const state = await store.readState();
  assert.equal(state.audit.length, 6);
  assert.deepEqual(state.audit.map((row) => row.action), [
    "guild-connection-upserted",
    "officer-roles-updated",
    "player-linked",
    "plan-version-saved",
    "plan-version-saved",
    "plan-version-saved",
  ]);
});

test("state helpers reject malformed identifiers before a durable mutation", async (t) => {
  const directory = await tempDirectory(t);
  const store = createDiscordStateStore({
    SWGOH_STATE_DIR: directory,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  }, deterministicOptions());

  await assert.rejects(() => store.upsertGuildConnection({ discordGuildId: "bad", swgohAllyCode: "123456789" }), /Discord guild ID/);
  await assert.rejects(() => store.upsertGuildConnection({ discordGuildId: "987654321098765432", swgohAllyCode: "123" }), /exactly 9 digits/);
  await assert.rejects(() => store.setOfficerRoleIds({ discordGuildId: "987654321098765432", roleIds: ["bad-role"] }), /officer role ID/);
  await assert.rejects(() => store.savePlanVersion({ discordGuildId: "987654321098765432", rotePhase: "P9" }), /P1 through P6/);

  const state = await store.readState();
  assert.equal(state.audit.length, 0);
  assert.deepEqual(state.guilds, {});
});
