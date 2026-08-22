import { buildCounterMatrix, normalizeId, normalizeMembers, teamSignature } from './gac-counter-matrix-model.js';

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function assignmentMembers(assignment = {}) {
  return normalizeMembers(assignment?.members || assignment?.attackerMembers || assignment?.counterMembers);
}

function plannedDefenseId(assignment = {}) {
  const id = Number(assignment?.defenseId || assignment?.defense_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function assignmentStatus(assignment = {}) {
  return clean(assignment?.status).toLowerCase() || 'unknown';
}

function roundPlanSummary(attackPlan = {}) {
  const assignments = Array.isArray(attackPlan?.assignments) ? attackPlan.assignments : [];
  const statuses = { planned: 0, attempted: 0, win: 0, loss: 0, abandoned: 0, unknown: 0 };
  const banners = [];
  const used = new Set();
  for (const assignment of assignments) {
    const status = assignmentStatus(assignment);
    if (!(status in statuses)) statuses.unknown += 1;
    else statuses[status] += 1;
    for (const id of assignmentMembers(assignment)) used.add(id);
    const attemptBanners = [];
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of normalizeMembers(attempt?.members)) used.add(id);
      if (Number.isFinite(Number(attempt?.banners))) attemptBanners.push(Number(attempt.banners));
    }
    if (attemptBanners.length) banners.push(...attemptBanners);
    else if (Number.isFinite(Number(assignment?.banners))) banners.push(Number(assignment.banners));
  }
  return Object.freeze({
    assignments: assignments.length,
    statuses: Object.freeze(statuses),
    usedBaseIds: Object.freeze([...used]),
    recordedBanners: banners.reduce((sum, value) => sum + value, 0),
    recordedBannerSamples: banners.length,
  });
}

function rowCandidateSummary(row = {}, minimumBattles = 5) {
  const threshold = Math.max(1, n(minimumBattles) || 5);
  const variants = (Array.isArray(row?.variants) ? row.variants : [])
    .filter((variant) => variant?.availability?.available === true && n(variant?.battles) >= threshold);
  const squads = new Set();
  const leaders = new Set();
  let best = null;
  for (const variant of variants) {
    squads.add(teamSignature(variant.counterLeaderBaseId, variant.counterMembers));
    if (normalizeId(variant.counterLeaderBaseId)) leaders.add(normalizeId(variant.counterLeaderBaseId));
    if (!best || n(variant.winRate) > n(best.winRate) || (n(variant.winRate) === n(best.winRate) && n(variant.battles) > n(best.battles))) best = variant;
  }
  const count = squads.size;
  const scarcity = count === 0 ? 'uncovered' : count === 1 ? 'critical' : count <= 3 ? 'scarce' : count <= 6 ? 'limited' : 'flexible';
  return Object.freeze({
    counterSquads: count,
    counterLeaders: leaders.size,
    scarcity,
    best,
  });
}

function buildBoardOptimization({
  defenses = [],
  batch = {},
  ownRoster = {},
  unavailableBaseIds = [],
  attackPlan = {},
  minimumBattles = 5,
  minimumRelic = 0,
  exactDefenseFirst = true,
} = {}) {
  const matrix = buildCounterMatrix({
    defenses,
    batch,
    ownRoster,
    unavailableBaseIds,
    minimumBattles,
    minimumRelic,
    rosterOnly: true,
    exactDefenseFirst,
    maxColumns: 60,
  });
  const allocationByRow = new Map(matrix.allocation.assignments.map((row) => [row.rowKey, row]));
  const existingByDefense = new Map();
  for (const assignment of Array.isArray(attackPlan?.assignments) ? attackPlan.assignments : []) {
    const id = plannedDefenseId(assignment);
    if (id) existingByDefense.set(id, assignment);
  }
  const rows = matrix.rows.map((row) => {
    const candidates = rowCandidateSummary(row, minimumBattles);
    const proposed = allocationByRow.get(row.key) || null;
    const existing = row.defenseId ? existingByDefense.get(row.defenseId) || null : null;
    return Object.freeze({
      key: row.key,
      defenseId: row.defenseId,
      zone: row.zone,
      slot: row.slot,
      leaderBaseId: row.leaderBaseId,
      members: row.members,
      evidenceScope: row.scope,
      counterSquads: candidates.counterSquads,
      counterLeaders: candidates.counterLeaders,
      scarcity: candidates.scarcity,
      bestWinRate: candidates.best ? Number(candidates.best.winRate) : null,
      bestBattles: candidates.best ? n(candidates.best.battles) : 0,
      bestAverageBanners: candidates.best && Number.isFinite(Number(candidates.best.averageBanners)) ? Number(candidates.best.averageBanners) : null,
      proposedCounter: proposed,
      existingPlan: existing ? Object.freeze({
        id: Number(existing.id) || null,
        status: assignmentStatus(existing),
        leaderBaseId: normalizeId(existing.leaderBaseId || existing.attackerLeaderBaseId),
        members: Object.freeze(assignmentMembers(existing)),
        datacronId: clean(existing?.datacron?.id),
      }) : null,
    });
  });
  const scarcity = rows.reduce((acc, row) => {
    acc[row.scarcity] = (acc[row.scarcity] || 0) + 1;
    return acc;
  }, {});
  const exactRows = rows.filter((row) => row.evidenceScope === 'exact-defense').length;
  const projected = matrix.allocation.assignments;
  const winRates = projected.map((row) => Number(row.winRate)).filter(Number.isFinite);
  const weightedBattles = projected.reduce((sum, row) => sum + n(row.battles), 0);
  const weightedWinRate = weightedBattles
    ? projected.reduce((sum, row) => sum + n(row.winRate) * n(row.battles), 0) / weightedBattles
    : null;
  const projectedMembers = new Set(projected.flatMap((row) => normalizeMembers(row.counterMembers)));
  const plan = roundPlanSummary(attackPlan);
  return Object.freeze({
    rows: Object.freeze(rows),
    totalDefenses: rows.length,
    coveredDefenses: matrix.coveredRows,
    coverageRate: rows.length ? matrix.coveredRows / rows.length : 0,
    projectedBanners: matrix.projectedBanners,
    projectedUniqueAttackers: projectedMembers.size,
    projectedAverageWinRate: winRates.length ? winRates.reduce((sum, value) => sum + value, 0) / winRates.length : null,
    projectedBattleWeightedWinRate: weightedWinRate,
    exactEvidenceRows: exactRows,
    aggregateEvidenceRows: rows.length - exactRows,
    scarcity: Object.freeze({
      uncovered: scarcity.uncovered || 0,
      critical: scarcity.critical || 0,
      scarce: scarcity.scarce || 0,
      limited: scarcity.limited || 0,
      flexible: scarcity.flexible || 0,
    }),
    plan,
    allocation: matrix.allocation,
  });
}

function priorityRows(optimization = {}) {
  const order = { uncovered: 0, critical: 1, scarce: 2, limited: 3, flexible: 4 };
  return (Array.isArray(optimization?.rows) ? optimization.rows : []).slice().sort((a, b) =>
    (order[a.scarcity] ?? 9) - (order[b.scarcity] ?? 9) ||
    n(a.counterSquads) - n(b.counterSquads) ||
    n(a.bestWinRate) - n(b.bestWinRate) ||
    n(a.slot) - n(b.slot)
  );
}

export { buildBoardOptimization, priorityRows, roundPlanSummary, rowCandidateSummary };
