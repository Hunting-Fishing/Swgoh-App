import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_PLANETS } from "../public/rote-map-data.js";
import {
  ROTE_MAP_GEOMETRY,
  ROTE_PHASE_ORDER,
  parseLegacyPhase,
  rotePhaseGroup,
  rotePlanetsForPhase,
} from "../public/tb-map-layout-data.js";

test("ROTE information layout has geometry for every displayed planet", () => {
  assert.equal(ROTE_PLANETS.length, 20);
  assert.deepEqual(
    ROTE_PLANETS.map((planet) => planet.id).sort(),
    Object.keys(ROTE_MAP_GEOMETRY).sort(),
  );

  for (const [id, point] of Object.entries(ROTE_MAP_GEOMETRY)) {
    assert.ok(point.x >= 0 && point.x <= 100, `${id} x must stay in the map`);
    assert.ok(point.y >= 0 && point.y <= 100, `${id} y must stay in the map`);
    assert.ok(["dark", "mixed", "light", "bonus"].includes(point.lane), `${id} lane must be known`);
  }
});

test("ROTE main phases remain three-territory Dark/Mixed/Light information rows", () => {
  for (const phase of ROTE_PHASE_ORDER.filter((value) => /^P[1-6]$/.test(value))) {
    const planets = rotePlanetsForPhase(ROTE_PLANETS, phase);
    assert.equal(planets.length, 3, `${phase} should contain exactly three main territories`);
    assert.deepEqual(planets.map((planet) => planet.lane), ["Dark Side", "Mixed", "Light Side"]);
    assert.ok(planets.every((planet) => rotePhaseGroup(planet) === phase));
  }
});

test("ROTE bonus phase contains Zeffo and Mandalore only", () => {
  const bonus = rotePlanetsForPhase(ROTE_PLANETS, "Bonus");
  assert.deepEqual(bonus.map((planet) => planet.id), ["mandalore", "zeffo"].sort((a, b) => {
    const left = ROTE_PLANETS.find((planet) => planet.id === a);
    const right = ROTE_PLANETS.find((planet) => planet.id === b);
    return String(left?.name).localeCompare(String(right?.name));
  }));
  assert.ok(bonus.every((planet) => planet.bonus));
});

test("legacy phase parser accepts the existing Geo/Hoth phase labels", () => {
  assert.equal(parseLegacyPhase("P1 · top"), 1);
  assert.equal(parseLegacyPhase("P4 · middle"), 4);
  assert.equal(parseLegacyPhase("Phase 3"), null);
  assert.equal(parseLegacyPhase(""), null);
});
