import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const file of ["farm-presets.js", "journey-progress.js", "journey-tracker-v2.js"]) {
  test(`${file} parses as valid JavaScript`, () => {
    const modulePath = fileURLToPath(new URL(`../public/${file}`, import.meta.url));
    execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
  });
}
