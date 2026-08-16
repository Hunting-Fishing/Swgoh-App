import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_PLANETS } from "../public/rote-map-data.js";
import { ROTE_MAP_GEOMETRY } from "../public/tb-map-layout-data.js";
import {
  ROTE_SOURCE_MARKERS,
  ROTE_TERRITORY_SHAPES,
  ROTE_TERRITORY_SOURCE,
} from "../public/rote-territory-polygons-data.js";

const planetIds = ROTE_PLANETS.map((planet) => planet.id).sort();

test("ROTE territory interaction covers every displayed planet", () => {
  assert.deepEqual(Object.keys(ROTE_TERRITORY_SHAPES).sort(), planetIds);
  assert.deepEqual(Object.keys(ROTE_SOURCE_MARKERS).sort(), planetIds);
});

test("source-backed geometry keeps exact polygons separate from Mandalore hotspot", () => {
  const paths = Object.entries(ROTE_TERRITORY_SHAPES).filter(([, shape]) => shape.kind === "path");
  const hotspots = Object.entries(ROTE_TERRITORY_SHAPES).filter(([, shape]) => shape.kind === "hotspot");
  assert.equal(paths.length, 19);
  assert.deepEqual(hotspots.map(([id]) => id), ["mandalore"]);

  for (const [id, shape] of paths) {
    assert.match(shape.path, /^M\s/i, `${id} should begin with an SVG move command`);
    assert.match(shape.path, /z$/i, `${id} polygon should close`);
  }

  const mandalore = ROTE_TERRITORY_SHAPES.mandalore;
  assert.ok(mandalore.cx > 0 && mandalore.cx < 750);
  assert.ok(mandalore.cy > 0 && mandalore.cy < 500);
  assert.ok(mandalore.r > 0);
});

test("every ROTE territory has three ascending TP thresholds", () => {
  for (const [id, shape] of Object.entries(ROTE_TERRITORY_SHAPES)) {
    assert.equal(shape.thresholds.length, 3, `${id} should expose three reference thresholds`);
    const values = shape.thresholds.map((entry) => Number(entry.tp));
    assert.ok(values.every((value) => Number.isFinite(value) && value > 0), `${id} thresholds must be positive numbers`);
    assert.ok(values[0] < values[1] && values[1] < values[2], `${id} thresholds must be ascending`);
  }
});

test("presentation marker geometry matches the sourced marker centers", () => {
  for (const id of planetIds) {
    assert.equal(ROTE_MAP_GEOMETRY[id].x, ROTE_SOURCE_MARKERS[id].x, `${id} x marker drifted`);
    assert.equal(ROTE_MAP_GEOMETRY[id].y, ROTE_SOURCE_MARKERS[id].y, `${id} y marker drifted`);
  }
});

test("ROTE territory source provenance is pinned", () => {
  assert.equal(ROTE_TERRITORY_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.deepEqual(ROTE_TERRITORY_SOURCE.viewBox, [0, 0, 750, 500]);
  assert.match(ROTE_TERRITORY_SOURCE.repository, /^https:\/\/github\.com\/genskaar\/tb_empire$/);
});
