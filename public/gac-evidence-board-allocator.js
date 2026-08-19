import { evidenceCounterCandidates } from "./gac-evidence-counter-candidates.js";

function clean(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function normalizeMembers(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeBaseId).filter(Boolean))];
}
function defenseLeader(defense = {}) {
  return normalizeBaseId(defense?.leaderBaseId || defense?.leader_base_id || defense?.members?.[0]);
}
function evidenceForLeader(evidenceByLeader, leader) {
  if (!leader) return [];
  if (evidenceByLeader instanceof Map) {
    const value = evidenceByLeader.get(leader);
    return Array.isArray(value?.observations) ? value.observations : Array.isArray(value) ? value : [];
  }
  const value = evidenceByLeader?.[leader];
  return Array.isArray(value?.observations) ? value.observations : Array.isArray(value) ? value : [];
}

function evidenceReliability(candidate = {}) {
  const battles = Math.max(0, finite(candidate.battles));
  const wins = Math.max(0, Math.min(battles, finite(candidate.wins)));
  const rate = Math.max(0, Math.min(1, finite(candidate.observedWinRate)));
  if (!battles || !wins) {
    return Object.freeze({ tier: "no-positive", rank: 0, automatic: false, label: "No observed wins" });
  }
  if (battles >= 10 && rate >= 0.7) {
    return Object.freeze({ tier: "strong", rank: 4, automatic: true, label: "Strong historical sample" });
  }
  if (battles >= 5 && rate >= 0.6) {
    return Object.freeze({ tier: "established", rank: 3, automatic: true, label: "Established historical sample" });
  }
  if (battles >= 2 && rate >= 0.5) {
    return Object.freeze({ tier: "limited", rank: 2, automatic: true, label: "Limited positive sample" });
  }
  if (battles === 1 && wins === 1) {
    return Object.freeze({ tier: "single-positive", rank: 1, automatic: true, label: "Single observed win" });
  }
  return Object.freeze({ tier: "hold-heavy", rank: 0, automatic: false, label: "Hold-heavy / insufficient positive evidence" });
}

function candidateUnitIds(candidate = {}) {
  return normalizeMembers(candidate.counterMembers || candidate.squad?.map((unit) => unit?.baseId));
}
function overlaps(candidate, used) {
  return candidateUnitIds(candidate).some((id) => used.has(id));
}
function actionableEvidenceCandidates(ownRoster, defense, observations, options = {}) {
  return evidenceCounterCandidates(ownRoster, defense, observations, options)
    .map((candidate) => Object.freeze({ ...candidate, reliability: evidenceReliability(candidate) }))
    .filter((candidate) => candidate.exactTeam)
    .filter((candidate) => candidate.available)
    .filter((candidate) => candidate.rosterReady)
    .filter((candidate) => candidate.reliability.automatic === true);
}

function futureConflictMetrics(candidate, futureEntries, used) {
  const chosen = new Set(candidateUnitIds(candidate));
  let endangeredFutureDefenses = 0;
  let lostFutureCandidates = 0;
  for (const entry of futureEntries) {
    const before = entry.candidates.filter((value) => !overlaps(value, used));
    if (!before.length) continue;
    const after = before.filter((value) => !candidateUnitIds(value).some((id) => chosen.has(id)));
    const lost = before.length - after.length;
    lostFutureCandidates += lost;
    if (lost && !after.length) endangeredFutureDefenses += 1;
  }
  return Object.freeze({ endangeredFutureDefenses, lostFutureCandidates });
}

function compareAllocationChoice(left, right) {
  if (left.metrics.endangeredFutureDefenses !== right.metrics.endangeredFutureDefenses) {
    return left.metrics.endangeredFutureDefenses - right.metrics.endangeredFutureDefenses;
  }
  if (left.metrics.lostFutureCandidates !== right.metrics.lostFutureCandidates) {
    return left.metrics.lostFutureCandidates - right.metrics.lostFutureCandidates;
  }
  if (right.candidate.reliability.rank !== left.candidate.reliability.rank) {
    return right.candidate.reliability.rank - left.candidate.reliability.rank;
  }
  if (right.candidate.battles !== left.candidate.battles) return right.candidate.battles - left.candidate.battles;
  if (right.candidate.observedWinRate !== left.candidate.observedWinRate) return right.candidate.observedWinRate - left.candidate.observedWinRate;
  const rightBanners = right.candidate.averageBanners == null ? -1 : finite(right.candidate.averageBanners, -1);
  const leftBanners = left.candidate.averageBanners == null ? -1 : finite(left.candidate.averageBanners, -1);
  if (rightBanners !== leftBanners) return rightBanners - leftBanners;
  return left.candidate.counterLeaderBaseId.localeCompare(right.candidate.counterLeaderBaseId);
}

function allocationReason(candidate, metrics) {
  const parts = [
    `${candidate.reliability.label}: ${candidate.wins}/${candidate.battles} observed wins`,
    "exact saved enemy composition",
  ];
  if (metrics.endangeredFutureDefenses === 0 && metrics.lostFutureCandidates === 0) {
    parts.push("does not consume another current evidence counter");
  } else if (metrics.endangeredFutureDefenses === 0) {
    parts.push(`preserves at least one evidence counter for every later defense`);
  } else {
    parts.push(`uses a squad also needed by ${metrics.endangeredFutureDefenses} later defense${metrics.endangeredFutureDefenses === 1 ? "" : "s"}`);
  }
  if (candidate.reserveUses?.length) parts.push(`uses ${candidate.reserveUses.length} strategic reserve unit${candidate.reserveUses.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function allocateEvidenceCounters(ownRoster, openEntries, evidenceByLeader, options = {}) {
  const size = Number(options.size) === 3 ? 3 : 5;
  const baseUnavailable = new Set((options.excludeBaseIds || []).map(normalizeBaseId).filter(Boolean));
  const entries = (Array.isArray(openEntries) ? openEntries : []).map((entry, index) => {
    const defense = entry?.defense || entry;
    const leader = defenseLeader(defense);
    const observations = evidenceForLeader(evidenceByLeader, leader);
    const candidates = actionableEvidenceCandidates(ownRoster, defense, observations, {
      size,
      excludeBaseIds: [...baseUnavailable],
      reserveBaseIds: options.reserveBaseIds || [],
    });
    return Object.freeze({
      entry,
      index,
      defense,
      defenseId: Number(entry?.defenseId || defense?.id || 0),
      leader,
      candidates: Object.freeze(candidates),
    });
  });

  const ordered = [...entries].sort((a, b) => {
    if (a.candidates.length !== b.candidates.length) return a.candidates.length - b.candidates.length;
    const aBest = a.candidates[0];
    const bBest = b.candidates[0];
    const aRank = aBest?.reliability?.rank || 0;
    const bRank = bBest?.reliability?.rank || 0;
    if (bRank !== aRank) return bRank - aRank;
    const aBattles = aBest?.battles || 0;
    const bBattles = bBest?.battles || 0;
    return bBattles - aBattles || a.index - b.index;
  });

  const used = new Set(baseUnavailable);
  const assignments = [];
  for (let cursor = 0; cursor < ordered.length; cursor += 1) {
    const item = ordered[cursor];
    const available = item.candidates.filter((candidate) => !overlaps(candidate, used));
    if (!available.length) continue;
    const future = ordered.slice(cursor + 1);
    const choices = available.map((candidate) => ({
      candidate,
      metrics: futureConflictMetrics(candidate, future, used),
    })).sort(compareAllocationChoice);
    const selected = choices[0];
    for (const id of candidateUnitIds(selected.candidate)) used.add(id);
    assignments.push(Object.freeze({
      defenseId: item.defenseId,
      sourceIndex: item.index,
      defense: item.defense,
      recommendation: selected.candidate,
      evidenceClass: selected.candidate.evidenceClass,
      reliability: selected.candidate.reliability,
      endangeredFutureDefenses: selected.metrics.endangeredFutureDefenses,
      lostFutureCandidates: selected.metrics.lostFutureCandidates,
      alternativesRemaining: Math.max(0, available.length - 1),
      allocationReason: allocationReason(selected.candidate, selected.metrics),
      source: "historical-counter-evidence",
    }));
  }

  const assignedDefenseIds = new Set(assignments.map((assignment) => assignment.defenseId));
  const remaining = entries.filter((entry) => !assignedDefenseIds.has(entry.defenseId));
  return Object.freeze({
    source: "historical-counter-evidence",
    size,
    assignments: Object.freeze(assignments),
    remainingEntries: Object.freeze(remaining.map((entry) => entry.entry)),
    usedBaseIds: Object.freeze([...used]),
    newlyUsedBaseIds: Object.freeze([...used].filter((id) => !baseUnavailable.has(id))),
    evidenceDefenseCount: assignments.length,
  });
}

export {
  actionableEvidenceCandidates,
  allocateEvidenceCounters,
  allocationReason,
  candidateUnitIds,
  compareAllocationChoice,
  defenseLeader,
  evidenceForLeader,
  evidenceReliability,
  futureConflictMetrics,
};
