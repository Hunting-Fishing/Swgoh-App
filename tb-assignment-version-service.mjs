import { createHash } from 'node:crypto';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function normalizeRotePhase(value) {
  const phase = text(value).toUpperCase();
  if (!/^P[1-6]$/.test(phase)) {
    const error = new Error('ROTE phase must be P1 through P6.');
    error.status = 400;
    error.code = 'INVALID_ROTE_PHASE';
    throw error;
  }
  return phase;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    const next = value[key];
    if (next === undefined) continue;
    sorted[key] = canonicalize(next);
  }
  return sorted;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function tbAssignmentHashPayload(input = {}) {
  const versionNumber = Math.floor(Number(input.versionNumber));
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    const error = new Error('A positive assignment version number is required.');
    error.status = 400;
    error.code = 'INVALID_ASSIGNMENT_VERSION';
    throw error;
  }

  return Object.freeze({
    guildId: text(input.guildId),
    planId: text(input.planId) || null,
    rotePhase: normalizeRotePhase(input.rotePhase),
    versionNumber,
    inputFingerprint: text(input.inputFingerprint) || null,
    assignments: array(input.assignments),
    unfilled: array(input.unfilled),
    diagnostics: object(input.diagnostics),
  });
}

export function computeTbAssignmentPlanHash(input = {}) {
  const payload = tbAssignmentHashPayload(input);
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

export function recomputeTbAssignmentRunHash(run = {}) {
  return computeTbAssignmentPlanHash({
    guildId: run.guild_id ?? run.guildId,
    planId: run.plan_id ?? run.planId,
    rotePhase: run.rote_phase ?? run.rotePhase,
    versionNumber: run.version_number ?? run.versionNumber,
    inputFingerprint: run.input_fingerprint ?? run.inputFingerprint,
    assignments: run.assignments,
    unfilled: run.unfilled,
    diagnostics: run.diagnostics,
  });
}

export function verifyTbAssignmentRunHash(run = {}) {
  const stored = text(run.plan_hash ?? run.planHash).toLowerCase();
  const recomputed = recomputeTbAssignmentRunHash(run);
  return Object.freeze({
    valid: /^[0-9a-f]{64}$/.test(stored) && stored === recomputed,
    stored,
    recomputed,
  });
}
