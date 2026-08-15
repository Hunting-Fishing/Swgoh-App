import { ROTE_MISSIONS_BY_PLANET } from "./rote-mission-data.js";
import { normalizeRoteMissions } from "./rote-mission-overrides.js";
import { evaluateBattleStrategy } from "./tb-battle-strategy.js";

export const STRATEGY_COVERAGE = Object.freeze({
  COVERED: "covered",
  PARTIAL: "partial",
  MISSING: "missing",
});

function strategyEvidence(missionId) {
  return evaluateBattleStrategy({ missionId: String(missionId || ""), members: [] });
}

function hasPlanningEvidence(mission = {}) {
  return Boolean(
    (Array.isArray(mission.recommendations) && mission.recommendations.length)
    || (Array.isArray(mission.mechanics) && mission.mechanics.length)
    || (Array.isArray(mission.enemies) && mission.enemies.length)
    || (Array.isArray(mission.waves) && mission.waves.length)
  );
}

export function missionStrategyCoverage(mission = {}) {
  const strategy = strategyEvidence(mission.id);
  const hasStrategy = strategy?.available === true;
  const strategyComplete = hasStrategy
    && Array.isArray(strategy.stages)
    && strategy.stages.length > 0
    && Array.isArray(strategy.sources)
    && strategy.sources.length > 0
    && Boolean(String(strategy.evidenceBoundary || "").trim());

  const coverage = strategyComplete
    ? STRATEGY_COVERAGE.COVERED
    : (hasStrategy || hasPlanningEvidence(mission))
      ? STRATEGY_COVERAGE.PARTIAL
      : STRATEGY_COVERAGE.MISSING;

  return {
    missionId: String(mission.id || ""),
    tbId: String(mission.tbId || ""),
    territoryId: String(mission.territoryId || ""),
    phase: Number(mission.phase || 0),
    missionType: String(mission.missionType || "combat"),
    name: String(mission.name || "Mission"),
    coverage,
    strategyAvailable: hasStrategy,
    strategyId: hasStrategy ? String(strategy.strategyId || "") : "",
    strategyStatus: hasStrategy ? String(strategy.strategyStatus || "") : "",
    confidence: hasStrategy ? String(strategy.confidence || "") : "",
    lastVerified: hasStrategy ? strategy.lastVerified || null : null,
    sourceCount: hasStrategy && Array.isArray(strategy.sources) ? strategy.sources.length : 0,
    stageCount: hasStrategy && Array.isArray(strategy.stages) ? strategy.stages.length : 0,
    recommendationCount: Array.isArray(mission.recommendations) ? mission.recommendations.length : 0,
    hasMechanics: Boolean(mission.mechanics?.length),
    hasEnemies: Boolean(mission.enemies?.length),
    reason: strategyComplete
      ? "Sourced battle-strategy pack is resolved with execution stages and an evidence boundary."
      : hasStrategy
        ? "A strategy resolves, but the pack is missing one or more completeness signals."
        : hasPlanningEvidence(mission)
          ? "Mission planning/mechanic data exists, but no sourced battle-strategy pack resolves yet."
          : "No sourced battle-strategy pack or mission planning evidence resolves yet.",
  };
}

function countRows(rows, key, values) {
  return Object.fromEntries(values.map((value) => [value, rows.filter((row) => row[key] === value).length]));
}

export function strategyCoverageReport(missions = []) {
  const rows = (missions || []).map(missionStrategyCoverage)
    .sort((a, b) => a.phase - b.phase || a.territoryId.localeCompare(b.territoryId) || a.missionType.localeCompare(b.missionType) || a.name.localeCompare(b.name));

  const counts = countRows(rows, "coverage", Object.values(STRATEGY_COVERAGE));
  const missionTypes = [...new Set(rows.map((row) => row.missionType))].sort();
  const phases = [...new Set(rows.map((row) => row.phase))].sort((a, b) => a - b);

  return {
    total: rows.length,
    counts,
    percentCovered: rows.length ? Math.round((counts.covered / rows.length) * 100) : 0,
    byType: Object.fromEntries(missionTypes.map((type) => {
      const subset = rows.filter((row) => row.missionType === type);
      return [type, {
        total: subset.length,
        ...countRows(subset, "coverage", Object.values(STRATEGY_COVERAGE)),
      }];
    })),
    byPhase: Object.fromEntries(phases.map((phase) => {
      const subset = rows.filter((row) => row.phase === phase);
      return [phase, {
        total: subset.length,
        ...countRows(subset, "coverage", Object.values(STRATEGY_COVERAGE)),
      }];
    })),
    rows,
  };
}

export function roteStrategyCoverageReport() {
  const missions = normalizeRoteMissions(Object.values(ROTE_MISSIONS_BY_PLANET).flat());
  return strategyCoverageReport(missions);
}
