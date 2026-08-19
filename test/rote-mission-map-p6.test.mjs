import test from "node:test";
import assert from "node:assert/strict";

import { normalizedRoteMissionsForPlanet } from "../public/rote-mission-node-eligibility.js";
import { ROTE_P6_MISSION_MAPS, ROTE_P6_MISSION_MAP_SOURCE } from "../public/rote-mission-map-p6-data.js";

const EXPECTED_PLANETS = ["death-star", "hoth", "scarif"];
const VALID_TYPES = new Set(["combat", "fleet", "special", "deployment", "operations"]);

test("P6 mission map covers Death Star, Hoth and Scarif with seven source nodes each", () => {
  assert.deepEqual(Object.keys(ROTE_P6_MISSION_MAPS).sort(), EXPECTED_PLANETS);
  for (const planetId of EXPECTED_PLANETS) assert.equal(ROTE_P6_MISSION_MAPS[planetId].nodes.length, 7, `${planetId} should preserve seven source nodes`);
});

test("P6 source node coordinates, types and R9 character gates remain valid", () => {
  for (const [planetId, map] of Object.entries(ROTE_P6_MISSION_MAPS)) {
    const ids = new Set();
    for (const node of map.nodes) {
      assert.ok(node.top >= 0 && node.top <= 95, `${planetId}/${node.id} top must fit map`);
      assert.ok(node.left >= 0 && node.left <= 95, `${planetId}/${node.id} left must fit map`);
      assert.ok(VALID_TYPES.has(node.type), `${planetId}/${node.id} type unsupported`);
      assert.ok(!ids.has(node.id), `${planetId}/${node.id} duplicated`);
      ids.add(node.id);
      if (!["deployment", "fleet", "operations"].includes(node.type)) assert.match(node.requirement, /Relic 9/);
      if (node.type === "fleet") assert.match(node.requirement, /7★/);
    }
  }
});

test("all P6 playable nodes map to normalized tactical mission details without fabricating missing teams", () => {
  let mapped = 0;
  let linkedTeams = 0;
  for (const [planetId, map] of Object.entries(ROTE_P6_MISSION_MAPS)) {
    const missions = new Map(normalizedRoteMissionsForPlanet(planetId).map((mission) => [mission.id, mission]));
    for (const node of map.nodes) {
      if (!node.missionId) continue;
      mapped += 1;
      const mission = missions.get(node.missionId);
      assert.ok(mission, `${planetId}/${node.id} missing mission ${node.missionId}`);
      assert.ok(mission.tactical?.commandTag, `${planetId}/${node.id} should expose a tactical command tag`);
      if (!node.teamId) {
        assert.equal(mission.recommendations.length, 0, `${planetId}/${node.id} should remain team-TBD when source recommendation is incomplete`);
        continue;
      }
      linkedTeams += 1;
      assert.ok(mission.recommendations.some((recommendation) => recommendation.id === node.teamId), `${planetId}/${node.id} missing recommendation ${node.teamId}`);
      assert.ok(mission.recommendations.every((recommendation) => recommendation.name.startsWith("ROTE-P6-")));
    }
  }
  assert.equal(mapped, 15, "all fifteen P6 playable nodes should have exact mission mappings");
  assert.equal(linkedTeams, 11, "eleven P6 nodes have complete source/community or explicitly planning-labeled squad links");
});

test("P6 infrastructure nodes remain source-only", () => {
  const sourceOnly = Object.values(ROTE_P6_MISSION_MAPS)
    .flatMap((map) => map.nodes)
    .filter((node) => !node.missionId);
  assert.equal(sourceOnly.length, 6);
  assert.ok(sourceOnly.every((node) => node.type === "deployment" || node.type === "operations"));
});

test("Death Star Vader and Iden nodes keep exact mappings and tactical presets", () => {
  const map = ROTE_P6_MISSION_MAPS["death-star"];
  const vader = map.nodes.find((node) => node.id === "c2");
  const iden = map.nodes.find((node) => node.id === "c6");
  assert.deepEqual([vader.top, vader.left], [28, 47]);
  assert.equal(vader.missionId, "death-star-vader");
  assert.equal(vader.teamId, "rote-p6-ds-vader-solo");
  assert.match(vader.requirement, /Darth Vader/);
  assert.deepEqual([iden.top, iden.left], [50, 19]);
  assert.equal(iden.missionId, "death-star-iden");
  assert.equal(iden.teamId, "rote-p6-ds-iden");
  assert.match(iden.requirement, /Iden Versio/);
});

test("Hoth Aphra uses the current Special Mission type rather than stale source combat typing", () => {
  const aphra = ROTE_P6_MISSION_MAPS.hoth.nodes.find((node) => node.id === "c4");
  const jabba = ROTE_P6_MISSION_MAPS.hoth.nodes.find((node) => node.id === "c6");
  assert.equal(aphra.type, "special");
  assert.notEqual(aphra.type, "combat");
  assert.match(aphra.requirement, /Doctor Aphra/);
  assert.match(aphra.requirement, /BT-1/);
  assert.match(aphra.requirement, /0-0-0/);
  assert.equal(aphra.missionId, "hoth-aphra");
  assert.equal(aphra.teamId, "rote-p6-hot-aphra");
  assert.match(aphra.note, /current mission typing overrides the stale source type/i);
  assert.equal(jabba.missionId, "hoth-jabba");
  assert.equal(jabba.teamId, "rote-p6-hot-jabba");
});

test("Scarif required Rogue One nodes stay honest about source confidence", () => {
  const cassian = ROTE_P6_MISSION_MAPS.scarif.nodes.find((node) => node.id === "c2");
  const baze = ROTE_P6_MISSION_MAPS.scarif.nodes.find((node) => node.id === "c6");
  assert.match(cassian.requirement, /Cassian Andor/);
  assert.match(cassian.requirement, /Pao/);
  assert.match(cassian.requirement, /K-2SO/);
  assert.equal(cassian.missionId, "scarif-cassian");
  assert.equal(cassian.teamId, "rote-p6-sca-cassian-plan");
  assert.match(baze.requirement, /Baze Malbus/);
  assert.match(baze.requirement, /Chirrut Îmwe/);
  assert.match(baze.requirement, /Scarif Rebel Pathfinder/);
  assert.equal(baze.missionId, "scarif-baze");
  assert.equal(baze.teamId, "rote-p6-sca-baze-plan");

  const missions = new Map(normalizedRoteMissionsForPlanet("scarif").map((mission) => [mission.id, mission]));
  for (const id of ["scarif-cassian", "scarif-baze"]) {
    assert.ok(missions.get(id)?.recommendations.every((recommendation) => recommendation.confidence === "unknown"));
  }
});

test("P6 tactical labels expose Wampas, Cartel and major fleet encounters", () => {
  const deathStar = new Map(normalizedRoteMissionsForPlanet("death-star").map((mission) => [mission.id, mission]));
  const hoth = new Map(normalizedRoteMissionsForPlanet("hoth").map((mission) => [mission.id, mission]));
  const scarif = new Map(normalizedRoteMissionsForPlanet("scarif").map((mission) => [mission.id, mission]));

  assert.match(deathStar.get("death-star-fleet")?.name || "", /Home One/);
  assert.match(hoth.get("hoth-generic-1")?.name || "", /Wampas/);
  assert.match(hoth.get("hoth-aphra")?.name || "", /Sana/);
  assert.match(hoth.get("hoth-jabba")?.name || "", /Dash Rendar/);
  assert.match(scarif.get("scarif-fleet")?.name || "", /Chimaera/);
  assert.match(scarif.get("scarif-generic-1")?.name || "", /Imperial Forces/);
});

test("P6 fleet values, Operations values and territory thresholds remain phase-correct", () => {
  for (const map of Object.values(ROTE_P6_MISSION_MAPS)) {
    const fleet = map.nodes.find((node) => node.type === "fleet");
    const operations = map.nodes.find((node) => node.type === "operations");
    assert.equal(fleet.reward, "2,303,438 TP");
    assert.match(operations.reward, /86,486,400/);
    assert.match(operations.reward, /518,918,400/);
  }

  const deathDeploy = ROTE_P6_MISSION_MAPS["death-star"].nodes.find((node) => node.type === "deployment");
  const hothDeploy = ROTE_P6_MISSION_MAPS.hoth.nodes.find((node) => node.type === "deployment");
  const scarifDeploy = ROTE_P6_MISSION_MAPS.scarif.nodes.find((node) => node.type === "deployment");
  for (const deployment of [deathDeploy, hothDeploy]) {
    assert.match(deployment.reward, /1★ 582,632,425/);
    assert.match(deployment.reward, /2★ 1,059,331,682/);
    assert.match(deployment.reward, /3★ 1,246,272,567/);
  }
  assert.match(scarifDeploy.reward, /1★ 555,710,999/);
  assert.match(scarifDeploy.reward, /2★ 1,010,383,635/);
  assert.match(scarifDeploy.reward, /3★ 1,188,686,629/);
});

test("P6 source provenance, current evidence and exact source background filenames are pinned", () => {
  assert.equal(ROTE_P6_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_P6_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P6_MISSION_MAP_SOURCE.currentOperations, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_P6_MISSION_MAP_SOURCE.currentRewards, /^https:\/\/swgoh\.gg\//);
  assert.match(ROTE_P6_MISSION_MAPS["death-star"].background, /\/media\/planets\/deathstar\.png$/);
  assert.match(ROTE_P6_MISSION_MAPS.hoth.background, /\/media\/planets\/hoth\.png$/);
  assert.match(ROTE_P6_MISSION_MAPS.scarif.background, /\/media\/planets\/scarif\.png$/);
});
