import {
  missionStrategyCoverage,
  roteStrategyCoverageReport,
  STRATEGY_COVERAGE,
} from "./tb-strategy-coverage.js";

export const STRATEGY_AUDIT_STATE = Object.freeze({
  PLANNING_EVIDENCE_READY: "planning-evidence-ready",
  STRATEGY_GAP: "strategy-gap",
  ROSTER_GAP: "roster-gap",
  ENTRY_EVIDENCE_PARTIAL: "entry-evidence-partial",
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rowState(mission, strategy) {
  if (mission.evidence !== "exact") return STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL;
  if (!mission.exactReady?.length) return STRATEGY_AUDIT_STATE.ROSTER_GAP;
  if (strategy.coverage !== STRATEGY_COVERAGE.COVERED) return STRATEGY_AUDIT_STATE.STRATEGY_GAP;
  return STRATEGY_AUDIT_STATE.PLANNING_EVIDENCE_READY;
}

function strategyGapRank(strategy = {}) {
  if (strategy.coverage === STRATEGY_COVERAGE.MISSING) return 0;
  if (strategy.coverage === STRATEGY_COVERAGE.PARTIAL) return 1;
  return 2;
}

export function auditPriority(row = {}) {
  const stateRank = {
    [STRATEGY_AUDIT_STATE.STRATEGY_GAP]: 0,
    [STRATEGY_AUDIT_STATE.ROSTER_GAP]: 1,
    [STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL]: 2,
    [STRATEGY_AUDIT_STATE.PLANNING_EVIDENCE_READY]: 3,
  }[row.state] ?? 4;
  const strategyRank = strategyGapRank(row.strategy);
  const readyCount = finite(row.exactReadyCount, 0);
  const sourceCount = finite(row.strategy?.sourceCount, 0);
  return [stateRank, strategyRank, -readyCount, sourceCount, finite(row.strategy?.phase, 0), String(row.planetName || ""), String(row.missionName || "")];
}

function comparePriority(a, b) {
  const aa = auditPriority(a);
  const bb = auditPriority(b);
  for (let index = 0; index < aa.length; index += 1) {
    if (typeof aa[index] === "number" && typeof bb[index] === "number") {
      if (aa[index] !== bb[index]) return aa[index] - bb[index];
    } else {
      const diff = String(aa[index]).localeCompare(String(bb[index]));
      if (diff) return diff;
    }
  }
  return 0;
}

export function buildGuildRoteStrategyAudit(coverage = {}, strategyReport = roteStrategyCoverageReport()) {
  const reportByMissionId = new Map((strategyReport.rows || []).map((row) => [String(row.missionId || ""), row]));
  const rows = (coverage.missions || []).map((mission) => {
    const missionId = String(mission.mission?.id || mission.key || "");
    const strategy = reportByMissionId.get(missionId) || missionStrategyCoverage(mission.mission || {});
    const exactReadyCount = mission.evidence === "exact" ? Number(mission.exactReady?.length || 0) : 0;
    const knownGateCount = Number(mission.knownGateReady?.length || 0);
    const best = (mission.evaluations || []).find((evaluation) => evaluation.rosterAvailable) || null;
    const state = rowState(mission, strategy);
    return Object.freeze({
      key: mission.key,
      missionId,
      planetId: mission.planetId,
      planetName: mission.planetName,
      phase: mission.phase,
      lane: mission.lane,
      missionName: mission.mission?.name || strategy.name || missionId,
      missionType: mission.mission?.missionType || strategy.missionType || "combat",
      entryEvidence: mission.evidence,
      exactReadyCount,
      knownGateCount,
      closestMember: best?.member || null,
      closestPercent: finite(best?.percent, 0),
      closestMandatoryBlockers: finite(best?.mandatoryBlockers, 0),
      closestPoolShortfall: finite(best?.poolShortfall, 0),
      strategy,
      state,
    });
  }).sort(comparePriority);

  const exactRows = rows.filter((row) => row.entryEvidence === "exact");
  const planningEvidenceReady = rows.filter((row) => row.state === STRATEGY_AUDIT_STATE.PLANNING_EVIDENCE_READY);
  const strategyGap = rows.filter((row) => row.state === STRATEGY_AUDIT_STATE.STRATEGY_GAP);
  const rosterGap = rows.filter((row) => row.state === STRATEGY_AUDIT_STATE.ROSTER_GAP);
  const partialEntry = rows.filter((row) => row.state === STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL);
  const coveredStrategy = rows.filter((row) => row.strategy.coverage === STRATEGY_COVERAGE.COVERED);
  const partialStrategy = rows.filter((row) => row.strategy.coverage === STRATEGY_COVERAGE.PARTIAL);
  const missingStrategy = rows.filter((row) => row.strategy.coverage === STRATEGY_COVERAGE.MISSING);

  return Object.freeze({
    rows: Object.freeze(rows),
    planningEvidenceReady: Object.freeze(planningEvidenceReady),
    strategyGap: Object.freeze(strategyGap),
    rosterGap: Object.freeze(rosterGap),
    partialEntry: Object.freeze(partialEntry),
    summary: Object.freeze({
      totalMissions: rows.length,
      exactEntryMissions: exactRows.length,
      planningEvidenceReady: planningEvidenceReady.length,
      strategyGap: strategyGap.length,
      rosterGap: rosterGap.length,
      partialEntry: partialEntry.length,
      coveredStrategy: coveredStrategy.length,
      partialStrategy: partialStrategy.length,
      missingStrategy: missingStrategy.length,
      strategyCoveragePercent: rows.length ? Math.round((coveredStrategy.length / rows.length) * 1000) / 10 : 0,
      actionablePlanningPercent: exactRows.length ? Math.round((planningEvidenceReady.length / exactRows.length) * 1000) / 10 : 0,
    }),
  });
}
