import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
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

test("P6 live-preparation links resolve only to six explicit existing recommendations", () => {
  let linked = 0;
  for (const [planetId, map] of Object.entries(ROTE_P6_MISSION_MAPS)) {
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
  assert.equal(linked, 6, "only Vader, Iden, Aphra, Jabba and the two required Scarif missions should be linked");
});

test("Death Star Vader and Iden nodes keep exact mappings and source coordinates", () => {
  const map = ROTE_P6_MISSION_MAPS["death-star"];
  const vader = map.nodes.find((node) => node.id === "c2");
  const iden = map.nodes.find((node) => node.id === "c6");
  assert.deepEqual([vader.top, vader.left], [28, 47]);
  assert.equal(vader.missionId, "death-star-vader");
  assert.equal(vader.teamId, "rote-lv");
  assert.match(vader.requirement, /Darth Vader/);
  assert.deepEqual([iden.top, iden.left], [50, 19]);
  assert.equal(iden.missionId, "death-star-iden");
  assert.equal(iden.teamId, "rote-iden");
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
  assert.equal(aphra.teamId, "rote-aphra");
  assert.match(aphra.note, /current mission typing overrides the stale source type/i);
  assert.equal(jabba.missionId, "hoth-jabba");
  assert.equal(jabba.teamId, "rote-jabba");
});

test("Scarif required Rogue One nodes preserve current required-unit groups and mappings", () => {
  const cassian = ROTE_P6_MISSION_MAPS.scarif.nodes.find((node) => node.id === "c2");
  const baze = ROTE_P6_MISSION_MAPS.scarif.nodes.find((node) => node.id === "c6");
  assert.match(cassian.requirement, /Cassian Andor/);
  assert.match(cassian.requirement, /Pao/);
  assert.match(cassian.requirement, /K-2SO/);
  assert.equal(cassian.missionId, "scarif-cassian");
  assert.equal(cassian.teamId, "rote-scarif-cassian");
  assert.match(baze.requirement, /Baze Malbus/);
  assert.match(baze.requirement, /Chirrut Îmwe/);
  assert.match(baze.requirement, /Scarif Rebel Pathfinder/);
  assert.equal(baze.missionId, "scarif-baze");
  assert.equal(baze.teamId, "rote-scarif-baze");
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
