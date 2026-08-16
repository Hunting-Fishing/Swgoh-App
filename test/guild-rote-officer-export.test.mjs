import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildOfficerBrief,
  farmPriorityTsv,
  missionLeadTsv,
  truncateOfficerBrief,
} from "../public/guild-rote-officer-export.js";

const memberA = { name: "Alpha", allyCode: "111222333", galacticPower: 10_000_000 };
const memberB = { name: "Bravo", allyCode: "444555666", galacticPower: 9_500_000 };
const zeroMission = {
  key: "mustafar:m1",
  phase: "P1",
  planetName: "Mustafar",
  lane: "Dark Side",
  mission: { name: "Lord Vader" },
  evaluations: [{ member: memberB, rosterAvailable: true, exactReady: false, mandatoryBlockers: 1, poolShortfall: 0, percent: 80 }],
};
const fragileMission = {
  key: "corellia:m2",
  phase: "P1",
  planetName: "Corellia",
  lane: "Mixed",
  mission: { name: "Doctor Aphra" },
  exactReady: [{ member: memberA }],
};
const coverage = {
  summary: {
    exactCoveragePercent: 88.5,
    redundancyCoveragePercent: 72.1,
    hydratedMembers: 49,
    totalMembers: 50,
    zeroCoverageMissions: 1,
    fragileMissions: 1,
    partialEvidenceMissions: 3,
  },
  zeroCoverage: [zeroMission],
  fragile: [fragileMission],
  leads: [
    { mission: { ...fragileMission, evidence: "exact" }, member: memberA, alternatives: [memberB] },
    { mission: { ...zeroMission, evidence: "exact", exactReady: [] }, member: null, alternatives: [] },
  ],
  farms: [
    {
      member: memberB,
      baseId: "DARTHVADER",
      unitName: "Darth Vader",
      unit: { unitType: "Character", gear: 13, relic: 6, stars: 7, power: 32_000 },
      gapLabel: "+1 relic",
      missionImpact: 2,
      mandatoryImpact: 1,
      poolImpact: 1,
      missionRefs: [zeroMission, fragileMission],
    },
  ],
};

test("mission lead TSV is spreadsheet-ready and preserves assignment evidence", () => {
  const text = missionLeadTsv(coverage);
  assert.match(text, /^Phase\tPlanet\tLane\tMission\tEvidence\tExact Ready\tLead\tLead Ally Code\tAlternates/m);
  assert.match(text, /P1\tCorellia\tMixed\tDoctor Aphra\texact\t1\tAlpha\t111222333\tBravo \(444555666\)/);
  assert.match(text, /UNASSIGNED/);
});

test("farm priority TSV includes progression, impact, and affected missions", () => {
  const text = farmPriorityTsv(coverage);
  assert.match(text, /^Priority\tMember\tAlly Code\tUnit\tBase ID\tCurrent\tNeeded/m);
  assert.match(text, /Bravo\t444555666\tDarth Vader\tDARTHVADER\tR6 · 7★ · 32,000 GP\t\+1 relic\t2\t1\t1/);
  assert.match(text, /P1 Mustafar — Lord Vader/);
});

test("officer brief surfaces zero coverage, sole-owner risk, farms, and fleet evidence boundary", () => {
  const text = buildOfficerBrief(coverage, "Test Guild", { maxLength: 1850 });
  assert.match(text, /ROTE Officer Brief — Test Guild/);
  assert.match(text, /Zero Coverage/);
  assert.match(text, /Mustafar — Lord Vader/);
  assert.match(text, /Single-Owner Risk/);
  assert.match(text, /Corellia — Doctor Aphra/);
  assert.match(text, /Highest-Impact Farms/);
  assert.match(text, /Bravo — Darth Vader → \+1 relic/);
  assert.match(text, /generic fleet gates/);
  assert.ok(text.length <= 1850);
});

test("officer brief truncation stays under the configured share size", () => {
  const text = Array.from({ length: 100 }, (_, index) => `Line ${index}: ${"x".repeat(40)}`).join("\n");
  const truncated = truncateOfficerBrief(text, 500);
  assert.ok(truncated.length <= 500);
  assert.match(truncated, /more details available/);
});

test("officer export assets are wired after guild mission coverage", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../public/guild-rote-officer-export.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/guild-rote-officer-export.css", import.meta.url), "utf8");
  assert.match(index, /guild-rote-officer-export\.css/);
  assert.match(index, /guild-rote-officer-export\.js/);
  assert.ok(index.indexOf("/guild-rote-officer-export.js") > index.indexOf("/guild-rote-mission-coverage.js"));
  assert.match(source, /Copy Officer Brief/);
  assert.match(source, /Copy Mission Leads TSV/);
  assert.match(source, /Copy Farm Priorities TSV/);
  assert.match(css, /\.guild-officer-export-actions/);
});
