import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const file of ["roster-command-pro.js", "squad-workbench-pro.js", "rote-readiness-pro.js"]) {
  test(`${file} parses as valid JavaScript`, () => {
    const modulePath = fileURLToPath(new URL(`../public/${file}`, import.meta.url));
    execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
  });
}
