import test from "node:test";
import assert from "node:assert/strict";

import { normalizedRoteMissionsForPlanet } from "../public/rote-mission-node-eligibility.js";
import {
  ROTE_MANDALORE_MISSION_MAP,
  ROTE_MANDALORE_MISSION_MAP_SOURCE,
  roteMandaloreMissionMap,
} from "../public/rote-mission-map-mandalore-data.js";

const VALID_TYPES = new Set(["combat", "fleet", "deployment", "operations"]);

test("Mandalore remains a standalone six-node bonus mission map", () => {
  assert.equal(ROTE_MANDALORE_MISSION_MAP.id, "mandalore");
  assert.equal(ROTE_MANDALORE_MISSION_MAP.nodes.length, 6);
  assert.equal(roteMandaloreMissionMap("mandalore"), ROTE_MANDALORE_MISSION_MAP);
  assert.equal(roteMandaloreMissionMap("lothal"), null);
});

test("Mandalore source node positions and mission types remain valid", () => {
  const ids = new Set();
  for (const node of ROTE_MANDALORE_MISSION_MAP.nodes) {
    assert.ok(node.top >= 0 && node.top <= 95, `${node.id} top must fit map`);
    assert.ok(node.left >= 0 && node.left <= 95, `${node.id} left must fit map`);
    assert.ok(VALID_TYPES.has(node.type), `${node.id} type unsupported`);
    assert.ok(!ids.has(node.id), `${node.id} duplicated`);
    ids.add(node.id);
  }
});

test("all four Mandalore playable nodes link to tactical recommendations", () => {
  const missions = new Map(normalizedRoteMissionsForPlanet("mandalore").map((mission) => [mission.id, mission]));
  const linked = ROTE_MANDALORE_MISSION_MAP.nodes.filter((node) => node.missionId || node.teamId);
  assert.equal(linked.length, 4);
  for (const node of linked) {
    assert.ok(node.missionId && node.teamId, `${node.id} links must be all-or-nothing`);
    const mission = missions.get(node.missionId);
    assert.ok(mission, `missing mission ${node.missionId}`);
    assert.ok(mission.recommendations.some((recommendation) => recommendation.id === node.teamId), `missing recommendation ${node.teamId}`);
    assert.ok(mission.tactical?.commandTag);
    assert.ok(mission.recommendations.every((recommendation) => recommendation.name.startsWith("ROTE-MANDO-")));
  }
});

test("Bo-Katan Mand'alor keeps the explicit R9 exception and high-value reward", () => {
  const bkm = ROTE_MANDALORE_MISSION_MAP.nodes.find((node) => node.id === "c3");
  assert.ok(bkm);
  assert.equal(bkm.type, "combat");
  assert.match(bkm.requirement, /Mandalorians at Relic 9\+/);
  assert.match(bkm.requirement, /Bo-Katan \(Mand'alor\)/);
  assert.doesNotMatch(bkm.requirement, /Relic 8/);
  assert.equal(bkm.reward, "658,125 → 1,480,782 TP");
  assert.equal(bkm.missionId, "mandalore-bkm");
  assert.equal(bkm.teamId, "rote-mando-bkm");
  assert.match(bkm.note, /explicit R9 exception/);
});

test("DTMG, generic combat and Operations retain the R8 Mandalore baseline", () => {
  const dtmg = ROTE_MANDALORE_MISSION_MAP.nodes.find((node) => node.id === "c6");
  const generic = ROTE_MANDALORE_MISSION_MAP.nodes.find((node) => node.id === "c2");
  const operations = ROTE_MANDALORE_MISSION_MAP.nodes.find((node) => node.id === "m2");
  assert.match(dtmg.requirement, /Relic 8\+/);
  assert.match(dtmg.requirement, /Dark Trooper Moff Gideon/);
  assert.equal(dtmg.missionId, "mandalore-dtmg");
  assert.equal(dtmg.teamId, "rote-mando-dtmg");
  assert.match(generic.requirement, /Relic 8\+/);
  assert.equal(generic.missionId, "mandalore-generic-1");
  assert.match(operations.requirement, /Relic 8/);
});

test("Mandalore tactical labels expose Negotiator, Veers, Gideon, Maul and Bo-Katan", () => {
  const missions = new Map(normalizedRoteMissionsForPlanet("mandalore").map((mission) => [mission.id, mission]));
  assert.match(missions.get("mandalore-fleet")?.name || "", /Negotiator/);
  assert.match(missions.get("mandalore-generic-1")?.name || "", /Veers.*Moff Gideon/);
  assert.match(missions.get("mandalore-bkm")?.name || "", /Veers.*DTMG/);
  assert.match(missions.get("mandalore-dtmg")?.name || "", /Maul.*Bo-Katan/);
});

test("Mandalore fleet and deployment preserve current gates and bonus thresholds", () => {
  const fleet = ROTE_MANDALORE_MISSION_MAP.nodes.find((node) => node.id === "c1");
  const deployment = ROTE_MANDALORE_MISSION_MAP.nodes.find((node) => node.id === "c7");
  assert.match(fleet.requirement, /7★/);
  assert.match(fleet.requirement, /Gauntlet Starfighter/);
  assert.equal(fleet.reward, "987,188 TP");
  assert.match(deployment.reward, /Tier 1: 197,748,650/);
  assert.match(deployment.reward, /Tier 2: 316,397,840/);
  assert.match(deployment.reward, /1★: 396,497,300/);
});

test("Mandalore source provenance and source filename typo are pinned explicitly", () => {
  assert.equal(ROTE_MANDALORE_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_MANDALORE_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_MANDALORE_MISSION_MAP_SOURCE.currentBkmMission, /^https:\/\/swgoh\.gg\//);
  assert.match(ROTE_MANDALORE_MISSION_MAP.background, /\/media\/planets\/manalore\.png$/);
  assert.doesNotMatch(ROTE_MANDALORE_MISSION_MAP.background, /\/media\/planets\/mandalore\.png$/);
});
