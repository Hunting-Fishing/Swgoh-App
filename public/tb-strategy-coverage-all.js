import { ROTE_MISSIONS_BY_PLANET } from "./rote-mission-data.js";
import { DS_GEO_TERRITORIES } from "./ds-geo-mission-overrides.js";
import { GEO_LS_TERRITORIES } from "./geo-ls-data.js";
import { HOTH_DS_TERRITORIES } from "./hoth-ds-data.js";
import { HOTH_LS_TERRITORIES } from "./hoth-ls-data.js";
import { missionStrategyCoverage, STRATEGY_COVERAGE } from "./tb-strategy-coverage.js";

export const TB_COVERAGE_IDS = Object.freeze({
  ROTE: "rote",
  GEO_DS: "geo-separatist",
  GEO_LS: "geo-republic",
  HOTH_DS: "hoth-imperial",
  HOTH_LS: "hoth-rebel",
});

const flattenTerritories = (territories = []) => territories.flatMap((territory) =>
  (territory.missions || []).map((mission) => ({ ...mission, territoryName: territory.name || mission.territoryId || "" })),
);

export function allTerritoryBattleMissions() {
  return [
    ...Object.values(ROTE_MISSIONS_BY_PLANET).flat().map((mission) => ({ ...mission, tbId: mission.tbId || TB_COVERAGE_IDS.ROTE })),
    ...flattenTerritories(DS_GEO_TERRITORIES),
    ...flattenTerritories(GEO_LS_TERRITORIES),
    ...flattenTerritories(HOTH_DS_TERRITORIES),
    ...flattenTerritories(HOTH_LS_TERRITORIES),
  ];
}

function strictOrPlanningCoverage(mission) {
  const strict = missionStrategyCoverage(mission);
  if (strict.coverage !== STRATEGY_COVERAGE.MISSING) return strict;

  const recommendations = Array.isArray(mission.recommendations) ? mission.recommendations : [];
  if (recommendations.length) {
    return {
      ...strict,
      coverage: STRATEGY_COVERAGE.PARTIAL,
      reason: "Roster/team recommendations exist, but no sourced mission-specific battle stages resolve yet.",
      planningAvailable: true,
      recommendationCount: recommendations.length,
    };
  }

  return {
    ...strict,
    planningAvailable: false,
    recommendationCount: 0,
  };
}

export function territoryBattleStrategyCoverage(mission) {
  return {
    tbId: String(mission?.tbId || "unknown"),
    territoryId: String(mission?.territoryId || ""),
    territoryName: String(mission?.territoryName || ""),
    phase: Number(mission?.phase || 0),
    missionType: String(mission?.missionType || "unknown"),
    missionName: String(mission?.name || mission?.id || "Unknown mission"),
    ...strictOrPlanningCoverage(mission),
  };
}

function countsFor(rows) {
  const counts = { covered: 0, partial: 0, missing: 0, total: rows.length };
  for (const row of rows) counts[row.coverage] = (counts[row.coverage] || 0) + 1;
  return counts;
}

function groupBy(rows, key) {
  return Object.fromEntries([...new Set(rows.map((row) => row[key]))].map((value) => {
    const subset = rows.filter((row) => row[key] === value);
    return [value, { counts: countsFor(subset), rows: subset }];
  }));
}

export function allTerritoryBattleStrategyCoverageReport() {
  const rows = allTerritoryBattleMissions().map(territoryBattleStrategyCoverage);
  return {
    generatedAt: new Date().toISOString(),
    counts: countsFor(rows),
    byTb: groupBy(rows, "tbId"),
    byMissionType: groupBy(rows, "missionType"),
    rows,
  };
}

export function territoryBattleCoverageGaps({ tbId = "", coverage = "" } = {}) {
  let rows = allTerritoryBattleStrategyCoverageReport().rows;
  if (tbId) rows = rows.filter((row) => row.tbId === tbId);
  if (coverage) rows = rows.filter((row) => row.coverage === coverage);
  return rows;
}
