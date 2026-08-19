import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_PREFLIGHT_TIMEOUT_MS = 45_000;
const KILL_GRACE_MS = 2_000;

function clean(value) { return String(value ?? "").trim(); }
function positiveInteger(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function boolEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function startupPreflightCommands(env = process.env) {
  const timeoutMs = positiveInteger(env.SWGOH_STARTUP_PREFLIGHT_TIMEOUT_MS, DEFAULT_PREFLIGHT_TIMEOUT_MS);
  return Object.freeze([
    Object.freeze({
      name: "game-catalog-db-sync",
      args: Object.freeze(["scripts/sync-game-unit-catalog-db.mjs", "--if-configured", "--soft-fail"]),
      timeoutMs,
    }),
    Object.freeze({
      name: "discord-base-schema",
      args: Object.freeze(["scripts/register-discord-tb-commands.mjs", "--if-configured", "--soft-fail"]),
      timeoutMs,
    }),
    Object.freeze({
      name: "discord-stage9-schema",
      args: Object.freeze(["scripts/patch-discord-stage9-plan-commands.mjs", "--if-configured", "--soft-fail"]),
      timeoutMs,
    }),
    Object.freeze({
      name: "discord-stage10-schema",
      args: Object.freeze(["scripts/patch-discord-stage10-delivery-commands.mjs", "--if-configured", "--soft-fail"]),
      timeoutMs,
    }),
  ]);
}

function strictStartupPreflights(env = process.env) {
  return boolEnv(env.SWGOH_STRICT_STARTUP_PREFLIGHTS, false);
}

function runPreflight(command, options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const executable = options.executable || process.execPath;
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = positiveInteger(command?.timeoutMs, DEFAULT_PREFLIGHT_TIMEOUT_MS);

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer = null;
    const startedAt = Date.now();
    let child;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve(Object.freeze({
        name: clean(command?.name) || "preflight",
        durationMs: Math.max(0, Date.now() - startedAt),
        ...result,
      }));
    };

    try {
      child = spawnImpl(executable, [...(command?.args || [])], {
        cwd,
        env,
        stdio: "inherit",
      });
    } catch (error) {
      finish({ ok: false, code: null, signal: "spawn-error", timedOut: false, error: clean(error?.message || error) });
      return;
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      forceKillTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
        finish({ ok: false, code: null, signal: "timeout", timedOut: true, error: `Exceeded ${timeoutMs} ms startup preflight limit.` });
      }, KILL_GRACE_MS);
      forceKillTimer.unref?.();
    }, timeoutMs);
    timeoutTimer.unref?.();

    child.once("error", (error) => {
      finish({ ok: false, code: null, signal: "spawn-error", timedOut, error: clean(error?.message || error) });
    });
    child.once("exit", (code, signal) => {
      const ok = code === 0 && !timedOut;
      finish({
        ok,
        code: Number.isInteger(code) ? code : null,
        signal: signal || (timedOut ? "timeout" : null),
        timedOut,
        ...(ok ? {} : { error: timedOut ? `Exceeded ${timeoutMs} ms startup preflight limit.` : `Exited with code ${code ?? "unknown"}.` }),
      });
    });
  });
}

async function runOptionalPreflights(commands = startupPreflightCommands(), options = {}) {
  const runner = options.runner || runPreflight;
  const results = [];
  for (const command of commands) {
    let result;
    try {
      result = await runner(command, options);
    } catch (error) {
      result = Object.freeze({
        name: clean(command?.name) || "preflight",
        ok: false,
        code: null,
        signal: "runner-error",
        timedOut: false,
        durationMs: 0,
        error: clean(error?.message || error),
      });
    }
    results.push(result);
    if (result.ok) console.log(`[startup] ${result.name}: PASS (${result.durationMs} ms)`);
    else console.error(`[startup] ${result.name}: DEGRADED · ${result.error || "preflight failed"}`);
  }
  return Object.freeze({
    ok: results.every((result) => result.ok),
    degraded: Object.freeze(results.filter((result) => !result.ok).map((result) => result.name)),
    results: Object.freeze(results),
  });
}

async function startProduction(options = {}) {
  const env = options.env || process.env;
  const commands = options.commands || startupPreflightCommands(env);
  const summary = await runOptionalPreflights(commands, { ...options, env });
  if (!summary.ok) {
    console.error(`[startup] Optional preflights degraded: ${summary.degraded.join(", ")}.`);
    console.error("[startup] Web/API startup will continue. External Discord writes remain governed by their independent authorization, publishability, receipt, and delivery gates.");
    if (strictStartupPreflights(env)) {
      const error = new Error(`Strict startup preflights failed: ${summary.degraded.join(", ")}.`);
      error.code = "STARTUP_PREFLIGHT_FAILED";
      throw error;
    }
  }

  const importServer = options.importServer || (() => import("../server.mjs"));
  await importServer();
  return summary;
}

function isDirectExecution() {
  const entry = clean(process.argv[1]);
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectExecution()) {
  startProduction().catch((error) => {
    console.error(`[startup] web server failed: ${error?.stack || error?.message || error}`);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_PREFLIGHT_TIMEOUT_MS,
  boolEnv,
  positiveInteger,
  runOptionalPreflights,
  runPreflight,
  startProduction,
  startupPreflightCommands,
  strictStartupPreflights,
};
