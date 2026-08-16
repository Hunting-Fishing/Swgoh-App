import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  compareMissionImpact,
  impactFilterMatch,
  personalMissionImpactFromCoverage,
} from "../public/roster-rote-mission-impact-model.js";

const unit = (baseId, name = baseId) => ({ baseId, name, unitType: "Character" });
const mission = (key, name) => ({ key, planetId: "planet", planetName: "Planet", phase: "P1", mission: { name } });
const m1 = mission("planet:m1", "Mission One");
const m2 = mission("planet:m2", "Mission Two");
const partial = { ...mission("planet:fleet", "Fleet"), evidence: "gate-only" };

const coverage = {
  members: [{ units: [unit("A", "Alpha"), unit("B", "Bravo"), unit("C", "Charlie")], ships: [] }],
  missions: [
    {
      ...m1,
      evidence: "exact",
      evaluations: [{ eligibility: { candidates: [unit("A"), unit("B")], mandatory: [{ unit: unit("A"), legal: true }] } }],
    },
    {
      ...m2,
      evidence: "exact",
      evaluations: [{ eligibility: { candidates: [unit("A")], mandatory: [] } }],
    },
    { ...partial, evaluations: [{ eligibility: { candidates: [unit("C")], mandatory: [] } }] },
  ],
  farms: [
    { baseId: "B", unitName: "Bravo", unit: unit("B"), gapLabel: "+1 relic", missionRefs: [m2] },
  ],
  summary: { exactMissions: 2, partialEvidenceMissions: 1 },
};

test("personal mission impact aggregates legal, mandatory, and farm usage while excluding partial entry missions", () => {
  const result = personalMissionImpactFromCoverage(coverage);
  const a = result.byBaseId.get("A");
  const b = result.byBaseId.get("B");
  const c = result.byBaseId.get("C");
  assert.equal(a.legalMissionCount, 2);
  assert.equal(a.mandatoryMissionCount, 1);
  assert.equal(a.totalMissionImpact, 2);
  assert.equal(b.legalMissionCount, 1);
  assert.equal(b.farmMissionCount, 1);
  assert.equal(b.totalMissionImpact, 2);
  assert.deepEqual(b.gapLabels, ["+1 relic"]);
  assert.equal(c.totalMissionImpact, 0);
  assert.equal(result.summary.exactMissions, 2);
  assert.equal(result.summary.partialEvidenceMissions, 1);
});

test("mission impact filters intersect cleanly by blocker, mandatory, legal, multi-use, and none", () => {
  const result = personalMissionImpactFromCoverage(coverage);
  const a = result.byBaseId.get("A");
  const b = result.byBaseId.get("B");
  const c = result.byBaseId.get("C");
  assert.equal(impactFilterMatch(b, "farm"), true);
  assert.equal(impactFilterMatch(a, "farm"), false);
  assert.equal(impactFilterMatch(a, "mandatory"), true);
  assert.equal(impactFilterMatch(a, "legal"), true);
  assert.equal(impactFilterMatch(a, "multi"), false);
  assert.equal(impactFilterMatch(c, "none"), true);
});

test("mission impact sorting can prioritize farm, mandatory, legal, or combined impact", () => {
  const result = personalMissionImpactFromCoverage(coverage);
  const a = result.byBaseId.get("A");
  const b = result.byBaseId.get("B");
  assert.ok(compareMissionImpact(b, a, "farm") < 0);
  assert.ok(compareMissionImpact(a, b, "mandatory") < 0);
  assert.ok(compareMissionImpact(a, b, "legal") < 0);
  assert.ok(compareMissionImpact(b, a, "impact") < 0, "farm blockers intentionally carry the largest combined impact weight");
});

test("roster mission impact UI keeps Operations and mission evidence conceptually separate", () => {
  const source = fs.readFileSync(new URL("../public/roster-rote-mission-impact.js", import.meta.url), "utf8");
  assert.match(source, /Combat\/special mission impact is separate from the existing ROTE Operations demand column/);
  assert.match(source, /Generic fleet gates without complete selectable-ship restrictions are excluded/);
  assert.match(source, /ROTE Missions/);
  assert.match(source, /Mission Farm/);
});

test("roster mission impact assets are wired into production after roster command", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/roster-rote-mission-impact.css", import.meta.url), "utf8");
  assert.match(index, /roster-rote-mission-impact\.css/);
  assert.match(index, /roster-rote-mission-impact\.js/);
  assert.ok(index.indexOf("/roster-rote-mission-impact.js") > index.indexOf("/roster-command-pro.js"));
  assert.match(css, /\.pro-roster-mission-summary/);
  assert.match(css, /\.pro-mission-impact-cell/);
});
