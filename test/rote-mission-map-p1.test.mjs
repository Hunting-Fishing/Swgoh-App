import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import {
  ROTE_P1_MISSION_MAPS,
  ROTE_P1_MISSION_MAP_SOURCE,
} from "../public/rote-mission-map-p1-data.js";

const EXPECTED_PLANETS = ["corellia", "coruscant", "mustafar"];
const VALID_TYPES = new Set(["combat", "fleet", "special", "deployment", "operations"]);

test("P1 source mission map is intentionally limited to three Phase 1 planets", () => {
  assert.deepEqual(Object.keys(ROTE_P1_MISSION_MAPS).sort(), EXPECTED_PLANETS);
  for (const planetId of EXPECTED_PLANETS) {
    assert.equal(ROTE_P1_MISSION_MAPS[planetId].nodes.length, 7, `${planetId} should preserve all seven source nodes`);
  }
});

test("source mission coordinates remain valid percentages and node ids stay unique", () => {
  for (const [planetId, map] of Object.entries(ROTE_P1_MISSION_MAPS)) {
    const ids = new Set();
    for (const node of map.nodes) {
      assert.ok(node.top >= 0 && node.top <= 95, `${planetId}/${node.id} top must fit the map`);
      assert.ok(node.left >= 0 && node.left <= 95, `${planetId}/${node.id} left must fit the map`);
      assert.ok(VALID_TYPES.has(node.type), `${planetId}/${node.id} has unsupported type ${node.type}`);
      assert.ok(!ids.has(node.id), `${planetId}/${node.id} duplicated`);
      ids.add(node.id);
      assert.ok(node.label.length > 0);
      assert.ok(node.requirement.length > 0);
      assert.ok(node.reward.length > 0);
    }
  }
});

test("internal roster-preparation links resolve only to existing mission recommendations", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P1_MISSION_MAPS)) {
    const missions = new Map((ROTE_MISSIONS_BY_PLANET[planetId] || []).map((mission) => [mission.id, mission]));
    for (const node of map.nodes) {
      if (!node.missionId && !node.teamId) continue;
      linked += 1;
      assert.ok(node.missionId && node.teamId, `${planetId}/${node.id} internal links must be all-or-nothing`);
      const mission = missions.get(node.missionId);
      assert.ok(mission, `${planetId}/${node.id} references missing mission ${node.missionId}`);
      assert.ok(
        mission.recommendations.some((recommendation) => recommendation.id === node.teamId),
        `${planetId}/${node.id} references missing recommendation ${node.teamId}`,
      );
    }
  }
  assert.equal(linked, 5, "only the five unambiguous P1 strategy/recommendation mappings should be linked");
});

test("generic, deployment and Operations nodes remain unforced", () => {
  const sourceOnly = Object.values(ROTE_P1_MISSION_MAPS)
    .flatMap((map) => map.nodes)
    .filter((node) => !node.missionId && !node.teamId);
  assert.ok(sourceOnly.some((node) => node.type === "deployment"));
  assert.ok(sourceOnly.some((node) => node.type === "operations"));
  assert.ok(sourceOnly.some((node) => node.type === "combat"));
});

test("P1 mission map provenance and backgrounds are pinned to the source revision", () => {
  assert.equal(ROTE_P1_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.deepEqual(ROTE_P1_MISSION_MAP_SOURCE.viewBox, [0, 0, 1000, 667]);
  for (const [planetId, map] of Object.entries(ROTE_P1_MISSION_MAPS)) {
    assert.match(map.background, new RegExp(ROTE_P1_MISSION_MAP_SOURCE.revision));
    assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.(?:png|jpg)$`));
  }
});
