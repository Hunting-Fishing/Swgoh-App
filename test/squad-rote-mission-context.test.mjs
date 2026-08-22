import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  assessSquadForRoteMission,
  replacementCandidates,
  squadTemplateEvidence,
} from "../public/squad-rote-mission-context-model.js";

const character = (baseId, name, factions, relic = 5, power = 20_000) => ({
  baseId,
  name,
  unitType: "Character",
  alignment: "Light",
  factions,
  categories: factions,
  stars: 7,
  gear: 13,
  relic,
  power,
  speed: 250,
});

const body = {
  units: [
    character("J1", "Jedi One", ["Jedi"], 5, 30_000),
    character("J2", "Jedi Two", ["Jedi"], 5, 29_000),
    character("J3", "Jedi Three", ["Jedi"], 5, 28_000),
    character("J4", "Jedi Four", ["Jedi"], 5, 27_000),
    character("REQ", "Required Jedi", ["Jedi"], 5, 18_000),
    character("ALT", "Alternative Jedi", ["Jedi"], 5, 26_000),
    character("BAD", "Rebel Outsider", ["Rebel"], 7, 35_000),
  ],
  ships: [],
};

const mission = {
  id: "test-jedi-mission",
  name: "Test Jedi Mission",
  missionType: "combat",
  entry: {
    verified: true,
    unitType: "Character",
    squadSize: 5,
    relicMin: 5,
    requiredCategories: ["Jedi"],
    categoryMode: "all",
    mandatoryMembers: [{ baseId: "REQ", name: "Required Jedi", relicMin: 5 }],
  },
};

test("assessment catches an individually illegal slot and an omitted mandatory unit", () => {
  const assessment = assessSquadForRoteMission(body, mission, ["J1", "J2", "J3", "J4", "BAD"], {
    name: "Planning Squad",
    verifiedLegal: false,
    members: [],
  });
  assert.equal(assessment.evidence, "exact");
  assert.equal(assessment.squadSize, 5);
  assert.equal(assessment.sizeReady, true);
  assert.equal(assessment.illegalSelected.length, 1);
  assert.equal(assessment.illegalSelected[0].member.baseId, "BAD");
  assert.equal(assessment.mandatoryMissing.length, 1);
  assert.equal(assessment.mandatoryMissing[0].baseId, "REQ");
  assert.equal(assessment.exactEntrySquad, false);
  assert.equal(assessment.template.status, "planning-template");
});

test("mandatory legal replacement is prioritized ahead of generic legal alternatives", () => {
  const assessment = assessSquadForRoteMission(body, mission, ["J1", "J2", "J3", "J4", "BAD"]);
  const candidates = replacementCandidates(assessment, "BAD", 5);
  assert.equal(candidates[0].baseId, "REQ");
  assert.ok(candidates.some((unit) => unit.baseId === "ALT"));
});

test("an exact five-unit squad with the mandatory member can satisfy the entry model", () => {
  const assessment = assessSquadForRoteMission(body, mission, ["J1", "J2", "J3", "J4", "REQ"]);
  assert.equal(assessment.illegalSelected.length, 0);
  assert.equal(assessment.mandatoryMissing.length, 0);
  assert.equal(assessment.mandatoryReady, true);
  assert.equal(assessment.exactEntrySquad, true);
});

test("generic fleet gates remain known-gate only even when every selected ship meets stars", () => {
  const ships = Array.from({ length: 5 }, (_, index) => ({
    baseId: `SHIP_${index}`,
    name: `Ship ${index}`,
    unitType: "Ship",
    stars: 7,
    power: 50_000 - index,
  }));
  const fleetMission = {
    id: "fleet-partial",
    name: "Fleet",
    missionType: "fleet",
    entry: { verified: true, unitType: "Ship", squadSize: 5, starsMin: 7 },
  };
  const assessment = assessSquadForRoteMission({ units: [], ships }, fleetMission, ships.map((ship) => ship.baseId));
  assert.equal(assessment.evidence, "gate-only");
  assert.equal(assessment.allSelectedMeetEncodedGate, true);
  assert.equal(assessment.knownGateSquad, true);
  assert.equal(assessment.exactEntrySquad, false);
});

test("template evidence never promotes an unverified planning template", () => {
  assert.equal(squadTemplateEvidence({ name: "Template", verifiedLegal: false }).status, "planning-template");
  assert.equal(squadTemplateEvidence({ name: "Verified", verifiedLegal: true }).status, "verified-legal");
  assert.equal(squadTemplateEvidence(null).status, "manual");
});

test("Squad Workbench ROTE context explicitly separates entry legality from battle evidence", () => {
  const source = fs.readFileSync(new URL("../public/squad-rote-mission-context.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/squad-rote-mission-context.css", import.meta.url), "utf8");
  assert.match(source, /GP-ranked from the exact legal roster pool — not a battle-performance ranking/);
  assert.match(source, /Strategy coverage is separate and does not make this a guaranteed-win team/);
  assert.match(source, /Planning template · legality checked live/);
  assert.match(source, /MANDATORY REQUIREMENTS/);
  assert.match(css, /\.squad-rote-alternatives/);
});

test("Squad Workbench ROTE context assets are wired after the zoom workspace", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(index, /squad-rote-mission-context\.css/);
  assert.match(index, /squad-rote-mission-context\.js/);
  assert.ok(index.indexOf("/squad-rote-mission-context.js") > index.indexOf("/rote-planet-zoom-workspace.js"));
  assert.ok(index.indexOf("/squad-rote-mission-context.js") > index.indexOf("/squad-workbench-pro.js"));
});
