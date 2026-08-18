import test from "node:test";
import assert from "node:assert/strict";

import { normalizedRoteMissionsForPlanet } from "../public/rote-mission-node-eligibility.js";
import { ROTE_P5_MISSION_MAPS, ROTE_P5_MISSION_MAP_SOURCE } from "../public/rote-mission-map-p5-data.js";

const EXPECTED_PLANETS = ["kafrene", "malachor", "vandor"];
const EXPECTED_NODE_COUNTS = Object.freeze({ malachor: 6, vandor: 7, kafrene: 7 });
const VALID_TYPES = new Set(["combat", "fleet", "special", "deployment", "operations"]);

test("P5 mission map covers only Malachor, Vandor and Ring of Kafrene", () => {
  assert.deepEqual(Object.keys(ROTE_P5_MISSION_MAPS).sort(), EXPECTED_PLANETS);
  for (const planetId of EXPECTED_PLANETS) assert.equal(ROTE_P5_MISSION_MAPS[planetId].nodes.length, EXPECTED_NODE_COUNTS[planetId]);
});

test("P5 source node positions, types and R9 mission gates remain valid", () => {
  for (const [planetId, map] of Object.entries(ROTE_P5_MISSION_MAPS)) {
    const ids = new Set();
    for (const node of map.nodes) {
      assert.ok(node.top >= 0 && node.top <= 95, `${planetId}/${node.id} top must fit map`);
      assert.ok(node.left >= 0 && node.left <= 95, `${planetId}/${node.id} left must fit map`);
      assert.ok(VALID_TYPES.has(node.type), `${planetId}/${node.id} type unsupported`);
      assert.ok(!ids.has(node.id), `${planetId}/${node.id} duplicated`);
      ids.add(node.id);
      if (!["deployment", "fleet"].includes(node.type)) assert.match(node.requirement, /Relic 9/);
    }
  }
});

test("all P5 playable nodes link to normalized tactical recommendations", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P5_MISSION_MAPS)) {
    const missions = new Map(normalizedRoteMissionsForPlanet(planetId).map((mission) => [mission.id, mission]));
    for (const node of map.nodes) {
      if (!node.missionId && !node.teamId) continue;
      linked += 1;
      assert.ok(node.missionId && node.teamId, `${planetId}/${node.id} links must be all-or-nothing`);
      const mission = missions.get(node.missionId);
      assert.ok(mission, `${planetId}/${node.id} missing mission ${node.missionId}`);
      assert.ok(mission.recommendations.some((recommendation) => recommendation.id === node.teamId), `${planetId}/${node.id} missing recommendation ${node.teamId}`);
      assert.ok(mission.tactical?.commandTag, `${planetId}/${node.id} should expose a tactical command tag`);
      assert.ok(mission.recommendations.every((recommendation) => recommendation.name.startsWith("ROTE-P5-")));
    }
  }
  assert.equal(linked, 14, "all fourteen P5 playable nodes should be linked");
});

test("P5 infrastructure nodes remain source-only", () => {
  const sourceOnly = Object.values(ROTE_P5_MISSION_MAPS)
    .flatMap((map) => map.nodes)
    .filter((node) => !node.missionId && !node.teamId);
  assert.equal(sourceOnly.length, 6);
  assert.ok(sourceOnly.every((node) => node.type === "deployment" || node.type === "operations"));
});

test("Malachor required Inquisitors remain the single restricted mission and no fleet is invented", () => {
  const map = ROTE_P5_MISSION_MAPS.malachor;
  const required = map.nodes.find((node) => node.id === "c4");
  assert.match(required.requirement, /Eighth Brother/);
  assert.match(required.requirement, /Fifth Brother/);
  assert.match(required.requirement, /Seventh Sister/);
  assert.equal(required.reward, "721,744 TP");
  assert.equal(required.missionId, "malachor-inqs");
  assert.equal(required.teamId, "rote-p5-mal-inqs");
  assert.equal(map.nodes.some((node) => node.type === "fleet"), false);
});

test("P5 tactical labels expose the major enemy encounters", () => {
  const malachor = new Map(normalizedRoteMissionsForPlanet("malachor").map((mission) => [mission.id, mission]));
  const vandor = new Map(normalizedRoteMissionsForPlanet("vandor").map((mission) => [mission.id, mission]));
  const kafrene = new Map(normalizedRoteMissionsForPlanet("kafrene").map((mission) => [mission.id, mission]));

  assert.match(malachor.get("malachor-generic-1")?.name || "", /Kanan\/Fulcrum/);
  assert.match(malachor.get("malachor-inqs")?.name || "", /Maul\/Ezra/);
  assert.match(vandor.get("vandor-generic-1")?.name || "", /Imperial Officer/);
  assert.match(vandor.get("vandor-generic-2")?.name || "", /Enfys Nest/);
  assert.match(vandor.get("vandor-yhan")?.name || "", /Snowtroopers/);
  assert.match(kafrene.get("kafrene-cassian")?.name || "", /Stormtrooper Wall/);
  assert.match(kafrene.get("kafrene-generic-2")?.name || "", /Mara Jade/);
});

test("Vandor special and fleets preserve current rewards", () => {
  const special = ROTE_P5_MISSION_MAPS.vandor.nodes.find((node) => node.id === "c3");
  const vandorFleet = ROTE_P5_MISSION_MAPS.vandor.nodes.find((node) => node.id === "c1");
  const kafreneFleet = ROTE_P5_MISSION_MAPS.kafrene.nodes.find((node) => node.id === "c1");
  assert.equal(special.type, "special");
  assert.match(special.requirement, /Young Han Solo/);
  assert.match(special.requirement, /Vandor Chewbacca/);
  assert.equal(special.reward, "20 Mk III Guild Event Tokens");
  assert.equal(vandorFleet.reward, "1,443,488 TP");
  assert.equal(kafreneFleet.reward, "1,443,488 TP");
});

test("P5 deployment thresholds and Operations values remain phase-correct", () => {
  for (const map of Object.values(ROTE_P5_MISSION_MAPS)) {
    const deployment = map.nodes.find((node) => node.type === "deployment");
    const operations = map.nodes.find((node) => node.type === "operations");
    assert.match(deployment.reward, /1★ 341,250,768/);
    assert.match(deployment.reward, /2★ 620,455,942/);
    assert.match(deployment.reward, /3★ 729,948,167/);
    assert.match(operations.reward, /33,264,000/);
    assert.match(operations.reward, /199,584,000/);
  }
});

test("P5 source provenance and current-evidence references are pinned", () => {
  assert.equal(ROTE_P5_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P5_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P5_MISSION_MAP_SOURCE.currentRewards, /^https:\/\/swgoh\.gg\//);
  for (const [planetId, map] of Object.entries(ROTE_P5_MISSION_MAPS)) assert.match(map.background, new RegExp(`/media/planets/${planetId}\\.png$`));
});
