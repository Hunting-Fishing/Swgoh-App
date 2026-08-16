import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_PLANETS } from "../public/rote-map-data.js";
import { ROTE_TERRITORY_SHAPES } from "../public/rote-territory-polygons-data.js";
import {
  ROTE_MISSION_MAP_PROVIDERS,
  roteMissionMap,
  roteMissionMapMatches,
} from "../public/rote-mission-map-registry.js";

test("ROTE mission map registry keeps eight explicit provider groups", () => {
  assert.equal(ROTE_MISSION_MAP_PROVIDERS.length, 8);
  const providerIds = ROTE_MISSION_MAP_PROVIDERS.map((provider) => provider.id);
  assert.equal(new Set(providerIds).size, providerIds.length);
  assert.deepEqual(providerIds, ["p1", "p2", "p3", "zeffo", "p4", "mandalore", "p5", "p6"]);
});

test("all 20 ROTE planets have exactly one mission-map provider", () => {
  assert.equal(ROTE_PLANETS.length, 20);
  const ids = ROTE_PLANETS.map((planet) => planet.id);
  assert.equal(new Set(ids).size, 20, "ROTE planet ids must remain unique");

  for (const id of ids) {
    const matches = roteMissionMapMatches(id);
    assert.equal(matches.length, 1, `${id} must resolve to exactly one mission-map provider`);
    assert.equal(matches[0].map.id, id, `${id} provider returned mismatched map id`);
    assert.equal(roteMissionMap(id), matches[0].map, `${id} registry lookup must return the unique provider result`);
  }
});

test("unknown planets fail closed instead of leaking another provider", () => {
  assert.deepEqual(roteMissionMapMatches("not-a-rote-planet"), []);
  assert.equal(roteMissionMap("not-a-rote-planet"), null);
  assert.equal(roteMissionMap(""), null);
});

test("every ROTE mission-map planet is also represented on the interactive territory map", () => {
  const planetIds = ROTE_PLANETS.map((planet) => planet.id).sort();
  assert.deepEqual(Object.keys(ROTE_TERRITORY_SHAPES).sort(), planetIds);
});

test("every mission map has source-backed art and useful clickable nodes", () => {
  for (const planet of ROTE_PLANETS) {
    const map = roteMissionMap(planet.id);
    assert.ok(map, `${planet.id} map missing`);
    assert.match(map.background, /^https:\/\/raw\.githubusercontent\.com\/genskaar\/tb_empire\//, `${planet.id} background must remain source-pinned`);
    assert.ok(map.nodes.length >= 6, `${planet.id} should expose at least six mission/deploy/Operations nodes`);

    const nodeIds = new Set();
    for (const node of map.nodes) {
      assert.ok(node.id, `${planet.id} node id missing`);
      assert.ok(!nodeIds.has(node.id), `${planet.id}/${node.id} duplicated`);
      nodeIds.add(node.id);
      assert.ok(node.label, `${planet.id}/${node.id} label missing`);
      assert.ok(node.requirement, `${planet.id}/${node.id} requirement missing`);
      assert.ok(node.reward, `${planet.id}/${node.id} reward/value missing`);
      assert.ok(Number.isFinite(Number(node.top)) && node.top >= 0 && node.top <= 95, `${planet.id}/${node.id} top invalid`);
      assert.ok(Number.isFinite(Number(node.left)) && node.left >= 0 && node.left <= 95, `${planet.id}/${node.id} left invalid`);
    }
  }
});

test("every ROTE territory exposes Deployment and Operations nodes", () => {
  for (const planet of ROTE_PLANETS) {
    const map = roteMissionMap(planet.id);
    assert.ok(map.nodes.some((node) => node.type === "deployment"), `${planet.id} deployment node missing`);
    assert.ok(map.nodes.some((node) => node.type === "operations"), `${planet.id} Operations node missing`);
  }
});

test("bonus territories remain explicit and do not collide with normal phase providers", () => {
  const bonusIds = ROTE_PLANETS.filter((planet) => planet.bonus).map((planet) => planet.id).sort();
  assert.deepEqual(bonusIds, ["mandalore", "zeffo"]);
  assert.equal(roteMissionMap("zeffo")?.id, "zeffo");
  assert.equal(roteMissionMap("mandalore")?.id, "mandalore");
  assert.equal(roteMissionMapMatches("zeffo").length, 1);
  assert.equal(roteMissionMapMatches("mandalore").length, 1);
});

test("all source-linked live-preparation mappings are all-or-nothing", () => {
  for (const planet of ROTE_PLANETS) {
    const map = roteMissionMap(planet.id);
    for (const node of map.nodes) {
      assert.equal(Boolean(node.missionId), Boolean(node.teamId), `${planet.id}/${node.id} must not have a partial live-preparation link`);
    }
  }
});
