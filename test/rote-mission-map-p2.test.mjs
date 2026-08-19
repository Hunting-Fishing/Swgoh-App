import test from "node:test";
import assert from "node:assert/strict";

import { normalizedRoteMissionsForPlanet } from "../public/rote-mission-node-eligibility.js";
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

test("all P2 playable nodes link to normalized tactical recommendations", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P2_MISSION_MAPS)) {
    const missions = new Map(normalizedRoteMissionsForPlanet(planetId).map((mission) => [mission.id, mission]));
    for (const node of map.nodes) {
      if (!node.missionId && !node.teamId) continue;
      linked += 1;
      assert.ok(node.missionId && node.teamId, `${planetId}/${node.id} links must be all-or-nothing`);
      const mission = missions.get(node.missionId);
      assert.ok(mission, `${planetId}/${node.id} references missing mission ${node.missionId}`);
      assert.ok(
        mission.recommendations.some((recommendation) => recommendation.id === node.teamId),
        `${planetId}/${node.id} references missing recommendation ${node.teamId}`,
      );
      assert.ok(mission.tactical?.commandTag, `${planetId}/${node.id} should expose a tactical command tag`);
      assert.ok(mission.recommendations.every((recommendation) => recommendation.name.startsWith("ROTE-P2-")));
    }
  }
  assert.equal(linked, 15, "all fifteen P2 playable mission/fleet nodes should be linked");
});

test("current Zone 2 relic evidence overrides stale Geonosian R7 source text", () => {
  const geos = ROTE_P2_MISSION_MAPS.geonosis.nodes.find((node) => node.id === "c5");
  assert.ok(geos);
  assert.match(geos.requirement, /Relic 6\+/);
  assert.doesNotMatch(geos.requirement, /Relic 7/);
  assert.equal(geos.missionId, "geonosis-geos");
});

test("Hondo is normalized to the current Combat Mission type and linked to tactical squads", () => {
  const hondoNode = ROTE_P2_MISSION_MAPS.felucia.nodes.find((node) => node.id === "c5");
  const hondoMission = normalizedRoteMissionsForPlanet("felucia").find((mission) => mission.id === "felucia-hondo");
  assert.ok(hondoNode);
  assert.ok(hondoMission);
  assert.equal(hondoNode.type, "combat");
  assert.equal(hondoNode.missionId, "felucia-hondo");
  assert.equal(hondoNode.teamId, "rote-p2-fel-hondo-rey");
  assert.equal(hondoMission.missionType, "combat");
  assert.match(hondoMission.name, /Tarkin/);
  assert.ok(hondoMission.recommendations.length >= 3);
});

test("P2 tactical names expose beasts and major enemy encounters", () => {
  const geonosis = new Map(normalizedRoteMissionsForPlanet("geonosis").map((mission) => [mission.id, mission]));
  const felucia = new Map(normalizedRoteMissionsForPlanet("felucia").map((mission) => [mission.id, mission]));
  const bracca = new Map(normalizedRoteMissionsForPlanet("bracca").map((mission) => [mission.id, mission]));

  assert.match(geonosis.get("geonosis-generic-1")?.name || "", /Nexu/);
  assert.match(geonosis.get("geonosis-generic-2")?.name || "", /Acklay/);
  assert.match(geonosis.get("geonosis-generic-3")?.name || "", /Reek/);
  assert.match(felucia.get("felucia-generic-1")?.name || "", /Pirates.*Hondo/);
  assert.match(felucia.get("felucia-lando")?.name || "", /Iden/);
  assert.match(bracca.get("bracca-generic-1")?.name || "", /Second Sister/);
  assert.match(bracca.get("bracca-generic-2")?.name || "", /Crosshair/);
});

test("P2 source provenance keeps geometry pinned and current evidence separate", () => {
  assert.equal(ROTE_P2_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P2_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P2_MISSION_MAP_SOURCE.currentHondoMission, /^https:\/\/swgoh\.gg\//);
  for (const [planetId, map] of Object.entries(ROTE_P2_MISSION_MAPS)) {
    assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.png$`));
  }
});
