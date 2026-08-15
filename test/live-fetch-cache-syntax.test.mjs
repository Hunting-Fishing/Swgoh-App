import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("shared live roster fetch cache parses as valid browser JavaScript", () => {
  const modulePath = fileURLToPath(new URL("../public/live-fetch-cache.js", import.meta.url));
  execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
});
