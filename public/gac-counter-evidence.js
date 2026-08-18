import { combatValue } from "./gac-counter-engine.js";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function characterMap(body) {
  return new Map((body?.units || [])
    .filter((unit) => unit?.unitType !== "Ship" && unit?.baseId)
    .map((unit) => [String(unit.baseId), unit]));
}

function memberIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => typeof entry === "string" ? entry : entry?.baseId || entry?.base_id || entry?.id)
      .filter(Boolean)
      .map(String);
  }
  if (typeof value === "object") return memberIds(value.members || value.units || value.squad || []);
  return [];
}

function leaderId(record, prefix) {
  return String(
    record?.[`${prefix}LeaderBaseId`] ||
    record?.[`${prefix}_leader_base_id`] ||
    record?.[`${prefix}Leader`] ||
    ""
  );
}

function wilsonLowerBound(wins, battles, z = 1.96) {
  const total = Math.max(0, n(battles));
  if (!total) return 0;
  const success = Math.max(0, Math.min(total, n(wins)));
  const p = success / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (center - margin) / denominator);
}

function compositionMatch(enemyUnits, record) {
  const actual = new Set((enemyUnits || []).map((unit) => String(unit?.baseId || "")).filter(Boolean));
  const expected = new Set(memberIds(record?.enemyMembers || record?.enemy_members));
  const expectedLeader = leaderId(record, "enemy");
  if (expectedLeader) expected.add(expectedLeader);
  if (!expected.size || !actual.size) return 0;
  let shared = 0;
  for (const id of expected) if (actual.has(id)) shared += 1;
  return shared / Math.max(actual.size, expected.size);
}

function counterUnitsFromRecord(roster, record) {
  const ids = memberIds(record?.counterMembers || record?.counter_members);
  const lead = leaderId(record, "counter");
  if (lead && !ids.includes(lead)) ids.unshift(lead);
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const units = unique.map((id) => roster.get(id)).filter(Boolean);
  return units.length === unique.length ? units : [];
}

function recordStats(record) {
  const battles = Math.max(0, n(record?.battles ?? record?.seen ?? record?.sampleSize));
  const wins = Math.max(0, n(record?.wins ?? (battles * n(record?.winRate ?? record?.win_rate))));
  const winRate = battles ? Math.min(1, wins / battles) : Math.min(1, Math.max(0, n(record?.winRate ?? record?.win_rate)));
  return {
    battles,
    wins,
    winRate,
    averageBanners: n(record?.averageBanners ?? record?.average_banners ?? record?.banners),
    lowerBound: battles ? wilsonLowerBound(wins, battles) : winRate * 0.55,
  };
}

function rosterEdge(counterUnits, enemyUnits) {
  const counter = counterUnits.reduce((sum, unit) => sum + combatValue(unit), 0);
  const enemy = (enemyUnits || []).reduce((sum, unit) => sum + combatValue(unit), 0);
  if (!enemy) return 0;
  return Math.max(-1, Math.min(1, counter / enemy - 1));
}

function evidenceLabel(stats) {
  if (stats.battles >= 1000 && stats.lowerBound >= 0.75) return "High-confidence historical counter";
  if (stats.battles >= 200 && stats.lowerBound >= 0.60) return "Strong historical counter";
  if (stats.battles >= 50) return "Historical counter";
  return "Low-sample historical counter";
}

function rankEvidenceCounters(ownBody, enemyUnits, observations = [], options = {}) {
  const roster = characterMap(ownBody);
  const mode = Number(options.size) === 3 ? "3v3" : "5v5";
  const expectedSize = mode === "3v3" ? 3 : 5;
  const enemyLeader = String(enemyUnits?.[0]?.baseId || "");

  return observations.map((record) => {
    const recordMode = String(record?.format || record?.mode || "").toLowerCase();
    if (recordMode && recordMode !== mode) return null;
    const recordEnemyLeader = leaderId(record, "enemy");
    if (recordEnemyLeader && enemyLeader && recordEnemyLeader !== enemyLeader) return null;

    const counterUnits = counterUnitsFromRecord(roster, record);
    if (counterUnits.length !== expectedSize) return null;
    const stats = recordStats(record);
    const match = compositionMatch(enemyUnits, record);
    const edge = rosterEdge(counterUnits, enemyUnits);
    const sampleWeight = Math.min(18, Math.log10(Math.max(1, stats.battles)) * 6);
    const score = Math.round(
      stats.lowerBound * 100 +
      match * 24 +
      sampleWeight +
      Math.max(-8, Math.min(8, edge * 16)) +
      Math.max(0, Math.min(10, stats.averageBanners / 7))
    );

    return {
      squad: counterUnits,
      score,
      source: record?.source || "historical-evidence",
      sourceRef: record?.sourceRef || record?.source_ref || "",
      battles: stats.battles,
      wins: stats.wins,
      winRate: stats.winRate,
      conservativeWinRate: stats.lowerBound,
      averageBanners: stats.averageBanners,
      compositionMatch: match,
      rosterEdge: edge,
      confidence: evidenceLabel(stats),
      evidence: true,
    };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || b.battles - a.battles || b.averageBanners - a.averageBanners);
}

export {
  compositionMatch,
  memberIds,
  rankEvidenceCounters,
  wilsonLowerBound,
};
