import test from "node:test";
import assert from "node:assert/strict";

import { ROTE_P2_MISSION_MAPS, ROTE_P2_MISSION_MAP_SOURCE } from "../public/rote-mission-map-p2-data.js";
import {
  normalizedRoteMissionsForPlanet,
  resolveRoteMissionNodes,
} from "../public/rote-mission-node-eligibility.js";

const missionById = () => new Map(normalizedRoteMissionsForPlanet("geonosis").map((mission) => [mission.id, mission]));

test("Geonosis P2 generic combat missions expose named beast encounters", () => {
  const missions = missionById();
  assert.equal(missions.get("geonosis-generic-1")?.name, "Combat · Nexu");
  assert.equal(missions.get("geonosis-generic-2")?.name, "Combat · Acklay");
  assert.equal(missions.get("geonosis-generic-3")?.name, "Combat · Reek");

  assert.deepEqual(missions.get("geonosis-generic-1")?.enemies, ["Nexu"]);
  assert.deepEqual(missions.get("geonosis-generic-2")?.enemies, ["Acklay"]);
  assert.deepEqual(missions.get("geonosis-generic-3")?.enemies, ["Reek"]);
});

test("Geonosis tactical details include concise guild command tags and squad preset names", () => {
  const missions = missionById();
  const nexu = missions.get("geonosis-generic-1");
  const acklay = missions.get("geonosis-generic-2");
  const reek = missions.get("geonosis-generic-3");
  const geos = missions.get("geonosis-geos");
  const fleet = missions.get("geonosis-fleet");

  assert.equal(nexu?.tactical?.commandTag, "NEXU | SLKR / LV");
  assert.equal(acklay?.tactical?.commandTag, "ACKLAY | SLKR / LV / BH+WAT / INQS");
  assert.equal(reek?.tactical?.commandTag, "REEK | SEE+WAT / INQS / LV / SLKR / TRENCH");
  assert.equal(geos?.tactical?.commandTag, "GEOS | GBA LEAD");
  assert.equal(fleet?.tactical?.commandTag, "FLEET | LEVIATHAN");

  assert.deepEqual(nexu?.recommendations.map((entry) => entry.name), [
    "ROTE-P2-GEO-NEXU-SLKR",
    "ROTE-P2-GEO-NEXU-LV",
  ]);
  assert.ok(acklay?.recommendations.some((entry) => entry.name === "ROTE-P2-GEO-ACKLAY-BH-WAT"));
  assert.ok(reek?.recommendations.some((entry) => entry.name === "ROTE-P2-GEO-REEK-SEE-WAT"));
  assert.ok(reek?.recommendations.some((entry) => entry.name === "ROTE-P2-GEO-REEK-TRENCH"));
  assert.equal(geos?.recommendations[0]?.name, "ROTE-P2-GEO-GEOS");
  assert.equal(fleet?.recommendations[0]?.name, "ROTE-P2-GEO-FLEET-LEVIATHAN");

  for (const mission of [nexu, acklay, reek, geos, fleet]) {
    assert.equal(mission?.tactical?.sourceId, "genskaar-rote");
    assert.equal(mission?.tactical?.sourceRevision, ROTE_P2_MISSION_MAP_SOURCE.revision);
    assert.equal(mission?.tactical?.lastVerified, "2026-08-19");
    assert.ok(mission?.recommendations.every((entry) => entry.confidence === "community"));
    assert.ok(mission?.recommendations.every((entry) => entry.verifiedLegal === false));
  }
});

test("resolved map nodes surface the tactical command and squad preset directly in mission details", () => {
  const resolved = resolveRoteMissionNodes("geonosis", ROTE_P2_MISSION_MAPS.geonosis);
  const byNode = new Map(resolved.nodes.map((node) => [node.id, node]));

  assert.equal(byNode.get("c1")?.mission?.name, "Combat · Nexu");
  assert.equal(byNode.get("c2")?.mission?.name, "Combat · Acklay");
  assert.equal(byNode.get("c3")?.mission?.name, "Combat · Reek");
  assert.match(byNode.get("c5")?.mission?.name || "", /Geonosians/);
  assert.match(byNode.get("c6")?.mission?.name || "", /Malevolence/);

  assert.match(byNode.get("c1")?.note || "", /TACTICAL: NEXU \| SLKR \/ LV/);
  assert.match(byNode.get("c1")?.note || "", /SQUAD PRESET: ROTE-P2-GEO-NEXU/);
  assert.match(byNode.get("c2")?.note || "", /TACTICAL: ACKLAY/);
  assert.match(byNode.get("c3")?.note || "", /TACTICAL: REEK/);
  assert.match(byNode.get("c5")?.note || "", /SQUAD PRESET: ROTE-P2-GEO-GEOS/);

  assert.deepEqual(resolved.unresolvedNodeIds, []);
  assert.deepEqual(resolved.unassignedMissionIds, []);
});
