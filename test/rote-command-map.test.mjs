import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ROTE_PLANETS, rotePlanetById, unitMeetsPlanetGate, planetRosterReadiness } from "../public/rote-map-data.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function unit(baseId, { relic = 0, alignment = "Light", power = 10000, speed = 200, unitType = "Character" } = {}) {
  return { baseId, name: baseId, relic, alignment, power, speed, unitType };
}

test("ROTE map contains all primary and bonus territories", () => {
  assert.equal(ROTE_PLANETS.length, 20);
  assert.equal(ROTE_PLANETS.filter((planet) => /^P[1-6]$/.test(planet.phase)).length, 18);
  assert.equal(ROTE_PLANETS.filter((planet) => planet.bonus).length, 2);
  assert.equal(rotePlanetById("mustafar").relic, 5);
  assert.equal(rotePlanetById("scarif").relic, 9);
  assert.equal(rotePlanetById("zeffo").relic, 7);
  assert.equal(rotePlanetById("mandalore").relic, 8);
});

test("planet gate enforces relic and alignment without inventing mission rules", () => {
  const mustafar = rotePlanetById("mustafar");
  const corellia = rotePlanetById("corellia");
  assert.equal(unitMeetsPlanetGate(unit("dark-r5", { relic: 5, alignment: "Dark" }), mustafar), true);
  assert.equal(unitMeetsPlanetGate(unit("light-r9", { relic: 9, alignment: "Light" }), mustafar), false);
  assert.equal(unitMeetsPlanetGate(unit("dark-r4", { relic: 4, alignment: "Dark" }), mustafar), false);
  assert.equal(unitMeetsPlanetGate(unit("mixed-light", { relic: 5, alignment: "Light" }), corellia), true);
  assert.equal(unitMeetsPlanetGate(unit("mixed-dark", { relic: 5, alignment: "Dark" }), corellia), true);
  assert.equal(unitMeetsPlanetGate(unit("ship", { relic: 9, alignment: "Dark", unitType: "Ship" }), corellia), false);
});

test("roster readiness ranks qualifying characters and reports depth", () => {
  const planet = rotePlanetById("coruscant");
  const body = {
    units: [
      unit("A", { relic: 7, alignment: "Light", power: 50000, speed: 250 }),
      unit("B", { relic: 6, alignment: "Light", power: 45000, speed: 260 }),
      unit("C", { relic: 5, alignment: "Light", power: 40000 }),
      unit("D", { relic: 5, alignment: "Light", power: 35000 }),
      unit("E", { relic: 5, alignment: "Light", power: 30000 }),
      unit("F", { relic: 5, alignment: "Light", power: 25000 }),
      unit("wrong-side", { relic: 9, alignment: "Dark", power: 99999 }),
    ],
  };
  const readiness = planetRosterReadiness(body, planet);
  assert.equal(readiness.eligibleCount, 6);
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.topFive.map((entry) => entry.baseId), ["A", "B", "C", "D", "E"]);
  assert.equal(readiness.gatePercent, 100);
});

test("ROTE command map browser modules are syntax-valid", () => {
  for (const file of ["public/rote-map-data.js", "public/rote-readiness-pro.js", "public/rote-squad-bridge.js"]) {
    execFileSync(process.execPath, ["--check", join(root, file)], { stdio: "pipe" });
  }
});

test("production shell wires ROTE map assets and keeps map readiness boundary explicit", () => {
  const html = readFileSync(join(root, "public/index.html"), "utf8");
  const source = readFileSync(join(root, "public/rote-readiness-pro.js"), "utf8");
  assert.match(html, /rote-command-map\.css\?v=20260815-pro15/);
  assert.match(html, /rote-squad-bridge\.js\?v=20260815-pro15/);
  assert.match(html, /rote-readiness-pro\.js\?v=20260815-pro15/);
  assert.match(source, /not a claim that these five are the best battle composition/);
  assert.match(source, /Individual missions can impose additional factions, named-unit, fleet or special rules/);
  assert.match(source, /data-rote-view="map"/);
  assert.match(source, /data-rote-view="operations"/);
});
