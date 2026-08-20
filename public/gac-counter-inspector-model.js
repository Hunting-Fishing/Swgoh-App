import { actionableEvidenceCandidates, evidenceReliability } from "./gac-evidence-board-allocator.js";
import { evidenceCounterCandidates } from "./gac-evidence-counter-candidates.js";
import { rankRosterFitSquads } from "./gac-counter-engine.js";
import { unitAbilityReadiness } from "./gac-ability-intelligence.js";

function clean(value) { return String(value ?? "").trim(); }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function normalizeIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeBaseId(value?.baseId || value)).filter(Boolean))];
}
function sameComposition(left = [], right = []) {
  const a = normalizeIds(left).sort();
  const b = normalizeIds(right).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function rosterIndex(roster = {}) {
  return new Map((Array.isArray(roster?.units) ? roster.units : [])
    .map((unit) => [normalizeBaseId(unit?.baseId), unit])
    .filter(([id]) => Boolean(id)));
}
function unitsForIds(roster = {}, ids = []) {
  const index = rosterIndex(roster);
  const normalized = normalizeIds(ids);
  const units = normalized.map((id) => index.get(id)).filter(Boolean);
  return units.length === normalized.length ? units : [];
}
function evidenceObservations(entry = {}) {
  return Array.isArray(entry?.observations) ? entry.observations : Array.isArray(entry) ? entry : [];
}
function primaryEvidenceMatch(ownRoster, defense, evidenceEntry, primaryIds, options = {}) {
  const candidates = evidenceCounterCandidates(ownRoster, defense, evidenceObservations(evidenceEntry), options);
  const match = candidates.find((candidate) => candidate.exactTeam && sameComposition(candidate.counterMembers, primaryIds));
  if (!match) return null;
  const reliability = evidenceReliability(match);
  return reliability.automatic === true ? Object.freeze({ ...match, reliability }) : null;
}
function primaryHeuristicMatch(ownRoster, enemyUnits, primaryIds, options = {}) {
  const candidates = rankRosterFitSquads(ownRoster, enemyUnits, options);
  return candidates.find((candidate) => sameComposition(candidate.squad, primaryIds)) || null;
}
function abilityConcerns(squad = [], limit = 5) {
  return (Array.isArray(squad) ? squad : [])
    .map((unit) => ({ unit, readiness: unitAbilityReadiness(unit) }))
    .filter((row) => row.readiness.known && row.readiness.lowTierAbilities > 0)
    .sort((a, b) => b.readiness.lowTierAbilities - a.readiness.lowTierAbilities || Number(a.readiness.score) - Number(b.readiness.score))
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((row) => Object.freeze({
      baseId: normalizeBaseId(row.unit?.baseId),
      name: clean(row.unit?.name || row.unit?.baseId),
      score: row.readiness.score,
      lowTierAbilities: row.readiness.lowTierAbilities,
      averageTier: row.readiness.averageTier,
    }));
}
function reserveIdsFromAssignments(assignments = []) {
  const used = new Set();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of normalizeIds(attempt?.members)) used.add(id);
    }
    const status = clean(assignment?.status).toLowerCase();
    if (["planned", "attempted"].includes(status)) {
      for (const id of normalizeIds(assignment?.members)) used.add(id);
    }
  }
  return [...used];
}
function ownDefenseIds(defenses = []) {
  return [...new Set((Array.isArray(defenses) ? defenses : []).flatMap((defense) => normalizeIds(defense?.members)))];
}
function otherRecommendationIds(cardRecommendations = [], defenseId) {
  return [...new Set((Array.isArray(cardRecommendations) ? cardRecommendations : [])
    .filter((entry) => Number(entry?.defenseId) !== Number(defenseId))
    .flatMap((entry) => normalizeIds(entry?.members)))];
}
function alternateExclusions({ ownDefenses = [], assignments = [], cardRecommendations = [], defenseId = 0, primaryIds = [] } = {}) {
  return [...new Set([
    ...ownDefenseIds(ownDefenses),
    ...reserveIdsFromAssignments(assignments),
    ...otherRecommendationIds(cardRecommendations, defenseId),
    ...normalizeIds(primaryIds),
  ])];
}
function candidateKey(candidate = {}) {
  return normalizeIds(candidate?.counterMembers || candidate?.squad).sort().join(",");
}
function evidenceAlternateRows(ownRoster, defense, evidenceEntry, options = {}) {
  return actionableEvidenceCandidates(ownRoster, defense, evidenceObservations(evidenceEntry), options)
    .map((candidate) => Object.freeze({
      source: "historical-counter-evidence",
      key: candidateKey(candidate),
      squad: candidate.squad,
      leaderBaseId: candidate.counterLeaderBaseId,
      battles: candidate.battles,
      wins: candidate.wins,
      holds: candidate.holds,
      draws: candidate.draws,
      observedWinRate: candidate.observedWinRate,
      averageBanners: candidate.averageBanners,
      evidenceSources: candidate.evidenceSources,
      reliability: candidate.reliability,
      confidence: null,
      score: null,
      riskFlags: Object.freeze([]),
    }));
}
function heuristicAlternateRows(ownRoster, enemyUnits, options = {}) {
  return rankRosterFitSquads(ownRoster, enemyUnits, options).map((candidate) => Object.freeze({
    source: "roster-fit-heuristic",
    key: candidateKey(candidate),
    squad: Object.freeze(candidate.squad),
    leaderBaseId: normalizeBaseId(candidate.squad?.[0]?.baseId),
    battles: null,
    wins: null,
    holds: null,
    draws: null,
    observedWinRate: null,
    averageBanners: null,
    evidenceSources: Object.freeze([]),
    reliability: null,
    confidence: candidate.confidence,
    score: candidate.score,
    riskFlags: Object.freeze(Array.isArray(candidate.riskFlags) ? candidate.riskFlags : []),
  }));
}
function recoveryAlternates(ownRoster, enemyUnits, defense, evidenceEntry, options = {}) {
  const limit = Math.max(1, Math.min(3, Number(options.limit) || 3));
  const excluded = normalizeIds(options.excludeBaseIds);
  const selected = [];
  const used = new Set(excluded);
  const evidence = evidenceAlternateRows(ownRoster, defense, evidenceEntry, {
    size: options.size,
    excludeBaseIds: [...used],
  });
  const heuristic = heuristicAlternateRows(ownRoster, enemyUnits, {
    size: options.size,
    excludeBaseIds: [...used],
  });
  const seen = new Set();
  for (const candidate of [...evidence, ...heuristic]) {
    if (selected.length >= limit) break;
    if (!candidate.key || seen.has(candidate.key)) continue;
    const ids = normalizeIds(candidate.squad);
    if (!ids.length || ids.some((id) => used.has(id))) continue;
    seen.add(candidate.key);
    selected.push(candidate);
    for (const id of ids) used.add(id);
  }
  return Object.freeze(selected);
}
function primarySourceLabel(evidenceMatch, heuristicMatch) {
  if (evidenceMatch) return "EXACT HISTORICAL EVIDENCE";
  if (heuristicMatch) return "ROSTER-FIT HEURISTIC";
  return "AUTHORITATIVE WAR ROOM ALLOCATION";
}
function observedPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(Math.max(0, Math.min(1, parsed)) * 1000) / 10;
}

export {
  abilityConcerns,
  alternateExclusions,
  candidateKey,
  evidenceAlternateRows,
  heuristicAlternateRows,
  normalizeBaseId,
  normalizeIds,
  observedPercent,
  otherRecommendationIds,
  ownDefenseIds,
  primaryEvidenceMatch,
  primaryHeuristicMatch,
  primarySourceLabel,
  recoveryAlternates,
  reserveIdsFromAssignments,
  rosterIndex,
  sameComposition,
  unitsForIds,
};
