import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Gear and Relic planner browser module parses as valid JavaScript", () => {
  const modulePath = fileURLToPath(new URL("../public/gear-planner-v1.js", import.meta.url));
  execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
});
