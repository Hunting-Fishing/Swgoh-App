import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
async function text(path) { return readFile(new URL(path, root), "utf8"); }
function unconfiguredEnv({ interactionsEnabled = false } = {}) {
  return {
    ...process.env,
    DISCORD_APPLICATION_ID: "",
    DISCORD_BOT_TOKEN: "",
    DISCORD_DEFAULT_GUILD_ID: "",
    DISCORD_PUBLIC_KEY: "",
    DISCORD_TB_INTERACTIONS_ENABLED: interactionsEnabled ? "true" : "false",
  };
}

test("production start registers the current pilot Discord schema before serving HTTP", async () => {
  const pkg = JSON.parse(await text("package.json"));
  const start = String(pkg?.scripts?.start || "");
  const registration = "node scripts/register-discord-tb-commands.mjs --if-configured";
  assert.match(start, /sync-game-unit-catalog-db\.mjs --if-configured --soft-fail/);
  assert.ok(start.includes(registration), "startup Discord schema registration missing");
  assert.ok(start.indexOf(registration) < start.indexOf("node server.mjs"), "Discord schema must register before server startup");
});

test("startup-safe registration skips cleanly only when Discord interactions are disabled", () => {
  const result = spawnSync(process.execPath, ["scripts/register-discord-tb-commands.mjs", "--if-configured"], {
    cwd: new URL("../", import.meta.url), env: unconfiguredEnv({ interactionsEnabled: false }), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping Discord schema registration because Discord interactions are disabled/);
});

test("active Discord pilot fails startup when command registration credentials are incomplete", () => {
  const result = spawnSync(process.execPath, ["scripts/register-discord-tb-commands.mjs", "--if-configured"], {
    cwd: new URL("../", import.meta.url), env: unconfiguredEnv({ interactionsEnabled: true }), encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Discord command registration requires/);
});

test("manual registration still fails closed when credentials are absent", () => {
  const result = spawnSync(process.execPath, ["scripts/register-discord-tb-commands.mjs"], {
    cwd: new URL("../", import.meta.url), env: unconfiguredEnv({ interactionsEnabled: false }), encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Discord command registration requires/);
});

test("startup schema contains TB self-service, Stage 9 immutable approval controls, safe Guild unbind and receipts", async () => {
  const source = await text("scripts/register-discord-tb-commands.mjs");
  const receiptSource = await text("discord-command-registration-receipt.mjs");
  assert.match(source, /SCHEMA_VERSION = DISCORD_TB_COMMAND_SCHEMA_VERSION/);
  assert.match(receiptSource, /DISCORD_TB_COMMAND_SCHEMA_VERSION = "2026-08-19-stage9-immutable-plan-v1"/);
  assert.match(source, /REGISTRATION_TIMEOUT_MS = 15_000/);
  assert.match(source, /name: "activity"/);
  assert.match(source, /name: "controls"/);
  assert.match(source, /name: "reserve"/);
  assert.match(source, /name: "reserves"/);
  assert.match(source, /absolute ROTE Operation donor reservation/);
  assert.match(source, /name: "unit"[\s\S]*autocomplete: true/);
  assert.match(source, /name: "ignore"[\s\S]*Self-service timed Operations ignore/);
  assert.match(source, /name: "plan-preview"/);
  assert.match(source, /name: "plan-status"/);
  assert.match(source, /name: "plan-approve"[\s\S]*Full 64-character SHA-256 plan hash/);
  assert.match(source, /name: "plan-cancel"/);
  assert.match(source, /name: "plan-diff"/);
  assert.doesNotMatch(source, /name: "plan-publish"/);
  assert.match(source, /name: "guild"/);
  assert.match(source, /name: "verify-channel"/);
  assert.match(source, /name: "unverify-channel"/);
  assert.match(source, /name: "register-mates"/);
  assert.match(source, /name: "donation-report"/);
  assert.match(source, /name: "unregister"[\s\S]*UNREGISTER GUILD INTEGRATION/);
  assert.match(source, /name: "platoon-report"/);
  assert.match(source, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
  assert.match(source, /retryableStatus\(response\.status\)/);
  assert.match(source, /signal: AbortSignal\.timeout\(REGISTRATION_TIMEOUT_MS\)/);
  assert.match(source, /writeDiscordCommandRegistrationReceipt/);
  assert.match(source, /writePublicDiscordCommandRegistrationReceipt/);
  assert.match(receiptSource, /PUBLIC_RECEIPT_PATH = "\/data\/discord-command-registration\.json"/);
  assert.match(source, /if \(ifConfigured && !config\.interactionsEnabled\)/);

  const tbStart = source.indexOf('name: "tb"');
  const guildStart = source.indexOf('name: "guild"');
  const tbBlock = source.slice(tbStart, guildStart);
  const subcommands = [...tbBlock.matchAll(/type: 1,\s*name: "([a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.equal(subcommands.length, 24);
  assert.ok(subcommands.length <= 25);
});
