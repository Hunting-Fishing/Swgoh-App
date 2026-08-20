import { eventProgress, requirementProgress } from './journey-progress.js';

const list = (value) => Array.isArray(value) ? value : [];
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const id = (value) => String(value || '').trim().toUpperCase();

export function farmTargetState(event, rosterMap, tracked = false) {
  const targetBaseId = id(event?.targetBaseId);
  const targetOwned = Boolean(targetBaseId && rosterMap?.has?.(targetBaseId));
  const progress = eventProgress(list(event?.requirements), rosterMap);
  if (targetOwned) return Object.freeze({ key: 'completed', label: 'COMPLETED', progress, targetOwned, tracked });
  if (progress.complete) return Object.freeze({ key: 'ready', label: 'READY TO UNLOCK', progress, targetOwned, tracked });
  if (tracked) return Object.freeze({ key: 'active', label: 'ACTIVE FARM', progress, targetOwned, tracked });
  return Object.freeze({ key: 'available', label: 'TRACK TO FARM', progress, targetOwned, tracked });
}

function progressionGaps(progress = {}) {
  return Object.freeze({
    stars: Math.max(0, number(progress.requiredStars) - number(progress.stars)),
    level: Math.max(0, number(progress.requiredLevel) - number(progress.level)),
    gear: Math.max(0, number(progress.requiredGear) - number(progress.gear)),
    relic: Math.max(0, number(progress.requiredRelic) - number(progress.relic)),
  });
}

export function requirementDelta(requirement, unit) {
  const progress = requirementProgress(unit, requirement);
  const gaps = progressionGaps(progress);
  if (progress.complete) {
    return Object.freeze({ key: 'complete', label: 'Complete', score: 0, gaps, progress });
  }
  if (!unit?.baseId) {
    return Object.freeze({ key: 'missing', label: 'Acquire unit', score: 1_000_000, gaps, progress });
  }

  const parts = [];
  if (gaps.stars) parts.push(`+${gaps.stars}★`);
  if (gaps.level) parts.push(`+${gaps.level} levels`);
  if (requirement?.type === 'GEAR' && gaps.gear) parts.push(`G${number(progress.gear)}→G${number(progress.requiredGear)}`);
  if (requirement?.type === 'RELIC') {
    if (gaps.gear) parts.push(`G${number(progress.gear)}→G${number(progress.requiredGear)}`);
    if (gaps.relic) parts.push(`R${number(progress.relic)}→R${number(progress.requiredRelic)}`);
  }

  const score = (gaps.stars * 100_000)
    + (gaps.gear * 10_000)
    + (gaps.relic * 1_000)
    + (gaps.level * 10);
  return Object.freeze({
    key: 'needs',
    label: parts.join(' · ') || 'Progression required',
    score,
    gaps,
    progress,
  });
}

export function requirementModel(requirement, rosterMap) {
  const baseId = id(requirement?.baseId);
  const unit = rosterMap?.get?.(baseId) || null;
  const delta = requirementDelta(requirement, unit);
  return Object.freeze({
    requirement,
    baseId,
    unit,
    delta,
    complete: delta.key === 'complete',
    missing: delta.key === 'missing',
  });
}

export function splitFarmRequirements(event, rosterMap) {
  const rows = list(event?.requirements).map((requirement) => requirementModel(requirement, rosterMap));
  const complete = rows.filter((row) => row.complete)
    .sort((a, b) => id(a.baseId).localeCompare(id(b.baseId)));
  const blockers = rows.filter((row) => !row.complete)
    .sort((a, b) => Number(b.missing) - Number(a.missing)
      || b.delta.score - a.delta.score
      || id(a.baseId).localeCompare(id(b.baseId)));
  return Object.freeze({
    blockers: Object.freeze(blockers),
    complete: Object.freeze(complete),
    total: rows.length,
  });
}

export function farmTargetModel(event, rosterMap, tracked = false) {
  const state = farmTargetState(event, rosterMap, tracked);
  const requirements = splitFarmRequirements(event, rosterMap);
  return Object.freeze({
    event,
    state,
    tracked,
    requirements,
    blockerCount: requirements.blockers.length,
    completedCount: requirements.complete.length,
  });
}

export function farmViewCounts(models = []) {
  const rows = list(models);
  return Object.freeze({
    active: rows.filter((model) => model.tracked && model.state.key === 'active').length,
    ready: rows.filter((model) => model.state.key === 'ready').length,
    completed: rows.filter((model) => model.state.key === 'completed').length,
    all: rows.length,
  });
}

export function filterFarmTargets(models = [], view = 'active', search = '') {
  const query = String(search || '').trim().toLowerCase();
  return list(models).filter((model) => {
    if (view === 'active' && !(model.tracked && model.state.key === 'active')) return false;
    if (view === 'ready' && model.state.key !== 'ready') return false;
    if (view === 'completed' && model.state.key !== 'completed') return false;
    if (!['active', 'ready', 'completed', 'all'].includes(view)) return false;
    if (!query) return true;
    const haystack = [
      model.event?.name,
      model.event?.shortName,
      model.event?.category,
      ...list(model.event?.requirements).map((requirement) => requirement.baseId),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}
