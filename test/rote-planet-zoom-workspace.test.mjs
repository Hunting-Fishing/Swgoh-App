import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ROTE_PLANETS } from "../public/rote-map-data.js";
import { ROTE_FLEET_ENTRY_AUDIT, ROTE_FLEET_ENTRY_AUDIT_COUNT } from "../public/rote-fleet-entry-audit-data.js";
import { roteMissionMap } from "../public/rote-mission-map-registry.js";
import {
  missionEntryRule,
  missionRosterEligibility,
  normalizedRoteMissionsForPlanet,
  resolveRoteMissionNodes,
} from "../public/rote-mission-node-eligibility.js";
import {
  missionTypeConflict,
  poolEvidenceLevel,
  recommendationBaseIds,
} from "../public/rote-planet-zoom-workspace.js";

const ship = (baseId, name = baseId, overrides = {}) => ({
  baseId,
  name,
  unitType: "Ship",
  stars: 7,
  power: 100000,
  alignment: "Light",
  factions: [],
  categories: [],
  ...overrides,
});

function allNormalizedFleetMissions() {
  return ROTE_PLANETS.flatMap((planet) => normalizedRoteMissionsForPlanet(planet.id)).filter((mission) => mission.missionType === "fleet");
}

test("all 17 ROTE fleet entry pools are source-audited and presented as exact", () => {
  const fleets = allNormalizedFleetMissions();
  assert.equal(ROTE_FLEET_ENTRY_AUDIT_COUNT, 17);
  assert.equal(fleets.length, 17);
  assert.deepEqual(fleets.map((mission) => mission.id).sort(), Object.keys(ROTE_FLEET_ENTRY_AUDIT).sort());

  for (const mission of fleets) {
    const audit = ROTE_FLEET_ENTRY_AUDIT[mission.id];
    assert.ok(audit, `${mission.id} audit missing`);
    const rule = missionEntryRule(mission);
    assert.equal(rule.unitType, "Ship", `${mission.id} must remain a fleet rule`);
    assert.deepEqual(rule.threshold, ["7★"], `${mission.id} star gate changed`);
    assert.deepEqual(rule.alignments, [...audit.allowedAlignments], `${mission.id} alignment gate changed`);
    assert.deepEqual(rule.mandatory.map((member) => member.baseId), audit.mandatoryMembers.map((member) => member.baseId), `${mission.id} mandatory ship changed`);
    assert.equal(poolEvidenceLevel(rule), "exact", `${mission.id} should no longer degrade to gate-only evidence`);
    assert.ok(mission.sources.includes("swgoh-wiki-rote-zones"), `${mission.id} wiki source missing`);
    assert.ok(mission.sources.includes("genskaar-rote"), `${mission.id} GenSkaar source missing`);
    assert.match(mission.entry.notes, /^Audited fleet entry:/, `${mission.id} audit note missing`);
  }
});

test("fleet side restrictions intersect the actual roster instead of recommended fleet templates", () => {
  const mustafar = normalizedRoteMissionsForPlanet("mustafar").find((mission) => mission.id === "mustafar-fleet");
  const bracca = normalizedRoteMissionsForPlanet("bracca").find((mission) => mission.id === "bracca-fleet");
  const felucia = normalizedRoteMissionsForPlanet("felucia").find((mission) => mission.id === "felucia-fleet");
  const body = {
    units: [],
    ships: [
      ship("SCYTHE", "Scythe", { alignment: "Dark" }),
      ship("DARKSHIP", "Dark Ship", { alignment: "Dark" }),
      ship("LIGHTSHIP", "Light Ship", { alignment: "Light" }),
      ship("NEUTRALSHIP", "Neutral Ship", { alignment: "Neutral" }),
      ship("LOWSTAR", "Below Gate", { alignment: "Dark", stars: 6 }),
    ],
  };

  assert.deepEqual(
    missionRosterEligibility(body, mustafar).candidates.map((unit) => unit.baseId).sort(),
    ["DARKSHIP", "SCYTHE"].sort(),
  );
  assert.deepEqual(
    missionRosterEligibility(body, bracca).candidates.map((unit) => unit.baseId),
    ["LIGHTSHIP"],
  );
  assert.deepEqual(
    missionRosterEligibility(body, felucia).candidates.map((unit) => unit.baseId).sort(),
    ["DARKSHIP", "LIGHTSHIP", "NEUTRALSHIP", "SCYTHE"].sort(),
  );
});

test("named fleet requirements resolve by canonical Base ID and remain mandatory", () => {
  const cases = [
    ["mustafar", "mustafar-fleet", "SCYTHE"],
    ["corellia", "corellia-fleet", "MILLENNIUMFALCONPRISTINE"],
    ["coruscant", "coruscant-fleet", "OUTRIDER"],
    ["tatooine", "tatooine-fleet", "CAPITALEXECUTOR"],
    ["kashyyyk", "kashyyyk-fleet", "CAPITALPROFUNDITY"],
    ["zeffo", "zeffo-fleet", "CAPITALNEGOTIATOR"],
    ["kessel", "kessel-fleet", "GHOST"],
    ["mandalore", "mandalore-fleet", "GAUNTLETSTARFIGHTER"],
    ["death-star", "death-star-fleet", "TIEFIGHTERIMPERIAL"],
    ["scarif", "scarif-fleet", "CAPITALPROFUNDITY"],
  ];

  for (const [planetId, missionId, baseId] of cases) {
    const mission = normalizedRoteMissionsForPlanet(planetId).find((item) => item.id === missionId);
    const rule = missionEntryRule(mission);
    assert.ok(rule.mandatory.some((member) => member.baseId === baseId), `${missionId} should require ${baseId}`);
  }
});

test("character pools and audited fleet pools are both presented as exact", () => {
  const qira = resolveRoteMissionNodes("corellia", roteMissionMap("corellia")).nodes.find((node) => node.missionId === "corellia-qira");
  const genericFleet = resolveRoteMissionNodes("felucia", roteMissionMap("felucia")).nodes.find((node) => node.mission?.missionType === "fleet");
  assert.equal(poolEvidenceLevel(missionEntryRule(qira.mission)), "exact");
  assert.equal(poolEvidenceLevel(missionEntryRule(genericFleet.mission)), "exact");
});

test("Hondo mission-type disagreement is surfaced while Reva marker alias is not treated as a conflict", () => {
  const felucia = resolveRoteMissionNodes("felucia", roteMissionMap("felucia"));
  const hondo = felucia.nodes.find((node) => node.missionId === "felucia-hondo");
  assert.ok(hondo);
  assert.equal(hondo.type, "combat");
  assert.equal(hondo.mission.missionType, "special");
  assert.equal(missionTypeConflict(hondo), true);

  const tatooine = resolveRoteMissionNodes("tatooine", roteMissionMap("tatooine"));
  const reva = tatooine.nodes.find((node) => node.missionId === "tatooine-reva");
  assert.equal(reva.type, "reva");
  assert.equal(reva.mission.missionType, "special");
  assert.equal(missionTypeConflict(reva), false);
});

test("recommended-team loader resolves missing Base IDs from the static catalog by unit name", () => {
  const byId = new Map([
    ["QIRA", { baseId: "QIRA", name: "Qi'ra" }],
    ["YOUNGHAN", { baseId: "YOUNGHAN", name: "Young Han Solo" }],
  ]);
  const byName = new Map([
    ["qi ra", { baseId: "QIRA", name: "Qi'ra" }],
    ["young han solo", { baseId: "YOUNGHAN", name: "Young Han Solo" }],
  ]);
  const recommendation = {
    members: [
      { name: "Qi'ra", baseId: "" },
      { name: "Young Han Solo", baseId: "YOUNGHAN" },
    ],
  };
  assert.deepEqual(recommendationBaseIds(recommendation, { byId, byName }), ["QIRA", "YOUNGHAN"]);
});

test("zoom workspace retires the side board and opens mission detail as a floating popup on the full planet map", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/rote-planet-zoom-workspace.css", import.meta.url), "utf8");
  const overlayCss = fs.readFileSync(new URL("../public/rote-planet-zoom-overlay.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/rote-planet-zoom-workspace.js", import.meta.url), "utf8");
  assert.match(index, /rote-planet-zoom-workspace\.css/);
  assert.match(index, /rote-planet-zoom-overlay\.css/);
  assert.match(index, /rote-planet-zoom-workspace\.js/);
  assert.match(css, /#roteMissionBoard\s*\{\s*display:\s*none\s*!important;/s);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(overlayCss, /\.rote-zoom-stage\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
  assert.match(overlayCss, /\.rote-zoom-inspector\s*\{[^}]*position:\s*absolute;[^}]*top:\s*clamp\([^}]*right:\s*clamp\([^}]*bottom:\s*auto;[^}]*max-height:\s*min\([^}]*border-radius:\s*18px;/s);
  assert.doesNotMatch(overlayCss, /\.rote-zoom-inspector\s*\{[^}]*top:\s*0;[^}]*bottom:\s*0;/s);
  assert.match(overlayCss, /@media \(max-width:\s*1080px\)[\s\S]*\.rote-zoom-inspector\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*12px;[^}]*left:\s*12px;[^}]*max-height:\s*46vh;/s);
  assert.match(js, /REQUIRED UNITS/);
  assert.match(js, /EXACT ALLOWED SET/);
  assert.match(js, /YOUR LEGAL UNITS/);
  assert.match(js, /RECOMMENDED TEAM/);
});
