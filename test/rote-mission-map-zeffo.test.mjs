import test from "node:test";
import assert from "node:assert/strict";

import { normalizedRoteMissionsForPlanet } from "../public/rote-mission-node-eligibility.js";
import {
  ROTE_ZEFFO_MISSION_MAP,
  ROTE_ZEFFO_MISSION_MAP_SOURCE,
  roteZeffoMissionMap,
} from "../public/rote-mission-map-zeffo-data.js";

const VALID_TYPES = new Set(["combat", "fleet", "special", "deployment", "operations"]);

test("Zeffo remains a standalone bonus mission map", () => {
  assert.equal(ROTE_ZEFFO_MISSION_MAP.id, "zeffo");
  assert.equal(ROTE_ZEFFO_MISSION_MAP.nodes.length, 7);
  assert.equal(roteZeffoMissionMap("zeffo"), ROTE_ZEFFO_MISSION_MAP);
  assert.equal(roteZeffoMissionMap("tatooine"), null);
});

test("Zeffo source node positions and mission types remain valid", () => {
  const ids = new Set();
  for (const node of ROTE_ZEFFO_MISSION_MAP.nodes) {
    assert.ok(node.top >= 0 && node.top <= 95, `${node.id} top must fit map`);
    assert.ok(node.left >= 0 && node.left <= 95, `${node.id} left must fit map`);
    assert.ok(VALID_TYPES.has(node.type), `${node.id} type unsupported`);
    assert.ok(!ids.has(node.id), `${node.id} duplicated`);
    ids.add(node.id);
    assert.match(node.requirement, /Relic 7|7★|deployment/i);
  }
});

test("all five Zeffo playable nodes link to tactical recommendations", () => {
  const missions = new Map(normalizedRoteMissionsForPlanet("zeffo").map((mission) => [mission.id, mission]));
  const linked = ROTE_ZEFFO_MISSION_MAP.nodes.filter((node) => node.missionId || node.teamId);
  assert.equal(linked.length, 5);
  for (const node of linked) {
    assert.ok(node.missionId && node.teamId, `${node.id} links must be all-or-nothing`);
    const mission = missions.get(node.missionId);
    assert.ok(mission, `missing mission ${node.missionId}`);
    assert.ok(mission.recommendations.some((recommendation) => recommendation.id === node.teamId), `missing recommendation ${node.teamId}`);
    assert.ok(mission.tactical?.commandTag);
    assert.ok(mission.recommendations.every((recommendation) => recommendation.name.startsWith("ROTE-ZEFFO-")));
  }
});

test("Zeffo tactical labels expose AT-ST, Tomb Guardians and Second Sister", () => {
  const missions = new Map(normalizedRoteMissionsForPlanet("zeffo").map((mission) => [mission.id, mission]));
  assert.match(missions.get("zeffo-ufu")?.name || "", /Purge Troopers.*AT-ST/);
  assert.match(missions.get("zeffo-clones")?.name || "", /Tomb Guardians.*Chiata/);
  assert.match(missions.get("zeffo-generic-1")?.name || "", /Haxion Brood.*Tomb Guardians/);
  assert.match(missions.get("zeffo-jkck")?.name || "", /Second Sister/);
  assert.match(missions.get("zeffo-fleet")?.name || "", /Malevolence/);
});

test("Clone special retains the verified stun warning while using source squad options", () => {
  const clones = ROTE_ZEFFO_MISSION_MAP.nodes.find((node) => node.id === "c3");
  const mission = normalizedRoteMissionsForPlanet("zeffo").find((entry) => entry.id === "zeffo-clones");
  assert.equal(clones.missionId, "zeffo-clones");
  assert.equal(clones.teamId, "rote-zeffo-clones-crex");
  assert.match(clones.note, /cannot be defeated unless stunned/i);
  assert.equal(mission?.tactical?.commandTag, "CLONES | STUN TOMB GUARDIANS");
  assert.ok(mission?.recommendations.length >= 3);
});

test("JKCK triple-value mission is now linked to the complete source JKCK team", () => {
  const jkck = ROTE_ZEFFO_MISSION_MAP.nodes.find((node) => node.id === "c8");
  assert.ok(jkck);
  assert.equal(jkck.missionId, "zeffo-jkck");
  assert.equal(jkck.teamId, "rote-zeffo-jkck");
  assert.match(jkck.requirement, /Jedi Knight Cal Kestis/);
  assert.match(jkck.reward, /487,500 → 1,023,750 TP/);
});

test("Zeffo deployment exposes unlock-tier thresholds rather than normal three-star labels", () => {
  const deployment = ROTE_ZEFFO_MISSION_MAP.nodes.find((node) => node.id === "c7");
  assert.ok(deployment);
  assert.match(deployment.reward, /Tier 1: 143,589,583/);
  assert.match(deployment.reward, /Tier 2: 229,743,333/);
  assert.match(deployment.reward, /1★: 287,179,167/);
});

test("Zeffo source provenance is pinned and current evidence is explicit", () => {
  assert.equal(ROTE_ZEFFO_MISSION_MAP_SOURCE.revision, "932c5d4d2e7a29b23baa37f759cd1254459a97a2");
  assert.match(ROTE_ZEFFO_MISSION_MAP_SOURCE.currentRequirements, /^https:\/\/swgoh\.wiki\//);
  assert.match(ROTE_ZEFFO_MISSION_MAP_SOURCE.currentRewards, /^https:\/\/swgoh\.gg\//);
  assert.match(ROTE_ZEFFO_MISSION_MAP.background, /\/media\/planets\/zeffo\.png$/);
});
