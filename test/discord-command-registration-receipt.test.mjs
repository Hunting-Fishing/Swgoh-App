import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DISCORD_TB_COMMAND_SCHEMA_VERSION,
  discordCommandRegistrationStatus,
  readDiscordCommandRegistrationReceipt,
  writeDiscordCommandRegistrationReceipt,
  writePublicDiscordCommandRegistrationReceipt,
} from "../discord-command-registration-receipt.mjs";

const guildId = "1422643338586099745";
const applicationId = "123456789012345678";
const commands = [{ id: "1538621439698272296", name: "tb", version: "1" }];

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "swgoh-discord-receipt-"));
}

test("registration receipt persists to confirmed durable state without secrets", async (t) => {
  const root = await tempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = {
    SWGOH_STATE_DIR: root,
    SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: "true",
  };
  const written = await writeDiscordCommandRegistrationReceipt({ guildId, applicationId, attempt: 2, commands }, env);
  assert.equal(written.written, true);
  assert.equal(written.durable, true);
  assert.equal(written.receipt.schemaVersion, DISCORD_TB_COMMAND_SCHEMA_VERSION);
  assert.equal(written.receipt.attempt, 2);

  const loaded = await readDiscordCommandRegistrationReceipt(env);
  assert.equal(loaded.guildId, guildId);
  assert.equal(loaded.applicationId, applicationId);
  assert.deepEqual(loaded.commands.map((row) => row.name), ["tb"]);
  assert.equal(JSON.stringify(loaded).includes("token"), false);

  const status = discordCommandRegistrationStatus(env);
  assert.equal(status.registered, true);
  assert.equal(status.receiptDurable, true);
  assert.equal(status.expectedSchemaVersion, DISCORD_TB_COMMAND_SCHEMA_VERSION);
  assert.deepEqual(status.commandNames, ["tb"]);
});

test("unconfirmed explicit state directory is not mislabeled durable", async (t) => {
  const root = await tempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { SWGOH_STATE_DIR: root };
  const written = await writeDiscordCommandRegistrationReceipt({ guildId, applicationId, commands }, env);
  assert.equal(written.written, true);
  assert.equal(written.durable, false);
  assert.equal(discordCommandRegistrationStatus(env).receiptDurable, false);
});

test("startup can publish a sanitized static registration receipt", async (t) => {
  const root = await tempDir();
  t.after(() => rm(root, { recursive: true, force: true }));
  const durable = await writeDiscordCommandRegistrationReceipt({ guildId, applicationId, commands }, {});
  assert.equal(durable.written, false);
  assert.ok(durable.receipt);

  const publicRoot = path.join(root, "public");
  const published = await writePublicDiscordCommandRegistrationReceipt(durable.receipt, { publicRoot });
  assert.equal(published.path, "/data/discord-command-registration.json");
  const body = JSON.parse(await readFile(path.join(publicRoot, "data", "discord-command-registration.json"), "utf8"));
  assert.equal(body.schemaVersion, DISCORD_TB_COMMAND_SCHEMA_VERSION);
  assert.equal(body.guildId, guildId);
  assert.deepEqual(body.commands.map((row) => row.name), ["tb"]);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "botToken"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "publicKey"), false);
});
