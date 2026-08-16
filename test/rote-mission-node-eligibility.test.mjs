import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_PLANETS } from "../public/rote-map-data.js";
import { roteMissionMap } from "../public/rote-mission-map-registry.js";
import {
  isRoteInfrastructureNode,
  missionEntryRule,
  missionRosterEligibility,
  normalizedRoteMissionsForPlanet,
  resolveRoteMissionNodes,
} from "../public/rote-mission-node-eligibility.js";

const unit = (baseId, name, overrides = {}) => ({
  baseId,
  name,
  unitType: "Character",
  stars: 7,
  relic: 9,
  gear: 13,
  power: 30000,
  speed: 250,
  alignment: "Light",
  factions: [],
  categories: [],
  ...overrides,
});

test("every source mission node across all 20 ROTE planets resolves to one mission record", () => {
  assert.equal(ROTE_PLANETS.length, 20);
  for (const planet of ROTE_PLANETS) {
    const map = roteMissionMap(planet.id);
    assert.ok(map, `${planet.id} source map missing`);
    const resolved = resolveRoteMissionNodes(planet.id, map);
    assert.deepEqual(resolved.unresolvedNodeIds, [], `${planet.id} has unresolved source mission nodes`);
    assert.deepEqual(resolved.unassignedMissionIds, [], `${planet.id} has mission records not represented on the source map`);

    const missionNodes = resolved.nodes.filter((node) => !isRoteInfrastructureNode(node));
    assert.equal(missionNodes.length, resolved.missions.length, `${planet.id} mission-node count must equal mission-record count`);
    assert.equal(new Set(missionNodes.map((node) => node.missionId)).size, missionNodes.length, `${planet.id} mission nodes must map one-to-one`);
  }
});

test("Corellia Qi'ra special exposes required units separately from the legal pool", () => {
  const map = resolveRoteMissionNodes("corellia", roteMissionMap("corellia"));
  const qiraNode = map.nodes.find((node) => node.missionId === "corellia-qira");
  assert.ok(qiraNode, "Corellia Qi'ra source node should resolve");
  const rule = missionEntryRule(qiraNode.mission);
  assert.equal(rule.unitType, "Character");
  assert.equal(rule.squadSize, 5);
  assert.deepEqual(rule.threshold, ["7★", "R5+"]);
  assert.deepEqual(rule.mandatory.map((member) => member.baseId), ["QIRA", "YOUNGHAN"]);

  const body = {
    units: [
      unit("QIRA", "Qi'ra", { relic: 5, alignment: "Light" }),
      unit("YOUNGHAN", "Young Han Solo", { relic: 5, alignment: "Light" }),
      unit("VADER", "Darth Vader", { relic: 5, alignment: "Dark" }),
      unit("JEDIKNIGHTREVAN", "Jedi Knight Revan", { relic: 5, alignment: "Light", factions: ["Jedi"] }),
      unit("BOBAFETT", "Boba Fett", { relic: 5, alignment: "Dark" }),
      unit("LOWGEAR", "Below Gate", { relic: 4, alignment: "Light" }),
    ],
    ships: [],
  };
  const eligibility = missionRosterEligibility(body, qiraNode.mission);
  assert.equal(eligibility.ready, true);
  assert.equal(eligibility.mandatory.length, 2);
  assert.ok(eligibility.mandatory.every((row) => row.legal));
  assert.deepEqual(
    eligibility.candidates.map((candidate) => candidate.baseId).sort(),
    ["BOBAFETT", "JEDIKNIGHTREVAN", "QIRA", "VADER", "YOUNGHAN"].sort(),
  );
});

test("category missions return only units that are actually legal for that mission", () => {
  const mission = normalizedRoteMissionsForPlanet("coruscant").find((item) => item.id === "coruscant-jedi");
  const body = {
    units: [
      unit("JEDIKNIGHTREVAN", "Jedi Knight Revan", { relic: 5, factions: ["Jedi"] }),
      unit("MACEWINDU", "Mace Windu", { relic: 5, categories: ["Jedi"] }),
      unit("HANSOLO", "Han Solo", { relic: 5, factions: ["Rebel"] }),
      unit("VADER", "Darth Vader", { relic: 9, alignment: "Dark", factions: ["Empire", "Sith"] }),
    ],
    ships: [],
  };
  const eligibility = missionRosterEligibility(body, mission);
  assert.deepEqual(eligibility.candidates.map((candidate) => candidate.baseId).sort(), ["JEDIKNIGHTREVAN", "MACEWINDU"].sort());
  assert.deepEqual(eligibility.rule.categories, ["Jedi"]);
});

test("Bracca unlock preserves the exact Cere plus Cal-only slot pool", () => {
  const mission = normalizedRoteMissionsForPlanet("bracca").find((item) => item.id === "bracca-zeffo-unlock");
  const rule = missionEntryRule(mission);
  assert.equal(rule.squadSize, 2);
  assert.equal(rule.mandatory[0].baseId, "CEREJUNDA");
  assert.deepEqual(rule.allowedBaseIds, ["CEREJUNDA", "CALKESTIS", "JEDIKNIGHTCAL"]);
  assert.deepEqual(rule.threshold, ["7★", "R7+"]);
});

test("Tatooine Mandalore unlock override is exactly three Mandalorians with two mandatory units", () => {
  const mission = normalizedRoteMissionsForPlanet("tatooine").find((item) => item.id === "tatooine-mandalore-unlock");
  const rule = missionEntryRule(mission);
  assert.equal(rule.squadSize, 3);
  assert.deepEqual(rule.categories, ["Mandalorian"]);
  assert.deepEqual(rule.mandatory.map((member) => member.baseId), ["MANDALORBOKATAN", "THEMANDALORIANBESKARARMOR"]);
  assert.deepEqual(rule.allowedBaseIds, []);
});

test("Mandalore Bo-Katan keeps her R9 mandatory override above the planet R8 baseline", () => {
  const mission = normalizedRoteMissionsForPlanet("mandalore").find((item) => item.id === "mandalore-bkm");
  const rule = missionEntryRule(mission);
  assert.equal(rule.threshold.at(-1), "R8+");
  assert.equal(rule.mandatory[0].baseId, "MANDALORBOKATAN");
  assert.equal(rule.mandatory[0].relicMin, 9);

  const body = {
    units: [
      unit("MANDALORBOKATAN", "Bo-Katan (Mand'alor)", { relic: 8 }),
      unit("THEMANDALORIANBESKARARMOR", "The Mandalorian (Beskar Armor)", { relic: 8 }),
      unit("PAZVIZSLA", "Paz Vizsla", { relic: 8 }),
      unit("IG12", "IG-12 & Grogu", { relic: 8 }),
      unit("ARMORER", "The Armorer", { relic: 8 }),
    ],
    ships: [],
  };
  const eligibility = missionRosterEligibility(body, mission);
  assert.equal(eligibility.mandatory[0].legal, false);
  assert.equal(eligibility.ready, false);
});
