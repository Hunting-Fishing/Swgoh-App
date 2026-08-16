import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDiscordStateStore } from "../discord-state-store.mjs";

async function durableStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "swgoh-role-safety-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return createDiscordStateStore({
    SWGOH_STATE_DIR: directory,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  });
}

test("Discord @everyone cannot be selected during guild bootstrap", async (t) => {
  const store = await durableStore(t);
  const guildId = "987654321098765432";
  await assert.rejects(
    () => store.bootstrapGuild({
      discordGuildId: guildId,
      swgohAllyCode: "123456789",
      commandChannelId: "222222222222222222",
      officerRoleIds: [guildId],
      actorDiscordUserId: "111111111111111111",
    }),
    /@everyone role cannot be configured as an officer role/,
  );
  assert.equal((await store.readState()).audit.length, 0);
});

test("Discord @everyone cannot be introduced through the officer-role update API either", async (t) => {
  const store = await durableStore(t);
  const guildId = "987654321098765432";
  await store.bootstrapGuild({
    discordGuildId: guildId,
    swgohAllyCode: "123456789",
    commandChannelId: "222222222222222222",
    actorDiscordUserId: "111111111111111111",
  });
  await assert.rejects(
    () => store.setOfficerRoleIds({
      discordGuildId: guildId,
      roleIds: [guildId],
      actorDiscordUserId: "111111111111111111",
    }),
    /@everyone role cannot be configured as an officer role/,
  );
  assert.deepEqual((await store.readGuild(guildId)).officerRoleIds, []);
});
