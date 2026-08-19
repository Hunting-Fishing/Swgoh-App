import test from "node:test";
import assert from "node:assert/strict";

import { normalizedRoteMissionsForPlanet } from "../public/rote-mission-node-eligibility.js";
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

test("all P3 playable nodes link to normalized tactical recommendations", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P3_MISSION_MAPS)) {
    const missions = new Map(normalizedRoteMissionsForPlanet(planetId).map((mission) => [mission.id, mission]));
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
      assert.ok(mission.tactical?.commandTag, `${planetId}/${node.id} should expose a tactical command tag`);
      assert.ok(mission.recommendations.every((recommendation) => recommendation.name.startsWith("ROTE-P3-")));
    }
  }
  assert.equal(linked, 16, "all sixteen P3 main-planet playable nodes should be linked");
});

test("P3 infrastructure nodes remain source-only", () => {
  const sourceOnly = Object.values(ROTE_P3_MISSION_MAPS)
    .flatMap((map) => map.nodes)
    .filter((node) => !node.missionId && !node.teamId);
  assert.equal(sourceOnly.length, 6);
  assert.ok(sourceOnly.every((node) => node.type === "deployment" || node.type === "operations"));
});

test("P3 high-value special nodes retain current requirements, rewards and tactical identity", () => {
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

  const tatooine = new Map(normalizedRoteMissionsForPlanet("tatooine").map((mission) => [mission.id, mission]));
  const unlock = tatooine.get("tatooine-mandalore-unlock");
  assert.equal(unlock?.tactical?.commandTag, "MANDALORE UNLOCK | BKM + BAM + 1 MANDO");
  assert.deepEqual(unlock?.enemies, ["Krayt Dragon"]);
  assert.deepEqual(unlock?.recommendations.map((recommendation) => recommendation.name), [
    "ROTE-P3-TAT-MANDALORE-IG12",
    "ROTE-P3-TAT-MANDALORE-PAZ",
  ]);
});

test("P3 tactical labels expose the important enemy encounters", () => {
  const dathomir = new Map(normalizedRoteMissionsForPlanet("dathomir").map((mission) => [mission.id, mission]));
  const tatooine = new Map(normalizedRoteMissionsForPlanet("tatooine").map((mission) => [mission.id, mission]));
  const kashyyyk = new Map(normalizedRoteMissionsForPlanet("kashyyyk").map((mission) => [mission.id, mission]));

  assert.match(dathomir.get("dathomir-aphra")?.name || "", /Talzin/);
  assert.match(dathomir.get("dathomir-merrin")?.name || "", /Hondo.*Maul/);
  assert.match(tatooine.get("tatooine-jabba")?.name || "", /Pirates.*Hondo/);
  assert.match(tatooine.get("tatooine-fennec")?.name || "", /Tusken/);
  assert.match(tatooine.get("tatooine-reva")?.name || "", /Jawas.*JMK/);
  assert.match(tatooine.get("tatooine-generic-1")?.name || "", /Sandtroopers/);
  assert.match(kashyyyk.get("kashyyyk-generic-1")?.name || "", /Mara Jade/);
  assert.match(kashyyyk.get("kashyyyk-wookiee")?.name || "", /Ninth Sister/);
  assert.match(kashyyyk.get("kashyyyk-saw")?.name || "", /AT-ST/);
});

test("P3 source provenance is pinned while current requirement evidence is explicit", () => {
  assert.equal(ROTE_P3_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P3_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P3_MISSION_MAP_SOURCE.currentRewards, /^https:\/\/swgoh\.gg\//);
  for (const [planetId, map] of Object.entries(ROTE_P3_MISSION_MAPS)) {
    assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.png$`));
  }
});
