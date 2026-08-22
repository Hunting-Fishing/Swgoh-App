import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildPlayerTbSpecialReadiness,
  specialMissionsForLocation,
  tbFarmTargets,
} from "../public/tb-special-readiness-registry.js";

const relic = (baseId, r = 7, extra = {}) => ({ baseId, gear: 13, relic: r, stars: 7, power: 20000, ...extra });

const catalog = [
  { baseId: "PAZVIZSLA", name: "Paz Vizsla", categories: ["Mandalorian"] },
  { baseId: "INQ1", name: "Inquisitor One", categories: ["Inquisitorius"] },
  { baseId: "INQ2", name: "Inquisitor Two", categories: ["Inquisitorius"] },
  { baseId: "INQ3", name: "Inquisitor Three", categories: ["Inquisitorius"] },
  { baseId: "INQ4", name: "Inquisitor Four", categories: ["Inquisitorius"] },
];

function readyBody() {
  return {
    player: { name: "Test Player", allyCode: "123456789", galacticPower: 10000000 },
    units: [
      relic("CEREJUNDA"), relic("JEDIKNIGHTCAL"), relic("CALKESTIS", 3),
      relic("MANDALORBOKATAN"), relic("THEMANDALORIANBESKARARMOR"), relic("PAZVIZSLA"),
      relic("GRANDINQUISITOR"), relic("INQ1"), relic("INQ2"), relic("INQ3"), relic("INQ4"),
      relic("GEONOSIANBROODALPHA"), relic("GEONOSIANSOLDIER"), relic("GEONOSIANSPY"), relic("POGGLETHELESSER"), relic("SUNFAC"),
    ],
  };
}

test("special mission registry maps missions to their TB map locations", () => {
  assert.deepEqual(specialMissionsForLocation("rote", "bracca").map((row) => row.id), ["zeffo"]);
  assert.deepEqual(specialMissionsForLocation("rote", "tatooine").map((row) => row.id), ["mandalore", "reva"]);
  assert.deepEqual(specialMissionsForLocation("geo-separatist", "p3-middle").map((row) => row.id), ["wat"]);
});

test("player readiness uses the same four mission models as Guild Officers", () => {
  const rows = buildPlayerTbSpecialReadiness(readyBody(), catalog);
  assert.deepEqual(rows.map((row) => row.id), ["zeffo", "mandalore", "reva", "wat"]);
  assert.ok(rows.every((row) => row.status === "READY"));
  assert.equal(rows.find((row) => row.id === "mandalore")?.requirements[2]?.name, "Paz Vizsla");
  assert.equal(rows.find((row) => row.id === "wat")?.requirements.length, 5);
});

test("TB farm guide does not incorrectly require both Cal variants", () => {
  const body = readyBody();
  body.units = body.units.map((unit) => unit.baseId === "CEREJUNDA" || unit.baseId === "JEDIKNIGHTCAL" ? { ...unit, relic: 6 } : unit);
  const rows = buildPlayerTbSpecialReadiness(body, catalog);
  const zeffoTargets = tbFarmTargets(rows).filter((row) => row.missionId === "zeffo");
  assert.deepEqual(zeffoTargets.map((row) => row.name), ["Cere Junda", "JKCK"]);
});

test("cross-surface UI exposes map, personal check and TB farming projections", async () => {
  const source = await readFile(new URL("../public/tb-readiness-cross-surface.js", import.meta.url), "utf8");
  assert.match(source, /workspace-guild/);
  assert.match(source, /YOUR TB CHECK/);
  assert.match(source, /workspace-farm/);
  assert.match(source, /TB READY FARMING/);
  assert.match(source, /data-tb-open-rote/);
  assert.match(source, /p3-middle/);
});

test("global Guild router imports the cross-surface readiness enhancer", async () => {
  const router = await readFile(new URL("../public/guild-zeffo-readiness-router.js", import.meta.url), "utf8");
  assert.match(router, /tb-readiness-cross-surface\.js/);
});
