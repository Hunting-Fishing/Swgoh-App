import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_PLANETS } from "../public/rote-map-data.js";
import { ROTE_TERRITORY_SHAPES } from "../public/rote-territory-polygons-data.js";
import { roteP1MissionMap } from "../public/rote-mission-map-p1-data.js";
import { roteP2MissionMap } from "../public/rote-mission-map-p2-data.js";
import { roteP3MissionMap } from "../public/rote-mission-map-p3-data.js";
import { roteZeffoMissionMap } from "../public/rote-mission-map-zeffo-data.js";
import { roteP4MissionMap } from "../public/rote-mission-map-p4-data.js";
import { roteMandaloreMissionMap } from "../public/rote-mission-map-mandalore-data.js";
import { roteP5MissionMap } from "../public/rote-mission-map-p5-data.js";
import { roteP6MissionMap } from "../public/rote-mission-map-p6-data.js";

const providers = Object.freeze([
  roteP1MissionMap,
  roteP2MissionMap,
  roteP3MissionMap,
  roteZeffoMissionMap,
  roteP4MissionMap,
  roteMandaloreMissionMap,
  roteP5MissionMap,
  roteP6MissionMap,
]);

function matchesFor(planetId) {
  return providers.map((provider) => provider(planetId)).filter(Boolean);
}

test("all 20 ROTE planets have exactly one mission-map provider", () => {
  assert.equal(ROTE_PLANETS.length, 20);
  const ids = ROTE_PLANETS.map((planet) => planet.id);
  assert.equal(new Set(ids).size, 20, "ROTE planet ids must remain unique");

  for (const id of ids) {
    const matches = matchesFor(id);
    assert.equal(matches.length, 1, `${id} must resolve to exactly one mission-map provider`);
    assert.equal(matches[0].id, id, `${id} provider returned mismatched map id`);
  }
});

test("every ROTE mission-map planet is also represented on the interactive territory map", () => {
  const planetIds = ROTE_PLANETS.map((planet) => planet.id).sort();
  assert.deepEqual(Object.keys(ROTE_TERRITORY_SHAPES).sort(), planetIds);
});

test("every mission map has source-backed art and useful clickable nodes", () => {
  for (const planet of ROTE_PLANETS) {
    const map = matchesFor(planet.id)[0];
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

test("every main ROTE territory exposes Deployment and Operations nodes", () => {
  for (const planet of ROTE_PLANETS) {
    const map = matchesFor(planet.id)[0];
    assert.ok(map.nodes.some((node) => node.type === "deployment"), `${planet.id} deployment node missing`);
    assert.ok(map.nodes.some((node) => node.type === "operations"), `${planet.id} Operations node missing`);
  }
});

test("bonus territories remain explicit and do not collide with normal phase providers", () => {
  const bonusIds = ROTE_PLANETS.filter((planet) => planet.bonus).map((planet) => planet.id).sort();
  assert.deepEqual(bonusIds, ["mandalore", "zeffo"]);
  assert.equal(roteZeffoMissionMap("zeffo")?.id, "zeffo");
  assert.equal(roteMandaloreMissionMap("mandalore")?.id, "mandalore");
  assert.equal(matchesFor("zeffo").length, 1);
  assert.equal(matchesFor("mandalore").length, 1);
});

test("all source-linked live-preparation mappings are all-or-nothing", () => {
  for (const planet of ROTE_PLANETS) {
    const map = matchesFor(planet.id)[0];
    for (const node of map.nodes) {
      assert.equal(Boolean(node.missionId), Boolean(node.teamId), `${planet.id}/${node.id} must not have a partial live-preparation link`);
    }
  }
});
