import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  assignGuildRoteMissionLeads,
  compareGuildMissionCandidates,
  enrichGuildRoteMember,
  evaluateGuildMemberForMission,
  guildRoteMissionEvidence,
  unitMatchesGuildMissionIdentity,
} from "../public/guild-rote-mission-coverage-model.js";

const catalog = [
  { baseId: "JEDI_A", name: "Jedi A", unitType: "Character", alignment: "Light", factions: ["Jedi"], categories: ["Jedi"] },
  { baseId: "JEDI_B", name: "Jedi B", unitType: "Character", alignment: "Light", factions: ["Jedi"], categories: ["Jedi"] },
  { baseId: "SHIP_A", name: "Ship A", unitType: "Ship", alignment: "Light", factions: ["Rebel"], categories: ["Rebel"] },
];

const jediMission = {
  id: "mission-jedi",
  name: "Jedi Mission",
  entry: {
    verified: true,
    unitType: "Character",
    squadSize: 2,
    relicMin: 5,
    requiredCategories: ["Jedi"],
    categoryMode: "all",
  },
};

test("guild member enrichment restores static faction and unit-type data", () => {
  const member = enrichGuildRoteMember({
    playerId: "p1",
    name: "Player One",
    rosterAvailable: true,
    units: [
      { baseId: "JEDI_A", name: "Jedi A", relic: 5, gear: 13, stars: 7 },
      { baseId: "SHIP_A", name: "Ship A", stars: 7 },
    ],
  }, catalog);
  assert.equal(member.units.length, 1);
  assert.equal(member.ships.length, 1);
  assert.deepEqual(member.units[0].factions, ["Jedi"]);
  assert.equal(member.ships[0].unitType, "Ship");
});

test("mission evidence fails closed for generic fleets", () => {
  assert.equal(guildRoteMissionEvidence({ entry: { verified: true, unitType: "Ship", starsMin: 7 } }), "gate-only");
  assert.equal(guildRoteMissionEvidence({ entry: { verified: true, unitType: "Ship", starsMin: 7, allowedBaseIds: ["SHIP_A"] } }), "exact");
  assert.equal(guildRoteMissionEvidence(jediMission), "exact");
});

test("member mission readiness distinguishes exact-ready and near-ready rosters", () => {
  const ready = enrichGuildRoteMember({
    playerId: "ready",
    name: "Ready",
    rosterAvailable: true,
    galacticPower: 10_000_000,
    units: [
      { baseId: "JEDI_A", name: "Jedi A", relic: 5, gear: 13, stars: 7 },
      { baseId: "JEDI_B", name: "Jedi B", relic: 5, gear: 13, stars: 7 },
    ],
  }, catalog);
  const close = enrichGuildRoteMember({
    playerId: "close",
    name: "Close",
    rosterAvailable: true,
    galacticPower: 9_000_000,
    units: [
      { baseId: "JEDI_A", name: "Jedi A", relic: 5, gear: 13, stars: 7 },
      { baseId: "JEDI_B", name: "Jedi B", relic: 4, gear: 13, stars: 7 },
    ],
  }, catalog);

  const readyResult = evaluateGuildMemberForMission(ready, jediMission);
  const closeResult = evaluateGuildMemberForMission(close, jediMission);
  assert.equal(readyResult.exactReady, true);
  assert.equal(readyResult.poolShortfall, 0);
  assert.equal(closeResult.exactReady, false);
  assert.equal(closeResult.poolShortfall, 1);
  assert.equal(closeResult.close, true);
  assert.ok(compareGuildMissionCandidates(readyResult, closeResult) < 0);
});

test("pool identity matching honors mission categories and alignment", () => {
  const mission = {
    entry: {
      verified: true,
      unitType: "Character",
      allowedAlignments: ["Light"],
      requiredCategories: ["Jedi"],
      categoryMode: "all",
    },
  };
  assert.equal(unitMatchesGuildMissionIdentity(catalog[0], mission), true);
  assert.equal(unitMatchesGuildMissionIdentity({ ...catalog[0], alignment: "Dark" }, mission), false);
  assert.equal(unitMatchesGuildMissionIdentity({ ...catalog[0], factions: ["Rebel"], categories: ["Rebel"] }, mission), false);
});

test("mission lead draft assigns scarce coverage first and balances responsibility", () => {
  const alpha = { id: "a", name: "Alpha", galacticPower: 10_000_000 };
  const bravo = { id: "b", name: "Bravo", galacticPower: 9_000_000 };
  const ready = (member) => ({ member, exactReady: true, knownGateReady: false, close: false, rosterAvailable: true, percent: 100, mandatoryBlockers: 0, poolShortfall: 0, gapScore: 0 });
  const missions = [
    { key: "p1:m1", phase: "P1", planetName: "A", evidence: "exact", mission: { name: "Scarce" }, exactReady: [ready(alpha)] },
    { key: "p1:m2", phase: "P1", planetName: "B", evidence: "exact", mission: { name: "Shared One" }, exactReady: [ready(alpha), ready(bravo)] },
    { key: "p1:m3", phase: "P1", planetName: "C", evidence: "exact", mission: { name: "Shared Two" }, exactReady: [ready(alpha), ready(bravo)] },
  ];
  const leads = assignGuildRoteMissionLeads(missions);
  assert.equal(leads.find((row) => row.missionKey === "p1:m1").member.id, "a");
  const shared = leads.filter((row) => row.missionKey !== "p1:m1").map((row) => row.member.id);
  assert.ok(shared.includes("b"));
});

test("guild mission coverage assets are wired into the production shell", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../public/guild-rote-mission-coverage.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/guild-rote-mission-coverage.css", import.meta.url), "utf8");
  assert.match(index, /guild-rote-mission-coverage\.css/);
  assert.match(index, /guild-rote-mission-coverage\.js/);
  assert.match(source, /Guild Mission Coverage Command/);
  assert.match(source, /Mission Leads/);
  assert.match(source, /Farm Priorities/);
  assert.match(source, /Member Coverage/);
  assert.match(css, /\.guild-mission-summary/);
  assert.match(css, /\.guild-farm-row/);
});
