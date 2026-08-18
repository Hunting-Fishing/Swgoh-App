import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("production startup soft-fails Discord schema registration but manual registration remains strict", async () => {
  const packageJson = JSON.parse(await text("package.json"));
  const source = await text("scripts/register-discord-tb-commands.mjs");

  assert.match(
    packageJson.scripts.start,
    /register-discord-tb-commands\.mjs --if-configured --soft-fail && node server\.mjs/,
  );
  assert.equal(packageJson.scripts["discord:register-tb"], "node scripts/register-discord-tb-commands.mjs");
  assert.match(source, /const softFail = process\.argv\.includes\("--soft-fail"\)/);
  assert.match(source, /Continuing web startup with the last successfully registered Discord schema/);
  assert.match(source, /if \(softFail\)[\s\S]*return;[\s\S]*process\.exitCode = 1/);
});
