import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const file of ["mods-audit.js", "mods-pro.js"]) {
  test(`${file} parses as valid JavaScript`, () => {
    const modulePath = fileURLToPath(new URL(`../public/${file}`, import.meta.url));
    execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
  });
}

test("server.mjs parses with equipped-mod proxy route", () => {
  const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));
  execFileSync(process.execPath, ["--check", serverPath], { stdio: "pipe" });
});
