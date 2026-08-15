import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  { name: "validate battle strategy", args: ["scripts/validate-battle-strategy.mjs"], blocking: true },
  { name: "refresh catalog", args: ["scripts/sync-gamedata.mjs", "--allow-stale"] },
  { name: "repair catalog", args: ["scripts/repair-catalog.mjs", "--allow-stale"] },
  { name: "build kit index", args: ["scripts/enrich-kit-intelligence.mjs"] },
  { name: "build raw + enemy combat indexes", args: ["scripts/sync-raw-combat-data.mjs", "--allow-stale"], optional: true },
  { name: "build interaction indexes", args: ["scripts/build-interaction-index.mjs"], optional: true },
];

const results = [];
for (const step of steps) {
  console.log(`[production-data] ${step.name}…`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  const ok = result.status === 0;
  results.push({ name: step.name, ok, status: result.status, optional: Boolean(step.optional), blocking: Boolean(step.blocking) });
  if (!ok) {
    const consequence = step.blocking
      ? "local code validation failed; deployment must stop"
      : step.optional
        ? "optional enrichment will be omitted"
        : "committed static data will remain the fallback";
    console.warn(`[production-data] ${step.name} failed with exit ${result.status ?? "unknown"}; ${consequence}.`);
  }
}

const succeeded = results.filter((result) => result.ok).length;
const failed = results.filter((result) => !result.ok);
const blockingFailures = failed.filter((result) => result.blocking);
console.log(`[production-data] completed ${succeeded}/${results.length} build steps.`);
if (failed.length) console.warn(`[production-data] failed steps: ${failed.map((result) => result.name).join(", ")}`);

// External static intelligence is an enrichment layer and remains fail-soft.
// Local strategy/schema regressions are under our control and must block deployment.
process.exitCode = blockingFailures.length ? 1 : 0;
