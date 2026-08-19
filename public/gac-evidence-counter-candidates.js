function clean(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function nullableFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function normalizedIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeBaseId).filter(Boolean))].sort();
}
function characterUnits(body = {}) {
  return (Array.isArray(body?.units) ? body.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() !== "ship");
}
function rosterIndex(body = {}) {
  return new Map(characterUnits(body).map((unit) => [normalizeBaseId(unit?.baseId), unit]).filter(([id]) => Boolean(id)));
}
function compositionMatch(evidenceMembers, defenseMembers) {
  const evidence = new Set(normalizedIds(evidenceMembers));
  const defense = new Set(normalizedIds(defenseMembers));
  if (!evidence.size || !defense.size) {
    return Object.freeze({ exact: false, overlapCount: 0, overlap: 0, label: "composition-unknown" });
  }
  const overlapCount = [...evidence].filter((id) => defense.has(id)).length;
  const overlap = overlapCount / Math.max(evidence.size, defense.size);
  const exact = evidence.size === defense.size && overlapCount === defense.size;
  return Object.freeze({
    exact,
    overlapCount,
    overlap,
    label: exact ? "exact-team" : overlapCount ? "leader-variant" : "different-team",
  });
}
function squadReadiness(units = []) {
  const lowInvestmentMembers = [];
  for (const unit of units) {
    const stars = finite(unit?.stars);
    const gear = finite(unit?.gear);
    const relic = finite(unit?.relic);
    if (stars < 7 || (relic <= 0 && gear < 12)) lowInvestmentMembers.push(normalizeBaseId(unit?.baseId));
  }
  return Object.freeze({
    ready: Boolean(units.length) && lowInvestmentMembers.length === 0,
    lowInvestmentMembers: Object.freeze(lowInvestmentMembers),
  });
}
function observedWinRate(observation = {}) {
  const battles = Math.max(0, finite(observation?.battles));
  const explicit = nullableFinite(observation?.winRate ?? observation?.win_rate);
  if (explicit !== null) return Math.max(0, Math.min(1, explicit));
  return battles ? Math.max(0, Math.min(1, finite(observation?.wins) / battles)) : 0;
}
function evidenceSources(observation = {}) {
  const values = Array.isArray(observation?.evidenceSources)
    ? observation.evidenceSources
    : Array.isArray(observation?.evidence_sources)
      ? observation.evidence_sources
      : [observation?.source];
  return [...new Set(values.map(clean).filter(Boolean))].sort();
}

function observationCandidate(ownBody, defense = {}, observation = {}, options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const defenseLeader = normalizeBaseId(defense?.leaderBaseId || defense?.leader_base_id || defense?.members?.[0]);
  const evidenceLeader = normalizeBaseId(observation?.enemyLeaderBaseId || observation?.enemy_leader_base_id);
  if (!defenseLeader || !evidenceLeader || defenseLeader !== evidenceLeader) return null;

  const counterLeaderBaseId = normalizeBaseId(observation?.counterLeaderBaseId || observation?.counter_leader_base_id);
  const counterMembers = normalizedIds(observation?.counterMembers || observation?.counter_members);
  if (!counterLeaderBaseId || counterMembers.length !== size || !counterMembers.includes(counterLeaderBaseId)) return null;

  const index = options.rosterIndex || rosterIndex(ownBody);
  const orderedIds = [counterLeaderBaseId, ...counterMembers.filter((id) => id !== counterLeaderBaseId)];
  const squad = orderedIds.map((id) => index.get(id)).filter(Boolean);
  const missingBaseIds = orderedIds.filter((id) => !index.has(id));
  const excluded = new Set((options.excludeBaseIds || []).map(normalizeBaseId).filter(Boolean));
  const reserves = new Set((options.reserveBaseIds || []).map(normalizeBaseId).filter(Boolean));
  const blockedBaseIds = orderedIds.filter((id) => excluded.has(id));
  const reserveUses = orderedIds.filter((id) => reserves.has(id));
  const readiness = squadReadiness(squad);
  const match = compositionMatch(
    observation?.enemyMembers || observation?.enemy_members,
    defense?.members
  );
  const battles = Math.max(0, finite(observation?.battles));
  const wins = Math.max(0, Math.min(battles, finite(observation?.wins)));
  const holds = Math.max(0, finite(observation?.holds));
  const draws = Math.max(0, finite(observation?.draws));
  const averageBanners = nullableFinite(observation?.averageBanners ?? observation?.average_banners);
  const confidence = Math.max(0, Math.min(1, finite(observation?.confidence, 1)));
  const sources = evidenceSources(observation);
  const owned = missingBaseIds.length === 0;

  return Object.freeze({
    source: "historical-counter-evidence",
    evidenceClass: match.label,
    exactTeam: match.exact,
    enemyOverlap: match.overlap,
    enemyOverlapCount: match.overlapCount,
    counterLeaderBaseId,
    counterMembers: Object.freeze(orderedIds),
    squad: Object.freeze(squad),
    owned,
    available: owned && blockedBaseIds.length === 0,
    missingBaseIds: Object.freeze(missingBaseIds),
    blockedBaseIds: Object.freeze(blockedBaseIds),
    rosterReady: owned && readiness.ready,
    lowInvestmentMembers: readiness.lowInvestmentMembers,
    reserveUses: Object.freeze(reserveUses),
    battles,
    wins,
    holds,
    draws,
    observedWinRate: observedWinRate(observation),
    averageBanners,
    confidence,
    evidenceSources: Object.freeze(sources),
    sourceRef: clean(observation?.sourceRef || observation?.source_ref),
    sourceUpdatedAt: clean(observation?.sourceUpdatedAt || observation?.source_updated_at),
  });
}

function compareEvidenceCandidates(left, right) {
  if (left.available !== right.available) return left.available ? -1 : 1;
  if (left.exactTeam !== right.exactTeam) return left.exactTeam ? -1 : 1;
  if (left.rosterReady !== right.rosterReady) return left.rosterReady ? -1 : 1;
  if (right.enemyOverlap !== left.enemyOverlap) return right.enemyOverlap - left.enemyOverlap;
  if (right.battles !== left.battles) return right.battles - left.battles;
  if (right.observedWinRate !== left.observedWinRate) return right.observedWinRate - left.observedWinRate;
  const rightBanners = right.averageBanners === null ? -1 : right.averageBanners;
  const leftBanners = left.averageBanners === null ? -1 : left.averageBanners;
  if (rightBanners !== leftBanners) return rightBanners - leftBanners;
  if (right.confidence !== left.confidence) return right.confidence - left.confidence;
  if (left.reserveUses.length !== right.reserveUses.length) return left.reserveUses.length - right.reserveUses.length;
  return left.counterLeaderBaseId.localeCompare(right.counterLeaderBaseId);
}

function evidenceCounterCandidates(ownBody, defense, observations = [], options = {}) {
  const index = rosterIndex(ownBody);
  return Object.freeze((Array.isArray(observations) ? observations : [])
    .map((observation) => observationCandidate(ownBody, defense, observation, { ...options, rosterIndex: index }))
    .filter(Boolean)
    .sort(compareEvidenceCandidates));
}

function preferredEvidenceTier(candidates = []) {
  const values = (Array.isArray(candidates) ? candidates : []).filter((candidate) => candidate?.available === true);
  const exactReady = values.filter((candidate) => candidate.exactTeam && candidate.rosterReady);
  if (exactReady.length) return Object.freeze({ tier: "exact-ready", candidates: Object.freeze(exactReady) });
  const exactOwned = values.filter((candidate) => candidate.exactTeam);
  if (exactOwned.length) return Object.freeze({ tier: "exact-owned", candidates: Object.freeze(exactOwned) });
  const variantReady = values.filter((candidate) => !candidate.exactTeam && candidate.enemyOverlap > 0 && candidate.rosterReady);
  if (variantReady.length) return Object.freeze({ tier: "leader-variant-ready", candidates: Object.freeze(variantReady) });
  const variants = values.filter((candidate) => !candidate.exactTeam && candidate.enemyOverlap > 0);
  return Object.freeze({ tier: variants.length ? "leader-variant-owned" : "none", candidates: Object.freeze(variants) });
}

export {
  compareEvidenceCandidates,
  compositionMatch,
  evidenceCounterCandidates,
  evidenceSources,
  normalizedIds,
  observationCandidate,
  observedWinRate,
  preferredEvidenceTier,
  rosterIndex,
  squadReadiness,
};
