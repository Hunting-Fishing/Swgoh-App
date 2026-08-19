import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  runOptionalPreflights,
  startProduction,
  startupPreflightCommands,
  strictStartupPreflights,
} from "../scripts/start-production.mjs";

function result(name, ok) {
  return Object.freeze({
    name,
    ok,
    code: ok ? 0 : 1,
    signal: null,
    timedOut: false,
    durationMs: 1,
    ...(ok ? {} : { error: "synthetic preflight failure" }),
  });
}

test("production preflights isolate catalog and Discord startup work in soft-fail child processes", () => {
  const commands = startupPreflightCommands({ SWGOH_STARTUP_PREFLIGHT_TIMEOUT_MS: "12345" });
  assert.deepEqual(commands.map((command) => command.name), [
    "game-catalog-db-sync",
    "discord-base-schema",
    "discord-stage9-schema",
    "discord-stage10-schema",
  ]);
  for (const command of commands) {
    assert.equal(command.timeoutMs, 12345);
    assert.equal(command.args.includes("--if-configured"), true);
    assert.equal(command.args.includes("--soft-fail"), true);
  }
});

test("optional preflight failures are reported as degraded without throwing", async () => {
  const commands = [
    { name: "catalog", args: [] },
    { name: "discord", args: [] },
  ];
  const summary = await runOptionalPreflights(commands, {
    runner: async (command) => result(command.name, command.name === "catalog"),
  });
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.degraded, ["discord"]);
  assert.equal(summary.results.length, 2);
});

test("normal production mode establishes web startup before optional preflights", async () => {
  const order = [];
  const summary = await startProduction({
    env: {},
    commands: [{ name: "catalog", args: [] }],
    runner: async () => {
      order.push("preflight");
      return result("catalog", false);
    },
    importServer: async () => { order.push("server"); },
  });
  assert.deepEqual(order, ["server", "preflight"]);
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.degraded, ["catalog"]);
});

test("explicit strict startup mode runs preflights first and blocks server import on failure", async () => {
  const order = [];
  await assert.rejects(
    startProduction({
      env: { SWGOH_STRICT_STARTUP_PREFLIGHTS: "true" },
      commands: [{ name: "discord-stage10-schema", args: [] }],
      runner: async () => {
        order.push("preflight");
        return result("discord-stage10-schema", false);
      },
      importServer: async () => { order.push("server"); },
    }),
    (error) => error?.code === "STARTUP_PREFLIGHT_FAILED",
  );
  assert.deepEqual(order, ["preflight"]);
  assert.equal(strictStartupPreflights({ SWGOH_STRICT_STARTUP_PREFLIGHTS: "1" }), true);
});

test("strict mode imports the web server only after all preflights pass", async () => {
  const order = [];
  const summary = await startProduction({
    env: { SWGOH_STRICT_STARTUP_PREFLIGHTS: "yes" },
    commands: [{ name: "catalog", args: [] }],
    runner: async () => {
      order.push("preflight");
      return result("catalog", true);
    },
    importServer: async () => { order.push("server"); },
  });
  assert.deepEqual(order, ["preflight", "server"]);
  assert.equal(summary.ok, true);
});

test("npm start has one stable production entrypoint instead of an && preflight chain", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.start, "node scripts/start-production.mjs");
  assert.equal(packageJson.scripts.start.includes("&&"), false);
});
