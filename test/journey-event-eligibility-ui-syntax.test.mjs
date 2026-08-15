import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const enginePath = fileURLToPath(new URL("../public/journey-event-eligibility.js", import.meta.url));
const uiPath = fileURLToPath(new URL("../public/journey-event-eligibility-pro.js", import.meta.url));
const indexPath = fileURLToPath(new URL("../public/index.html", import.meta.url));

for (const [name, path] of [["eligibility engine", enginePath], ["eligibility UI", uiPath]]) {
  test(`${name} parses as valid JavaScript`, () => {
    execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  });
}

test("production shell wires verified Journey eligibility assets", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.match(html, /journey-event-eligibility-pro\.css/);
  assert.match(html, /journey-event-eligibility-pro\.js/);
});

test("eligibility UI explicitly separates legal entry from battle recommendations", () => {
  const source = readFileSync(uiPath, "utf8");
  assert.match(source, /ENTRY ELIGIBILITY ONLY/);
  assert.match(source, /not a battle-team recommendation/);
  assert.match(source, /Best progressed legal 5/);
  assert.match(source, /fail closed/i);
});
