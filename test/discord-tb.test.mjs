import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  discordTbConfig,
  discordTbPublicStatus,
  discordTbSubcommand,
  handleDiscordTbCommand,
  verifyDiscordInteraction,
} from "../discord-tb.mjs";

function testKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  return { publicKeyHex: der.subarray(-32).toString("hex"), privateKey };
}

test("Discord interaction verification accepts the exact signed timestamp+body and rejects mutations", () => {
  const { publicKeyHex, privateKey } = testKeys();
  const timestamp = "1786887600";
  const rawBody = Buffer.from(JSON.stringify({ type: 1 }), "utf8");
  const message = Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]);
  const signature = sign(null, message, privateKey).toString("hex");

  assert.equal(verifyDiscordInteraction({ publicKey: publicKeyHex, signature, timestamp, rawBody }), true);
  assert.equal(verifyDiscordInteraction({ publicKey: publicKeyHex, signature, timestamp, rawBody: Buffer.from('{"type":2}') }), false);
  assert.equal(verifyDiscordInteraction({ publicKey: publicKeyHex, signature: "00", timestamp, rawBody }), false);
});

test("Discord public status exposes configuration booleans but never secret values", () => {
  const env = {
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_TB_DELIVERY_ENABLED: "false",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_BOT_TOKEN: "super-secret-token",
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
  };
  const status = discordTbPublicStatus(env);
  const serialized = JSON.stringify(status);
  assert.equal(status.enabled, true);
  assert.equal(status.configured, true);
  assert.equal(status.botTokenConfigured, true);
  assert.equal(status.commandRegistrationConfigured, true);
  assert.equal(serialized.includes("super-secret-token"), false);
  assert.equal(serialized.includes("ab".repeat(32)), false);
});

test("invalid public key leaves the interaction configuration fail-closed", () => {
  const config = discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "not-a-key",
  });
  assert.equal(config.interactionsEnabled, true);
  assert.equal(config.configured, false);
  assert.equal(config.publicKey, "");
});

test("/tb status is ephemeral and pilot-guild restricted", () => {
  const config = discordTbConfig({
    DISCORD_TB_INTERACTIONS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_PUBLIC_KEY: "ab".repeat(32),
    DISCORD_DEFAULT_GUILD_ID: "987654321098765432",
  });
  const allowed = handleDiscordTbCommand({
    guild_id: "987654321098765432",
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  }, config);
  assert.equal(allowed.type, 4);
  assert.equal(allowed.data.flags, 64);
  assert.match(allowed.data.content, /SWGOH Roster Command · TB/);

  const denied = handleDiscordTbCommand({
    guild_id: "111111111111111111",
    data: { name: "tb", options: [{ type: 1, name: "status" }] },
  }, config);
  assert.match(denied.data.content, /restricted to the configured pilot Discord server/);
});

test("subcommand resolver defaults to status", () => {
  assert.equal(discordTbSubcommand({ data: { options: [{ type: 1, name: "assignments" }] } }), "assignments");
  assert.equal(discordTbSubcommand({ data: {} }), "status");
});
