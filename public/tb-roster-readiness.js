import {
  mandatoryRosterStatus,
  missionRosterEntrySummary,
  recommendationRosterFit,
} from "./tb-mission-intelligence.js";
import { evaluateBattleStrategy } from "./tb-battle-strategy.js";

export const ROSTER_READINESS = Object.freeze({
  READY: "READY",
  READY_WITH_SUBSTITUTE: "READY WITH SUBSTITUTE",
  NEEDS_MODS: "NEEDS MODS",
  NEEDS_RELICS: "NEEDS RELICS",
  BLOCKED_MISSING_UNIT: "BLOCKED BY MISSING UNIT",
});

export const STRATEGY_READINESS = Object.freeze({
  AVAILABLE: "STRATEGY AVAILABLE",
  MISSING: "NO VERIFIED STRATEGY YET",
});

function minimumSpeedGap(body, mission, recommendation) {
  const target = Number(recommendation?.minimum?.speed);
  if (!Number.isFinite(target)) return [];
  const fit = recommendationRosterFit(body, mission, recommendation);
  return fit.rows
    .filter((row) => row.unit && Number(row.unit.speed || 0) < target)
    .map((row) => ({
      baseId: String(row.unit?.baseId || row.baseId || ""),
      name: String(row.unit?.name || row.name || "Unknown"),
      current: Number(row.unit?.speed || 0),
      target,
      gap: Math.max(0, target - Number(row.unit?.speed || 0)),
    }));
}

function progressionGaps(body, mission, recommendations) {
  const mandatory = mandatoryRosterStatus(body, mission);
  const mandatoryRows = mandatory.rows.filter((row) => row.owned && !row.legal);
  const recommendationRows = recommendations.flatMap((recommendation) => recommendationRosterFit(body, mission, recommendation).rows)
    .filter((row) => row.owned && !row.legal);
  const unique = new Map();
  for (const row of [...mandatoryRows, ...recommendationRows]) {
    const key = String(row.unit?.baseId || row.baseId || row.member?.baseId || row.name || row.member?.name || "");
    if (!key || unique.has(key)) continue;
    unique.set(key, {
      baseId: String(row.unit?.baseId || row.baseId || row.member?.baseId || ""),
      name: String(row.unit?.name || row.name || row.member?.name || "Unknown"),
      gap: row.gap || {},
    });
  }
  return [...unique.values()];
}

function missingMandatory(body, mission) {
  return mandatoryRosterStatus(body, mission).rows
    .filter((row) => !row.owned)
    .map((row) => ({
      baseId: String(row.member?.baseId || ""),
      name: String(row.member?.name || row.member?.baseId || "Unknown"),
    }));
}

function verifiedStrategy(strategy = {}) {
  if (strategy.available !== true) return false;
  const evidence = `${strategy.strategyStatus || ""} ${strategy.confidence || ""}`.toLowerCase();
  return !evidence.includes("partial") && !evidence.includes("pending") && !evidence.includes("unverified");
}

function strategyReadiness(mission) {
  const strategy = evaluateBattleStrategy({ missionId: mission?.id, members: [] }, mission);
  const verified = verifiedStrategy(strategy);
  return {
    label: verified ? STRATEGY_READINESS.AVAILABLE : STRATEGY_READINESS.MISSING,
    available: strategy?.available === true,
    verified,
    strategyId: strategy?.available ? String(strategy.strategyId || "") : "",
    strategyStatus: strategy?.available ? String(strategy.strategyStatus || "") : "",
    confidence: strategy?.available ? String(strategy.confidence || "") : "",
    lastVerified: strategy?.available ? strategy.lastVerified || null : null,
  };
}

export function missionRosterReadiness(body = {}, mission = {}) {
  const recommendations = Array.isArray(mission.recommendations) ? mission.recommendations : [];
  const missingUnits = missingMandatory(body, mission);
  const strategy = strategyReadiness(mission);

  if (missingUnits.length) {
    return { label: ROSTER_READINESS.BLOCKED_MISSING_UNIT, level: "blocked", missionId: String(mission.id || ""), missingUnits, progressionGaps: [], modGaps: [], recommendationId: "", strategy };
  }

  const progression = progressionGaps(body, mission, recommendations);
  if (progression.length) {
    return { label: ROSTER_READINESS.NEEDS_RELICS, level: "warning", missionId: String(mission.id || ""), missingUnits: [], progressionGaps: progression, modGaps: [], recommendationId: "", strategy };
  }

  const fits = recommendations.map((recommendation) => ({ recommendation, fit: recommendationRosterFit(body, mission, recommendation) }));
  const exact = fits.find((item) => item.fit.complete) || null;
  if (exact) {
    const modGaps = minimumSpeedGap(body, mission, exact.recommendation);
    if (modGaps.length) {
      return { label: ROSTER_READINESS.NEEDS_MODS, level: "warning", missionId: String(mission.id || ""), missingUnits: [], progressionGaps: [], modGaps, recommendationId: String(exact.recommendation.id || ""), strategy };
    }
    return { label: ROSTER_READINESS.READY, level: "ready", missionId: String(mission.id || ""), missingUnits: [], progressionGaps: [], modGaps: [], recommendationId: String(exact.recommendation.id || ""), strategy };
  }

  const entry = missionRosterEntrySummary(body, mission);
  if (entry.ready) {
    return {
      label: recommendations.length ? ROSTER_READINESS.READY_WITH_SUBSTITUTE : ROSTER_READINESS.READY,
      level: "ready",
      missionId: String(mission.id || ""),
      missingUnits: [], progressionGaps: [], modGaps: [], recommendationId: "", strategy,
      substituteCandidates: entry.candidates || [],
    };
  }

  const recommendationMissing = fits.flatMap(({ recommendation, fit }) => fit.rows
    .filter((row) => !row.owned)
    .map((row) => ({ baseId: String(row.baseId || ""), name: String(row.name || row.baseId || "Unknown"), recommendationId: String(recommendation.id || "") })));

  return {
    label: recommendationMissing.length ? ROSTER_READINESS.BLOCKED_MISSING_UNIT : ROSTER_READINESS.NEEDS_RELICS,
    level: recommendationMissing.length ? "blocked" : "warning",
    missionId: String(mission.id || ""),
    missingUnits: recommendationMissing,
    progressionGaps: progression,
    modGaps: [], recommendationId: "", strategy,
  };
}

export function rosterReadinessForMissions(body = {}, missions = []) {
  return (missions || []).map((mission) => ({ mission, readiness: missionRosterReadiness(body, mission) }));
}
