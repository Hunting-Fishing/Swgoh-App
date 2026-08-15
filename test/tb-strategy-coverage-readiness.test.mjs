import test from "node:test";
import assert from "node:assert/strict";
import { createMissionRecord } from "../public/tb-mission-intelligence.js";
import {
  missionStrategyCoverage,
  roteStrategyCoverageReport,
  strategyCoverageReport,
} from "../public/tb-strategy-coverage.js";
import {
  missionRosterReadiness,
  ROSTER_READINESS,
  STRATEGY_READINESS,
} from "../public/tb-roster-readiness.js";

function unit(baseId, { relic = 5, speed = 320, name = baseId } = {}) {
  return {
    baseId,
    name,
    unitType: "Character",
    alignment: "Light",
    stars: 7,
    gear: 13,
    relic,
    speed,
    power: 30000,
    factions: ["Test"],
  };
}

function readinessMission() {
  return createMissionRecord({
    id: "readiness-test-mission",
    tbId: "rote",
    territoryId: "test",
    phase: 1,
    name: "Readiness Test",
    missionType: "combat",
    entry: {
      verified: true,
      unitType: "Character",
      alignment: "Light",
      starsMin: 7,
      relicMin: 5,
      squadSize: 2,
      mandatoryMembers: [{ name: "Alpha", baseId: "ALPHA" }],
    },
    recommendations: [{
      id: "alpha-beta",
      name: "Alpha + Beta",
      members: [{ name: "Alpha", baseId: "ALPHA" }, { name: "Beta", baseId: "BETA" }],
      minimum: { speed: 300 },
    }],
  });
}

test("coverage classifies sourced, planning-only, and empty missions", () => {
  const covered = missionStrategyCoverage({ id: "corellia-jabba", tbId: "rote", missionType: "combat", phase: 1 });
  assert.equal(covered.coverage, "covered");
  assert.equal(covered.strategyAvailable, true);

  const partial = missionStrategyCoverage({ id: "fake-planning", tbId: "rote", missionType: "combat", phase: 1, recommendations: [{ id: "x" }] });
  assert.equal(partial.coverage, "partial");
  assert.equal(partial.strategyAvailable, false);

  const missing = missionStrategyCoverage({ id: "fake-empty", tbId: "rote", missionType: "fleet", phase: 1 });
  assert.equal(missing.coverage, "missing");
});

test("coverage report preserves covered/partial/missing totals", () => {
  const report = strategyCoverageReport([
    { id: "corellia-jabba", tbId: "rote", missionType: "combat", phase: 1 },
    { id: "fake-planning", tbId: "rote", missionType: "special", phase: 1, mechanics: ["x"] },
    { id: "fake-empty", tbId: "rote", missionType: "fleet", phase: 1 },
  ]);
  assert.equal(report.total, 3);
  assert.deepEqual(report.counts, { covered: 1, partial: 1, missing: 1 });
  assert.equal(report.byType.combat.covered, 1);
  assert.equal(report.byType.special.partial, 1);
  assert.equal(report.byType.fleet.missing, 1);
});

test("ROTE report audits the canonical mission registry", () => {
  const report = roteStrategyCoverageReport();
  assert.ok(report.total > 50);
  assert.equal(report.rows.length, report.total);
  assert.equal(report.counts.covered + report.counts.partial + report.counts.missing, report.total);
  assert.ok(report.byType.combat.total > 0);
  assert.ok(report.byType.special.total > 0);
  assert.ok(report.byType.fleet.total > 0);
});

test("readiness blocks when a mandatory unit is missing", () => {
  const result = missionRosterReadiness({ units: [unit("BETA")] }, readinessMission());
  assert.equal(result.label, ROSTER_READINESS.BLOCKED_MISSING_UNIT);
  assert.equal(result.missingUnits[0].baseId, "ALPHA");
  assert.equal(result.strategy.label, STRATEGY_READINESS.MISSING);
});

test("readiness reports relic progression gaps before team-fit gaps", () => {
  const result = missionRosterReadiness({ units: [unit("ALPHA", { relic: 4 }), unit("BETA")] }, readinessMission());
  assert.equal(result.label, ROSTER_READINESS.NEEDS_RELICS);
  assert.ok(result.progressionGaps.some((row) => row.baseId === "ALPHA" && row.gap.relic === 1));
});

test("readiness reports sourced minimum speed gaps as NEEDS MODS", () => {
  const result = missionRosterReadiness({ units: [unit("ALPHA", { speed: 290 }), unit("BETA", { speed: 310 })] }, readinessMission());
  assert.equal(result.label, ROSTER_READINESS.NEEDS_MODS);
  assert.equal(result.modGaps[0].baseId, "ALPHA");
  assert.equal(result.modGaps[0].gap, 10);
});

test("readiness reports exact team READY and legal alternate depth READY WITH SUBSTITUTE", () => {
  const exact = missionRosterReadiness({ units: [unit("ALPHA"), unit("BETA")] }, readinessMission());
  assert.equal(exact.label, ROSTER_READINESS.READY);
  assert.equal(exact.recommendationId, "alpha-beta");

  const substitute = missionRosterReadiness({ units: [unit("ALPHA"), unit("GAMMA")] }, readinessMission());
  assert.equal(substitute.label, ROSTER_READINESS.READY_WITH_SUBSTITUTE);
  assert.ok(substitute.substituteCandidates.some((row) => row.baseId === "GAMMA"));
});

test("strategy evidence is independent from roster readiness", () => {
  const mission = createMissionRecord({
    id: "corellia-jabba",
    tbId: "rote",
    territoryId: "corellia",
    phase: 1,
    name: "Jabba",
    missionType: "combat",
    entry: { verified: true, unitType: "Character", starsMin: 7, relicMin: 5, allowedAlignments: ["Light", "Dark"] },
  });
  const result = missionRosterReadiness({ units: Array.from({ length: 5 }, (_, i) => unit(`FLEX${i}`)) }, mission);
  assert.equal(result.label, ROSTER_READINESS.READY);
  assert.equal(result.strategy.label, STRATEGY_READINESS.AVAILABLE);
});
