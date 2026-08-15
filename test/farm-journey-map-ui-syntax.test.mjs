import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const modulePath = fileURLToPath(new URL("../public/farm-journey-map-pro.js", import.meta.url));
const indexPath = fileURLToPath(new URL("../public/index.html", import.meta.url));

test("farm Journey Map parses as valid JavaScript", () => {
  execFileSync(process.execPath, ["--check", modulePath], { stdio: "pipe" });
});

test("production shell wires Journey Map assets", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.match(html, /farm-journey-map-pro\.css/);
  assert.match(html, /farm-journey-map-pro\.js/);
});

test("Journey Map keeps detailed mode and direct tracking controls", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.match(source, /Detailed Farm Command/);
  assert.match(source, /Journey Map/);
  assert.match(source, /data-track-journey/);
  assert.match(source, /data-untrack-journey/);
  assert.match(source, /Requirements/);
});
