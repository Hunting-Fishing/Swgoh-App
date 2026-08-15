import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pathFor = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const indexPath = pathFor("../public/index.html");
const navPath = pathFor("../public/navigation-guard.js");
const loaderPath = pathFor("../public/farm-workspace-loader.js");
const drilldownPath = pathFor("../public/farm-material-drilldown.js");
const mapPath = pathFor("../public/farm-journey-map-pro.js");

for (const [name, path] of [
  ["navigation guard", navPath],
  ["Farm lazy loader", loaderPath],
  ["Farm material drilldown", drilldownPath],
  ["Journey Map", mapPath],
]) {
  test(`${name} parses as valid JavaScript`, () => {
    execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  });
}

test("production shell lazy-loads heavy Farm modules", () => {
  const html = readFileSync(indexPath, "utf8");
  assert.match(html, /navigation-guard\.js\?v=20260815-nav1/);
  assert.match(html, /farm-workspace-loader\.js\?v=20260815-lazy1/);
  assert.doesNotMatch(html, /<script type="module" src="\/journey-tracker-v2\.js/);
  assert.doesNotMatch(html, /<script type="module" src="\/farm-master-plan-pro\.js/);
  assert.doesNotMatch(html, /<script type="module" src="\/farm-journey-map-pro\.js/);
  assert.doesNotMatch(html, /<script type="module" src="\/journey-event-eligibility-pro\.js/);
});

test("Farm drilldown never observes the entire document", () => {
  const source = readFileSync(drilldownPath, "utf8");
  assert.doesNotMatch(source, /new\s+MutationObserver\s*\(/);
  assert.doesNotMatch(source, /observe\s*\(\s*document\.body/);
  assert.match(source, /swgoh:farm-rendered/);
});

test("Journey Map is lazy and render-coalesced", () => {
  const source = readFileSync(mapPath, "utf8");
  assert.match(source, /function journeyMapVisible\(/);
  assert.match(source, /if \(!journeyMapVisible\(\)\) return;/);
  assert.match(source, /state\.rendering/);
  assert.match(source, /clearTimeout\(state\.renderTimer\)/);
  assert.doesNotMatch(source, /new\s+MutationObserver\s*\(/);
});

test("navigation guard captures workspace clicks without stopping feature handlers", () => {
  const source = readFileSync(navPath, "utf8");
  assert.match(source, /button\[data-workspace-tab\]/);
  assert.match(source, /}, true\);/);
  assert.match(source, /swgoh:workspace-activated/);
  assert.doesNotMatch(source, /stopPropagation\s*\(/);
});
