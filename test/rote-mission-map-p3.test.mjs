import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import {
  ROTE_P3_MISSION_MAPS,
  ROTE_P3_MISSION_MAP_SOURCE,
} from "../public/rote-mission-map-p3-data.js";

const EXPECTED_PLANETS = ["dathomir", "kashyyyk", "tatooine"];
const EXPECTED_NODE_COUNTS = Object.freeze({ dathomir: 7, tatooine: 8, kashyyyk: 7 });
const VALID_TYPES = new Set(["combat", "fleet", "special", "reva", "deployment", "operations"]);

test("P3 main mission map excludes Zeffo and covers Dathomir, Tatooine and Kashyyyk", () => {
  assert.deepEqual(Object.keys(ROTE_P3_MISSION_MAPS).sort(), EXPECTED_PLANETS);
  assert.equal(ROTE_P3_MISSION_MAPS.zeffo, undefined);
  for (const planetId of EXPECTED_PLANETS) {
    assert.equal(ROTE_P3_MISSION_MAPS[planetId].nodes.length, EXPECTED_NODE_COUNTS[planetId]);
  }
});

test("P3 source node coordinates and types remain valid", () => {
  for (const [planetId, map] of Object.entries(ROTE_P3_MISSION_MAPS)) {
    const ids = new Set();
    for (const node of map.nodes) {
      assert.ok(node.top >= 0 && node.top <= 95, `${planetId}/${node.id} top must fit map`);
      assert.ok(node.left >= 0 && node.left <= 95, `${planetId}/${node.id} left must fit map`);
      assert.ok(VALID_TYPES.has(node.type), `${planetId}/${node.id} type ${node.type} unsupported`);
      assert.ok(!ids.has(node.id), `${planetId}/${node.id} duplicated`);
      ids.add(node.id);
      assert.match(node.requirement, /Relic 7|7★|deployment/i);
    }
  }
});

test("P3 live-preparation links resolve only to existing recommendation objects", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P3_MISSION_MAPS)) {
    const missions = new Map((ROTE_MISSIONS_BY_PLANET[planetId] || []).map((mission) => [mission.id, mission]));
    for (const node of map.nodes) {
      if (!node.missionId && !node.teamId) continue;
      linked += 1;
      assert.ok(node.missionId && node.teamId, `${planetId}/${node.id} links must be all-or-nothing`);
      const mission = missions.get(node.missionId);
      assert.ok(mission, `${planetId}/${node.id} missing mission ${node.missionId}`);
      assert.ok(
        mission.recommendations.some((recommendation) => recommendation.id === node.teamId),
        `${planetId}/${node.id} missing recommendation ${node.teamId}`,
      );
    }
  }
  assert.equal(linked, 6, "only six P3 main-planet nodes have explicit existing recommendations");
});

test("P3 high-value special nodes retain current requirements and rewards", () => {
  const merrin = ROTE_P3_MISSION_MAPS.dathomir.nodes.find((node) => node.id === "c8");
  const reva = ROTE_P3_MISSION_MAPS.tatooine.nodes.find((node) => node.id === "c4");
  const mandalore = ROTE_P3_MISSION_MAPS.tatooine.nodes.find((node) => node.id === "c5");
  const saw = ROTE_P3_MISSION_MAPS.kashyyyk.nodes.find((node) => node.id === "c8");

  assert.equal(merrin.type, "special");
  assert.match(merrin.requirement, /Merrin/);
  assert.match(merrin.reward, /50 Mk II/);

  assert.equal(reva.type, "reva");
  assert.match(reva.requirement, /Grand Inquisitor/);
  assert.match(reva.reward, /Third Sister shard/);

  assert.equal(mandalore.type, "special");
  assert.match(mandalore.requirement, /Bo-Katan \(Mand'alor\)/);
  assert.match(mandalore.reward, /25 guild clears unlock Mandalore/);

  assert.equal(saw.type, "special");
  assert.match(saw.requirement, /Saw Gerrera/);
  assert.match(saw.reward, /50 Mk II/);
});

test("P3 source provenance is pinned while current requirement evidence is explicit", () => {
  assert.equal(ROTE_P3_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P3_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P3_MISSION_MAP_SOURCE.currentRewards, /^https:\/\/swgoh\.gg\//);
  for (const [planetId, map] of Object.entries(ROTE_P3_MISSION_MAPS)) {
    assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.png$`));
  }
});
