import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_MISSIONS_BY_PLANET } from "../public/rote-mission-data.js";
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

test("only the verified Clone special is linked to live preparation", () => {
  const linked = ROTE_ZEFFO_MISSION_MAP.nodes.filter((node) => node.missionId || node.teamId);
  assert.equal(linked.length, 1);
  const clones = linked[0];
  assert.equal(clones.id, "c3");
  assert.equal(clones.missionId, "zeffo-clones");
  assert.equal(clones.teamId, "rote-clones");

  const mission = (ROTE_MISSIONS_BY_PLANET.zeffo || []).find((entry) => entry.id === clones.missionId);
  assert.ok(mission);
  assert.ok(mission.recommendations.some((recommendation) => recommendation.id === clones.teamId));
});

test("JKCK triple-value mission remains source-only without an invented recommendation", () => {
  const jkck = ROTE_ZEFFO_MISSION_MAP.nodes.find((node) => node.id === "c8");
  assert.ok(jkck);
  assert.equal(jkck.missionId, "");
  assert.equal(jkck.teamId, "");
  assert.match(jkck.requirement, /Jedi Knight Cal Kestis/);
  assert.match(jkck.reward, /487,500 → 1,023,750 TP/);
  assert.match(jkck.note, /no explicit roster recommendation/);
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
