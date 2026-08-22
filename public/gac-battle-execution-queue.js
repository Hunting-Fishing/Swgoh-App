import { priorityRows } from './gac-board-optimization-model.js';

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function evidenceRisk(row = {}) {
  return clean(row?.proposedCounter?.failureRiskBand || row?.bestFailureRiskBand || 'unknown').toLowerCase();
}

function evidenceFloor(row = {}) {
  const value = row?.proposedCounter?.observedWinRateLowerBound90 ?? row?.bestEvidenceFloor90;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function evidenceBattles(row = {}) {
  return Math.max(0, n(row?.proposedCounter?.battles ?? row?.bestBattles));
}

function executionReasonTags(row = {}) {
  const tags = [];
  const status = clean(row?.existingPlan?.status).toLowerCase();
  const counterCount = Math.max(0, Math.floor(n(row?.counterSquads)));
  const risk = evidenceRisk(row);
  const proposed = row?.proposedCounter || null;
  const undersize = Math.max(0, Math.floor(n(proposed?.undersizeCount ?? row?.bestUndersizeCount)));
  const relicBurden = clean(proposed?.relicBurdenBand || row?.bestRelicBurdenBand).toLowerCase();

  if (status === 'attempted') tags.push('ACTIVE ATTEMPT');
  else if (status === 'planned') tags.push('SERVER PLAN LOCKED');
  else if (status === 'win') tags.push('COMPLETE');
  else if (status === 'loss' || status === 'abandoned') tags.push('CLEANUP INTELLIGENCE REQUIRED');

  if (!row?.defenseId) tags.push('BOARD DEFENSE NOT SYNCED');
  if (!proposed && !row?.existingPlan) tags.push('NO QUALIFYING UNIQUE COUNTER');
  if (counterCount === 1) tags.push('ONLY 1 QUALIFYING COUNTER');
  else if (counterCount > 1 && counterCount <= 3) tags.push(`${counterCount} QUALIFYING COUNTERS`);

  if (risk === 'critical' || risk === 'high') tags.push(`${risk.toUpperCase()} EVIDENCE RISK`);
  else if (risk === 'insufficient') tags.push('LOW SAMPLE EVIDENCE');
  else if (risk === 'unknown') tags.push('EVIDENCE RISK UNKNOWN');

  if (clean(row?.evidenceScope) === 'exact-defense') tags.push('EXACT DEFENSE EVIDENCE');
  else if (row?.evidenceScope) tags.push('LEADER-LEVEL FALLBACK');
  if (undersize > 0) tags.push(`HISTORICAL ${undersize}-UNIT UNDERSIZE`);
  if (relicBurden === 'high' || relicBurden === 'elevated') tags.push('RELIC ADVANTAGE EVIDENCE');

  return Object.freeze([...new Set(tags)]);
}

function queueClassification(row = {}) {
  const status = clean(row?.existingPlan?.status).toLowerCase();
  if (status === 'win') return Object.freeze({ section: 'complete', action: 'complete', executable: false });
  if (status === 'loss' || status === 'abandoned') return Object.freeze({ section: 'blockers', action: 'cleanup-review', executable: false });
  if (status === 'attempted') return Object.freeze({ section: 'steps', action: 'active-attempt', executable: true });
  if (status === 'planned') return Object.freeze({ section: 'steps', action: 'server-plan', executable: true });
  if (!row?.defenseId) return Object.freeze({ section: 'blockers', action: 'sync-defense', executable: false });
  if (row?.proposedCounter) return Object.freeze({ section: 'steps', action: 'plan-proposed', executable: true });
  return Object.freeze({ section: 'blockers', action: 'officer-review', executable: false });
}

function queueEntry(row = {}, sequence = null) {
  const classification = queueClassification(row);
  const proposed = row?.proposedCounter || null;
  const existing = row?.existingPlan || null;
  return Object.freeze({
    sequence,
    section: classification.section,
    action: classification.action,
    executable: classification.executable,
    key: clean(row?.key),
    defenseId: Number(row?.defenseId) || null,
    zone: clean(row?.zone),
    slot: Number.isFinite(Number(row?.slot)) ? Number(row.slot) : null,
    defenderLeaderBaseId: clean(row?.leaderBaseId),
    defenderMembers: Object.freeze(Array.isArray(row?.members) ? [...row.members] : []),
    scarcity: clean(row?.scarcity) || 'uncovered',
    counterSquads: Math.max(0, Math.floor(n(row?.counterSquads))),
    evidenceScope: clean(row?.evidenceScope),
    evidenceRisk: evidenceRisk(row),
    evidenceFloor90: evidenceFloor(row),
    evidenceBattles: evidenceBattles(row),
    reasons: executionReasonTags(row),
    existingPlan: existing,
    proposedCounter: proposed,
  });
}

function buildBattleExecutionQueue(optimization = {}) {
  const ordered = priorityRows(optimization);
  const active = [];
  const planned = [];
  const proposals = [];
  const blockers = [];
  const complete = [];

  for (const row of ordered) {
    const classification = queueClassification(row);
    if (classification.action === 'active-attempt') active.push(row);
    else if (classification.action === 'server-plan') planned.push(row);
    else if (classification.action === 'plan-proposed') proposals.push(row);
    else if (classification.section === 'complete') complete.push(row);
    else blockers.push(row);
  }

  let sequence = 0;
  const steps = [...active, ...planned, ...proposals].map((row) => queueEntry(row, ++sequence));
  const blockerEntries = blockers.map((row) => queueEntry(row, null));
  const completeEntries = complete.map((row) => queueEntry(row, null));
  const freshProposals = steps.filter((row) => row.action === 'plan-proposed').length;
  const locked = steps.filter((row) => row.action === 'server-plan').length;
  const activeAttempts = steps.filter((row) => row.action === 'active-attempt').length;
  const cleanupReview = blockerEntries.filter((row) => row.action === 'cleanup-review').length;

  return Object.freeze({
    contract: 'gac-battle-execution-queue-v1',
    steps: Object.freeze(steps),
    blockers: Object.freeze(blockerEntries),
    complete: Object.freeze(completeEntries),
    summary: Object.freeze({
      executableSteps: steps.length,
      activeAttempts,
      locked,
      freshProposals,
      blockers: blockerEntries.length,
      cleanupReview,
      completed: completeEntries.length,
    }),
    evidenceBoundary: 'Execution order is deterministic from current server plan state, counter scarcity and historical evidence descriptors. It is not a prediction that an attack will win.',
  });
}

export { buildBattleExecutionQueue, executionReasonTags, queueClassification, queueEntry };
