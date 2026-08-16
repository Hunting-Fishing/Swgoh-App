import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import {
  ROTE_P2_MISSION_MAPS,
  ROTE_P2_MISSION_MAP_SOURCE,
} from "../public/rote-mission-map-p2-data.js";

const EXPECTED_PLANETS = ["bracca", "felucia", "geonosis"];
const VALID_TYPES = new Set(["combat", "fleet", "special", "deployment", "operations"]);

test("P2 source mission map is limited to the three Zone 2 planets", () => {
  assert.deepEqual(Object.keys(ROTE_P2_MISSION_MAPS).sort(), EXPECTED_PLANETS);
  for (const planetId of EXPECTED_PLANETS) {
    assert.equal(ROTE_P2_MISSION_MAPS[planetId].nodes.length, 7, `${planetId} should preserve seven source nodes`);
  }
});

test("P2 mission coordinates and node types remain valid", () => {
  for (const [planetId, map] of Object.entries(ROTE_P2_MISSION_MAPS)) {
    const ids = new Set();
    for (const node of map.nodes) {
      assert.ok(node.top >= 0 && node.top <= 95, `${planetId}/${node.id} top must fit the map`);
      assert.ok(node.left >= 0 && node.left <= 95, `${planetId}/${node.id} left must fit the map`);
      assert.ok(VALID_TYPES.has(node.type), `${planetId}/${node.id} has unsupported type`);
      assert.ok(!ids.has(node.id), `${planetId}/${node.id} duplicated`);
      ids.add(node.id);
    }
  }
});

test("P2 live-preparation links only target existing recommendations", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P2_MISSION_MAPS)) {
    const missions = new Map((ROTE_MISSIONS_BY_PLANET[planetId] || []).map((mission) => [mission.id, mission]));
    for (const node of map.nodes) {
      if (!node.missionId && !node.teamId) continue;
      linked += 1;
      assert.ok(node.missionId && node.teamId, `${planetId}/${node.id} links must be all-or-nothing`);
      const mission = missions.get(node.missionId);
      assert.ok(mission, `${planetId}/${node.id} references missing mission ${node.missionId}`);
      assert.ok(mission.recommendations.some((recommendation) => recommendation.id === node.teamId));
    }
  }
  assert.equal(linked, 4, "only four P2 nodes currently have unambiguous mission + recommendation mappings");
});

test("current Zone 2 relic evidence overrides stale Geonosian R7 source text", () => {
  const geos = ROTE_P2_MISSION_MAPS.geonosis.nodes.find((node) => node.id === "c5");
  assert.ok(geos);
  assert.match(geos.requirement, /Relic 6\+/);
  assert.doesNotMatch(geos.requirement, /Relic 7/);
  assert.equal(geos.missionId, "geonosis-geos");
});

test("Hondo is displayed as current Combat Mission but intentionally not linked to stale internal special type", () => {
  const hondo = ROTE_P2_MISSION_MAPS.felucia.nodes.find((node) => node.id === "c5");
  assert.ok(hondo);
  assert.equal(hondo.type, "combat");
  assert.equal(hondo.missionId, "");
  assert.equal(hondo.teamId, "");
  assert.match(hondo.note, /Combat Mission/);
  assert.match(hondo.note, /intentionally disabled/);
});

test("P2 source provenance keeps geometry pinned and current evidence separate", () => {
  assert.equal(ROTE_P2_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P2_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P2_MISSION_MAP_SOURCE.currentHondoMission, /^https:\/\/swgoh\.gg\//);
  for (const [planetId, map] of Object.entries(ROTE_P2_MISSION_MAPS)) {
    assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.png$`));
  }
});
