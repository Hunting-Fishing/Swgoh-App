import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildGuildRoteStrategyAudit,
  STRATEGY_AUDIT_STATE,
} from "../public/guild-rote-strategy-audit-model.js";

const member = (name) => ({ id: name.toLowerCase(), name, rosterAvailable: true });
const evaluation = (name, percent = 100) => ({ member: member(name), rosterAvailable: true, exactReady: percent === 100, percent, mandatoryBlockers: 0, poolShortfall: percent === 100 ? 0 : 1 });
const mission = (id, { evidence = "exact", ready = [], known = [], evals = [] } = {}) => ({
  key: `planet:${id}`,
  planetId: "planet",
  planetName: "Planet",
  phase: "P1",
  lane: "Mixed",
  evidence,
  exactReady: ready.map((name) => ({ member: member(name) })),
  knownGateReady: known.map((name) => ({ member: member(name) })),
  evaluations: evals,
  mission: { id, name: id.toUpperCase(), missionType: id.includes("fleet") ? "fleet" : "combat" },
});

const coverage = {
  missions: [
    mission("strategy-gap", { ready: ["Alpha", "Bravo"], evals: [evaluation("Alpha")] }),
    mission("roster-gap", { evals: [evaluation("Charlie", 80)] }),
    mission("evidence-ready", { ready: ["Delta"], evals: [evaluation("Delta")] }),
    mission("fleet-partial", { evidence: "gate-only", known: ["Echo"], evals: [evaluation("Echo")] }),
  ],
};

const report = {
  rows: [
    { missionId: "strategy-gap", coverage: "missing", phase: 1, missionType: "combat", sourceCount: 0, stageCount: 0 },
    { missionId: "roster-gap", coverage: "covered", phase: 1, missionType: "combat", sourceCount: 2, stageCount: 3, lastVerified: "2026-08-15" },
    { missionId: "evidence-ready", coverage: "covered", phase: 1, missionType: "combat", sourceCount: 2, stageCount: 3, lastVerified: "2026-08-15" },
    { missionId: "fleet-partial", coverage: "covered", phase: 1, missionType: "fleet", sourceCount: 1, stageCount: 2 },
  ],
};

test("audit separates strategy gaps, roster gaps, complete planning evidence, and partial entry evidence", () => {
  const audit = buildGuildRoteStrategyAudit(coverage, report);
  const byId = new Map(audit.rows.map((row) => [row.missionId, row]));
  assert.equal(byId.get("strategy-gap").state, STRATEGY_AUDIT_STATE.STRATEGY_GAP);
  assert.equal(byId.get("roster-gap").state, STRATEGY_AUDIT_STATE.ROSTER_GAP);
  assert.equal(byId.get("evidence-ready").state, STRATEGY_AUDIT_STATE.PLANNING_EVIDENCE_READY);
  assert.equal(byId.get("fleet-partial").state, STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL);
});

test("strategy research gaps sort before roster gaps and completed evidence", () => {
  const audit = buildGuildRoteStrategyAudit(coverage, report);
  assert.equal(audit.rows[0].missionId, "strategy-gap");
  assert.equal(audit.rows[1].missionId, "roster-gap");
  assert.equal(audit.rows[2].missionId, "fleet-partial");
  assert.equal(audit.rows[3].missionId, "evidence-ready");
});

test("audit summary reports actionable planning evidence without calling it battle-ready", () => {
  const audit = buildGuildRoteStrategyAudit(coverage, report);
  assert.equal(audit.summary.totalMissions, 4);
  assert.equal(audit.summary.exactEntryMissions, 3);
  assert.equal(audit.summary.planningEvidenceReady, 1);
  assert.equal(audit.summary.strategyGap, 1);
  assert.equal(audit.summary.rosterGap, 1);
  assert.equal(audit.summary.partialEntry, 1);
  assert.equal(audit.summary.coveredStrategy, 3);
  assert.equal(audit.summary.missingStrategy, 1);
  assert.equal(audit.summary.actionablePlanningPercent, 33.3);
});

test("strategy audit UI carries an explicit no-guaranteed-win evidence boundary", () => {
  const source = fs.readFileSync(new URL("../public/guild-rote-strategy-audit.js", import.meta.url), "utf8");
  assert.match(source, /not<\/em> a guaranteed-win or conflict-free squad claim/);
  assert.match(source, /STRATEGY RESEARCH GAP/);
  assert.match(source, /PLANNING EVIDENCE READY/);
  assert.match(source, /Open Planet/);
});

test("strategy audit assets are wired into production", () => {
  const index = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/guild-rote-strategy-audit.css", import.meta.url), "utf8");
  assert.match(index, /guild-rote-strategy-audit\.css/);
  assert.match(index, /guild-rote-strategy-audit\.js/);
  assert.ok(index.indexOf("/guild-rote-strategy-audit.js") > index.indexOf("/guild-rote-mission-coverage.js"));
  assert.match(css, /\.guild-strategy-summary/);
  assert.match(css, /\.guild-strategy-row/);
});
