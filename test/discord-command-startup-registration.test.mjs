import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

function unconfiguredEnv() {
  return {
    ...process.env,
    DISCORD_APPLICATION_ID: "",
    DISCORD_BOT_TOKEN: "",
    DISCORD_DEFAULT_GUILD_ID: "",
    DISCORD_PUBLIC_KEY: "",
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

test("startup-safe registration skips cleanly when Discord command credentials are absent", () => {
  const result = spawnSync(process.execPath, ["scripts/register-discord-tb-commands.mjs", "--if-configured"], {
    cwd: new URL("../", import.meta.url),
    env: unconfiguredEnv(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping Discord TB schema registration/);
});

test("manual registration still fails closed when credentials are absent", () => {
  const result = spawnSync(process.execPath, ["scripts/register-discord-tb-commands.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: unconfiguredEnv(),
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Discord command registration requires/);
});

test("startup-registered schema contains Stage 7 command additions and autocomplete", async () => {
  const source = await text("scripts/register-discord-tb-commands.mjs");
  assert.match(source, /SCHEMA_VERSION = "2026-08-18-stage7-controls-v1"/);
  assert.match(source, /name: "activity"/);
  assert.match(source, /name: "controls"/);
  assert.match(source, /name: "unit"[\s\S]*autocomplete: true/);
  assert.match(source, /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
  assert.match(source, /retryableStatus\(response\.status\)/);
});
