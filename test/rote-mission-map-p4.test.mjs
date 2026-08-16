import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
import {
  ROTE_P4_MISSION_MAPS,
  ROTE_P4_MISSION_MAP_SOURCE,
} from "../public/rote-mission-map-p4-data.js";

const EXPECTED_PLANETS = ["haven", "kessel", "lothal"];
const EXPECTED_NODE_COUNTS = Object.freeze({ haven: 7, kessel: 7, lothal: 6 });
const VALID_TYPES = new Set(["combat", "fleet", "special", "deployment", "operations"]);

test("P4 main mission map excludes Mandalore and covers Haven, Kessel and Lothal", () => {
  assert.deepEqual(Object.keys(ROTE_P4_MISSION_MAPS).sort(), EXPECTED_PLANETS);
  assert.equal(ROTE_P4_MISSION_MAPS.mandalore, undefined);
  for (const planetId of EXPECTED_PLANETS) {
    assert.equal(ROTE_P4_MISSION_MAPS[planetId].nodes.length, EXPECTED_NODE_COUNTS[planetId]);
  }
});

test("P4 source node positions, types and R8 gates remain valid", () => {
  for (const [planetId, map] of Object.entries(ROTE_P4_MISSION_MAPS)) {
    const ids = new Set();
    for (const node of map.nodes) {
      assert.ok(node.top >= 0 && node.top <= 95, `${planetId}/${node.id} top must fit map`);
      assert.ok(node.left >= 0 && node.left <= 95, `${planetId}/${node.id} left must fit map`);
      assert.ok(VALID_TYPES.has(node.type), `${planetId}/${node.id} type unsupported`);
      assert.ok(!ids.has(node.id), `${planetId}/${node.id} duplicated`);
      ids.add(node.id);
      assert.match(node.requirement, /Relic 8|7★|deployment/i);
    }
  }
});

test("P4 live-preparation links resolve to existing recommendation objects", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P4_MISSION_MAPS)) {
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
  assert.equal(linked, 5, "only five P4 main-planet nodes have explicit existing recommendations");
});

test("P4 special missions preserve current Third Sister and Qi'ra/L3 rewards", () => {
  const haven = ROTE_P4_MISSION_MAPS.haven.nodes.find((node) => node.id === "c3");
  const kessel = ROTE_P4_MISSION_MAPS.kessel.nodes.find((node) => node.id === "c3");
  assert.ok(haven);
  assert.ok(kessel);
  assert.equal(haven.type, "special");
  assert.match(haven.requirement, /Third Sister/);
  assert.match(haven.reward, /20 Mk III/);
  assert.equal(kessel.type, "special");
  assert.match(kessel.requirement, /Qi'ra/);
  assert.match(kessel.requirement, /L3-37/);
  assert.match(kessel.reward, /20 Mk III/);
});

test("P4 territory star thresholds remain attached to deployment nodes", () => {
  const expected = Object.freeze({
    haven: "1★ 235,143,105 · 2★ 400,243,583 · 3★ 500,304,479",
    kessel: "1★ 235,143,105 · 2★ 400,243,583 · 3★ 500,304,479",
    lothal: "1★ 246,742,558 · 2★ 419,987,333 · 3★ 524,984,167",
  });
  for (const [planetId, reward] of Object.entries(expected)) {
    const deployment = ROTE_P4_MISSION_MAPS[planetId].nodes.find((node) => node.type === "deployment");
    assert.equal(deployment?.reward, reward);
  }
});

test("P4 source provenance is pinned and current evidence is explicit", () => {
  assert.equal(ROTE_P4_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P4_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P4_MISSION_MAP_SOURCE.currentRewards, /^https:\/\/swgoh\.gg\//);
  for (const [planetId, map] of Object.entries(ROTE_P4_MISSION_MAPS)) {
    assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.png$`));
  }
});
