import { intrinsicUpgradeScore } from './readiness-policy.js';

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const normalizeId = (value) => clean(value?.baseId || value).split(':')[0].toUpperCase();

function normalizeIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean))];
}
function sameSet(left = [], right = []) {
  const a = normalizeIds(left).sort();
  const b = normalizeIds(right).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function subsetOf(subset = [], superset = []) {
  const expected = normalizeIds(subset);
  const available = new Set(normalizeIds(superset));
  return expected.length > 0 && expected.every((id) => available.has(id));
}
function fleetObservedIds(defense = {}) {
  return normalizeIds([
    defense?.capitalShipBaseId,
    ...(Array.isArray(defense?.starters) ? defense.starters : []),
    ...(Array.isArray(defense?.reinforcements) ? defense.reinforcements : []),
  ]);
}
function shipRows(roster = {}) {
  return (Array.isArray(roster?.units) ? roster.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() === 'ship');
}
function characterRows(roster = {}) {
  return (Array.isArray(roster?.units) ? roster.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() !== 'ship');
}
function rosterIndex(rows = []) {
  return new Map((Array.isArray(rows) ? rows : []).map((unit) => [normalizeId(unit), unit]).filter(([id]) => id));
}
function catalogIndex(catalog = {}) {
  return rosterIndex(Array.isArray(catalog?.units) ? catalog.units : []);
}
function isCapitalShip(unit = {}) {
  const id = normalizeId(unit);
  if (id.startsWith('CAPITAL')) return true;
  const tags = [unit?.categories, unit?.factions, unit?.tags]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .map((value) => clean(value).toLowerCase());
  return tags.some((value) => value.includes('capital ship'));
}
function fleetEvidenceObservations(entry = {}) {
  return Array.isArray(entry?.observations) ? entry.observations : Array.isArray(entry) ? entry : [];
}
function evidenceForCapital(evidence, capitalShipBaseId) {
  const capital = normalizeId(capitalShipBaseId);
  if (!capital) return [];
  if (evidence instanceof Map) return fleetEvidenceObservations(evidence.get(capital));
  if (Array.isArray(evidence?.results)) {
    return fleetEvidenceObservations(evidence.results.find((row) => normalizeId(row?.enemyCapitalShipBaseId) === capital));
  }
  return fleetEvidenceObservations(evidence?.[capital]);
}
function compositionMatch(defense = {}, observation = {}) {
  const observed = fleetObservedIds(defense);
  const historical = normalizeIds(observation?.defenderMembers);
  const capital = normalizeId(defense?.capitalShipBaseId);
  if (!capital || normalizeId(observation?.defenderCapitalShipBaseId) !== capital) {
    return Object.freeze({ key: 'none', rank: 0, label: 'Different capital ship', actionable: false });
  }
  if (sameSet(observed, historical)) {
    return Object.freeze({ key: 'exact-members', rank: 3, label: 'Exact observed fleet member set', actionable: true });
  }
  if (subsetOf(observed, historical)) {
    return Object.freeze({
      key: 'observed-subset',
      rank: 2,
      label: 'Visible fleet members match historical member set',
      actionable: true,
    });
  }
  return Object.freeze({
    key: 'capital-only',
    rank: 1,
    label: 'Capital-ship evidence only',
    actionable: false,
  });
}
function crewIdsForShip(ship, catalog = {}) {
  const catalogUnit = catalogIndex(catalog).get(normalizeId(ship)) || ship || {};
  return normalizeIds(catalogUnit?.crew);
}
function crewContextForShip(ship, ownerRoster = {}, catalog = {}) {
  const crewIds = crewIdsForShip(ship, catalog);
  const characters = rosterIndex(characterRows(ownerRoster));
  const crew = crewIds.map((id) => {
    const unit = characters.get(id) || null;
    return Object.freeze({
      baseId: id,
      name: clean(unit?.name || id),
      owned: Boolean(unit),
      relic: unit ? n(unit?.relic) : null,
      gear: unit ? n(unit?.gear) : null,
      power: unit ? n(unit?.power) : null,
    });
  });
  return Object.freeze({
    known: crewIds.length > 0,
    crewless: crewIds.length === 0,
    crew: Object.freeze(crew),
    missingCrew: Object.freeze(crew.filter((row) => !row.owned).map((row) => row.baseId)),
    minimumRelic: crew.length && crew.every((row) => row.owned && row.relic != null)
      ? Math.min(...crew.map((row) => row.relic))
      : null,
  });
}
function shipReadiness(ship, ownerRoster = {}, catalog = {}) {
  const intrinsic = intrinsicUpgradeScore(ship || {});
  return Object.freeze({
    baseId: normalizeId(ship),
    name: clean(ship?.name || normalizeId(ship)),
    power: ship?.power == null ? null : n(ship.power),
    stars: ship?.stars == null ? null : n(ship.stars),
    level: ship?.level == null ? null : n(ship.level),
    intrinsicScore: intrinsic.score,
    crew: crewContextForShip(ship, ownerRoster, catalog),
  });
}
function reliabilityOf(observation = {}) {
  const value = observation?.reliability || {};
  return Object.freeze({
    tier: clean(value?.tier),
    rank: Math.max(0, n(value?.rank)),
    automatic: value?.automatic === true,
    label: clean(value?.label || 'Historical fleet sample'),
  });
}
function fleetCandidate(ownerRoster, catalog, defense, observation, options = {}) {
  const shipIndex = rosterIndex(shipRows(ownerRoster));
  const counterCapitalShipBaseId = normalizeId(observation?.attackerCapitalShipBaseId);
  const counterMembers = normalizeIds(observation?.attackerMembers);
  const allIds = normalizeIds([counterCapitalShipBaseId, ...counterMembers]);
  const ownedUnits = allIds.map((id) => shipIndex.get(id)).filter(Boolean);
  const missingBaseIds = allIds.filter((id) => !shipIndex.has(id));
  const reserved = new Set(normalizeIds(options.reservedBaseIds));
  const reserveUses = allIds.filter((id) => reserved.has(id));
  const match = compositionMatch(defense, observation);
  const reliability = reliabilityOf(observation);
  const available = allIds.length > 0 && missingBaseIds.length === 0 && reserveUses.length === 0;
  const actionable = available && match.actionable && reliability.automatic;
  const readiness = ownedUnits.map((unit) => shipReadiness(unit, ownerRoster, catalog));
  const minIntrinsicScore = readiness.length ? Math.min(...readiness.map((row) => row.intrinsicScore)) : null;
  return Object.freeze({
    source: 'historical-fleet-counter-evidence',
    defenderCapitalShipBaseId: normalizeId(defense?.capitalShipBaseId),
    counterCapitalShipBaseId,
    counterMembers: Object.freeze(counterMembers),
    fleetIds: Object.freeze(allIds),
    fleet: Object.freeze(ownedUnits),
    missingBaseIds: Object.freeze(missingBaseIds),
    reserveUses: Object.freeze(reserveUses),
    available,
    actionable,
    compositionMatch: match,
    reliability,
    battles: Math.max(0, n(observation?.battles)),
    wins: Math.max(0, n(observation?.wins)),
    holds: Math.max(0, n(observation?.holds)),
    draws: Math.max(0, n(observation?.draws)),
    observedWinRate: observation?.observedWinRate == null ? null : Math.max(0, Math.min(1, n(observation.observedWinRate))),
    evidenceSources: Object.freeze(Array.isArray(observation?.evidenceSources) ? observation.evidenceSources.map(clean).filter(Boolean) : []),
    seasons: Object.freeze(Array.isArray(observation?.seasons) ? observation.seasons.map(clean).filter(Boolean) : []),
    lastObservedAt: clean(observation?.lastObservedAt),
    readiness: Object.freeze(readiness),
    minIntrinsicScore,
    roleScope: clean(observation?.roleScope || 'starter-reinforcement-roles-not-retained-by-history-store'),
  });
}
function compareCandidates(left, right) {
  if (right.compositionMatch.rank !== left.compositionMatch.rank) return right.compositionMatch.rank - left.compositionMatch.rank;
  if (right.reliability.rank !== left.reliability.rank) return right.reliability.rank - left.reliability.rank;
  if (right.battles !== left.battles) return right.battles - left.battles;
  const rightRate = right.observedWinRate ?? -1;
  const leftRate = left.observedWinRate ?? -1;
  if (rightRate !== leftRate) return rightRate - leftRate;
  const rightReady = right.minIntrinsicScore ?? -1;
  const leftReady = left.minIntrinsicScore ?? -1;
  if (rightReady !== leftReady) return rightReady - leftReady;
  return left.counterCapitalShipBaseId.localeCompare(right.counterCapitalShipBaseId);
}
function fleetCandidates(ownerRoster, catalog, defense, evidence, options = {}) {
  return Object.freeze(evidenceForCapital(evidence, defense?.capitalShipBaseId)
    .map((observation) => fleetCandidate(ownerRoster, catalog, defense, observation, options))
    .sort(compareCandidates));
}
function candidateOverlaps(candidate, used) {
  return candidate.fleetIds.some((id) => used.has(id));
}
function futureConflict(candidate, future, used) {
  const chosen = new Set(candidate.fleetIds);
  let endangered = 0;
  let lost = 0;
  for (const entry of future) {
    const before = entry.candidates.filter((value) => value.actionable && !candidateOverlaps(value, used));
    if (!before.length) continue;
    const after = before.filter((value) => !value.fleetIds.some((id) => chosen.has(id)));
    lost += before.length - after.length;
    if (before.length && !after.length) endangered += 1;
  }
  return Object.freeze({ endangered, lost });
}
function allocationReason(candidate, conflict) {
  const parts = [
    `${candidate.reliability.label}: ${candidate.wins}/${candidate.battles} observed wins`,
    candidate.compositionMatch.label,
    'capital ship + ship identities owned',
  ];
  if (!conflict.endangered && !conflict.lost) parts.push('does not consume another current fleet counter');
  else if (!conflict.endangered) parts.push('preserves at least one historical fleet counter for every later fleet');
  else parts.push(`uses fleet resources also needed by ${conflict.endangered} later defense${conflict.endangered === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
function allocateFleetCounters(ownerRoster, catalog, defenses = [], evidence = {}, options = {}) {
  const baseUnavailable = new Set(normalizeIds(options.reservedBaseIds));
  const entries = (Array.isArray(defenses) ? defenses : [])
    .filter((defense) => defense?.complete !== false && normalizeId(defense?.capitalShipBaseId))
    .map((defense, index) => Object.freeze({
      index,
      defense,
      candidates: fleetCandidates(ownerRoster, catalog, defense, evidence, { reservedBaseIds: [...baseUnavailable] }),
    }));
  const ordered = [...entries].sort((left, right) => {
    const leftActionable = left.candidates.filter((candidate) => candidate.actionable).length;
    const rightActionable = right.candidates.filter((candidate) => candidate.actionable).length;
    if (leftActionable !== rightActionable) return leftActionable - rightActionable;
    const leftBest = left.candidates.find((candidate) => candidate.actionable);
    const rightBest = right.candidates.find((candidate) => candidate.actionable);
    if ((rightBest?.reliability?.rank || 0) !== (leftBest?.reliability?.rank || 0)) return (rightBest?.reliability?.rank || 0) - (leftBest?.reliability?.rank || 0);
    return left.index - right.index;
  });
  const used = new Set(baseUnavailable);
  const assignments = [];
  for (let cursor = 0; cursor < ordered.length; cursor += 1) {
    const entry = ordered[cursor];
    const available = entry.candidates.filter((candidate) => candidate.actionable && !candidateOverlaps(candidate, used));
    if (!available.length) continue;
    const future = ordered.slice(cursor + 1);
    const choices = available.map((candidate) => Object.freeze({
      candidate,
      conflict: futureConflict(candidate, future, used),
    })).sort((left, right) => {
      if (left.conflict.endangered !== right.conflict.endangered) return left.conflict.endangered - right.conflict.endangered;
      if (left.conflict.lost !== right.conflict.lost) return left.conflict.lost - right.conflict.lost;
      return compareCandidates(left.candidate, right.candidate);
    });
    const selected = choices[0];
    for (const id of selected.candidate.fleetIds) used.add(id);
    assignments.push(Object.freeze({
      sourceIndex: entry.index,
      slot: Number(entry.defense?.slot),
      defense: entry.defense,
      recommendation: selected.candidate,
      alternativesRemaining: Math.max(0, available.length - 1),
      endangeredFutureDefenses: selected.conflict.endangered,
      lostFutureCandidates: selected.conflict.lost,
      allocationReason: allocationReason(selected.candidate, selected.conflict),
      source: 'historical-fleet-counter-evidence',
    }));
  }
  return Object.freeze({
    source: 'historical-fleet-counter-evidence',
    assignments: Object.freeze(assignments.sort((a, b) => a.sourceIndex - b.sourceIndex)),
    usedBaseIds: Object.freeze([...used]),
    newlyUsedBaseIds: Object.freeze([...used].filter((id) => !baseUnavailable.has(id))),
    reservedBaseIds: Object.freeze([...baseUnavailable]),
    fleetDefenseCount: entries.length,
    allocatedFleetCount: assignments.length,
  });
}
function fleetRosterAvailability(ownerRoster = {}, plan = {}, reservedBaseIds = []) {
  const reserved = new Set(normalizeIds(reservedBaseIds));
  const allocated = new Set(normalizeIds((Array.isArray(plan?.assignments) ? plan.assignments : [])
    .flatMap((assignment) => assignment?.recommendation?.fleetIds || [])));
  const rows = shipRows(ownerRoster).map((unit) => {
    const baseId = normalizeId(unit);
    const status = reserved.has(baseId) ? 'reserved' : allocated.has(baseId) ? 'allocated' : 'available';
    return Object.freeze({ baseId, unit, status, capitalShip: isCapitalShip(unit) });
  }).filter((row) => row.baseId).sort((left, right) => {
    const statusRank = { allocated: 0, reserved: 1, available: 2 };
    if (statusRank[left.status] !== statusRank[right.status]) return statusRank[left.status] - statusRank[right.status];
    if (left.capitalShip !== right.capitalShip) return left.capitalShip ? -1 : 1;
    return n(right.unit?.power) - n(left.unit?.power) || clean(left.unit?.name).localeCompare(clean(right.unit?.name));
  });
  return Object.freeze({
    rows: Object.freeze(rows),
    counts: Object.freeze({
      allocated: rows.filter((row) => row.status === 'allocated').length,
      reserved: rows.filter((row) => row.status === 'reserved').length,
      available: rows.filter((row) => row.status === 'available').length,
    }),
  });
}

export {
  allocateFleetCounters,
  catalogIndex,
  compareCandidates,
  compositionMatch,
  crewContextForShip,
  evidenceForCapital,
  fleetCandidate,
  fleetCandidates,
  fleetObservedIds,
  fleetRosterAvailability,
  isCapitalShip,
  normalizeId,
  normalizeIds,
  sameSet,
  shipReadiness,
  subsetOf,
};
