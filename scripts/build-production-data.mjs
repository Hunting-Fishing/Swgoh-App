import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
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
  results.push({ name: step.name, ok, status: result.status, optional: Boolean(step.optional) });
  if (!ok) {
    console.warn(`[production-data] ${step.name} failed with exit ${result.status ?? "unknown"}; ${step.optional ? "optional enrichment will be omitted" : "committed static data will remain the fallback"}.`);
  }
}

const succeeded = results.filter((result) => result.ok).length;
const failed = results.filter((result) => !result.ok);
console.log(`[production-data] completed ${succeeded}/${results.length} build steps.`);
if (failed.length) console.warn(`[production-data] fail-soft steps: ${failed.map((result) => result.name).join(", ")}`);

// Static intelligence is an enrichment layer. Do not block a live roster deployment
// solely because an external versioned-data source is temporarily unavailable.
process.exitCode = 0;
