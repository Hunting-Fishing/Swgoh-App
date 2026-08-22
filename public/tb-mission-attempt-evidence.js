const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const TB_ATTEMPT_OUTCOME = Object.freeze({
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  UNKNOWN: 'unknown',
});

const TECHNICAL_ATTEMPT_RESULTS = Object.freeze(new Set([
  'technical_interruption',
  'railway_restart',
  'railway_deploy',
  'deployment_restart',
  'deployment_failure',
  'server_error',
  'service_unavailable',
  'api_timeout',
  'request_timeout',
  'network_error',
  'transport_failure',
  'save_failed',
]));

function unitBaseId(value = {}) {
  return upper(value?.baseId || value?.unitBaseId || value?.id);
}

function abilitySnapshot(ability = {}) {
  const tier = finite(ability?.tier ?? ability?.displayTier);
  return Object.freeze({
    id: text(ability?.id),
    name: text(ability?.name),
    tier,
    hasZeta: typeof ability?.hasZeta === 'boolean' ? ability.hasZeta : null,
    hasOmicron: typeof ability?.hasOmicron === 'boolean' ? ability.hasOmicron : null,
    omicronMode: finite(ability?.omicronMode),
  });
}

function statValue(unit = {}, key) {
  return finite(unit?.[key] ?? unit?.stats?.[key] ?? unit?.modStats?.[key] ?? unit?.calculatedStats?.[key]);
}

function progressionSnapshot(unit = {}) {
  return Object.freeze({
    baseId: unitBaseId(unit),
    level: finite(unit?.level),
    stars: finite(unit?.stars),
    gear: finite(unit?.gear),
    relic: finite(unit?.relic),
    zetaCount: finite(unit?.zetaCount),
    omicronCount: finite(unit?.omicronCount),
    abilities: Object.freeze(array(unit?.abilities).map((ability) => abilitySnapshot(ability))),
    stats: Object.freeze({
      speed: statValue(unit, 'speed'),
      health: statValue(unit, 'health'),
      protection: statValue(unit, 'protection'),
      offense: statValue(unit, 'offense'),
      physicalDamage: statValue(unit, 'physicalDamage'),
      specialDamage: statValue(unit, 'specialDamage'),
      potency: statValue(unit, 'potency'),
      tenacity: statValue(unit, 'tenacity'),
      criticalChance: statValue(unit, 'criticalChance'),
      criticalDamage: statValue(unit, 'criticalDamage'),
      defense: statValue(unit, 'defense'),
      armor: statValue(unit, 'armor'),
      resistance: statValue(unit, 'resistance'),
      accuracy: statValue(unit, 'accuracy'),
      criticalAvoidance: statValue(unit, 'criticalAvoidance'),
    }),
  });
}

export function normalizedTbSquadSignature(team = []) {
  const rows = array(team)
    .map((unit, index) => ({ ...progressionSnapshot(unit), slot: finite(unit?.slot, index) }))
    .filter((unit) => unit.baseId);
  if (!rows.length) return '';
  const leader = rows.find((row) => Number(row.slot) === 0) || rows[0];
  const remainder = rows.filter((row) => row !== leader).map((row) => row.baseId).sort();
  return [leader.baseId, ...remainder].join('|');
}

function resultText(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_');
}

function technicalAttemptInterruption(input = {}, result = '') {
  return input?.technicalInterruption === true || TECHNICAL_ATTEMPT_RESULTS.has(result);
}

export function normalizeTbMissionAttemptOutcome(input = {}) {
  const result = resultText(input?.result);
  const wavesCompleted = finite(input?.wavesCompleted, null);
  const wavesTotal = finite(input?.wavesTotal, null);

  if (technicalAttemptInterruption(input, result)) return TB_ATTEMPT_OUTCOME.UNKNOWN;
  if (['skipped', 'skip', 'intentional_skip'].includes(result)) return TB_ATTEMPT_OUTCOME.SKIPPED;
  if (['complete', 'completed', 'success', 'win', '2_of_2', '3_of_3', '4_of_4'].includes(result)) return TB_ATTEMPT_OUTCOME.COMPLETE;
  if (['failed', 'battle_failed', 'loss', '0_of_2', '0_of_1'].includes(result)) return TB_ATTEMPT_OUTCOME.FAILED;
  if (['partial', '1_of_2', '1_of_3', '2_of_3', '1_of_4', '2_of_4', '3_of_4'].includes(result)) return TB_ATTEMPT_OUTCOME.PARTIAL;
  if (wavesCompleted != null && wavesTotal != null && wavesTotal > 0) {
    if (wavesCompleted >= wavesTotal) return TB_ATTEMPT_OUTCOME.COMPLETE;
    if (wavesCompleted > 0) return TB_ATTEMPT_OUTCOME.PARTIAL;
    return TB_ATTEMPT_OUTCOME.FAILED;
  }
  return TB_ATTEMPT_OUTCOME.UNKNOWN;
}

export function normalizeTbMissionAttempt(input = {}) {
  const team = array(input?.team).map((unit, index) => Object.freeze({ ...progressionSnapshot(unit), slot: finite(unit?.slot, index) }));
  const outcome = normalizeTbMissionAttemptOutcome(input);
  return Object.freeze({
    id: text(input?.id),
    guildId: text(input?.guildId),
    eventId: text(input?.eventId),
    phase: upper(input?.phase),
    planetId: text(input?.planetId).toLowerCase(),
    missionId: text(input?.missionId),
    playerId: text(input?.playerId),
    allyCode: text(input?.allyCode).replace(/\D/g, ''),
    team: Object.freeze(team),
    squadSignature: text(input?.squadSignature) || normalizedTbSquadSignature(input?.team),
    outcome,
    wavesCompleted: finite(input?.wavesCompleted),
    wavesTotal: finite(input?.wavesTotal),
    strategicAbilitySnapshot: input?.strategicAbilitySnapshot && typeof input.strategicAbilitySnapshot === 'object' ? Object.freeze({ ...input.strategicAbilitySnapshot }) : null,
    operationStateSnapshot: input?.operationStateSnapshot && typeof input.operationStateSnapshot === 'object' ? Object.freeze({ ...input.operationStateSnapshot }) : null,
    source: text(input?.source || 'unknown'),
    reportedAt: text(input?.reportedAt),
  });
}

function attemptCountable(row) {
  return row.outcome !== TB_ATTEMPT_OUTCOME.SKIPPED && row.outcome !== TB_ATTEMPT_OUTCOME.UNKNOWN;
}

function roundedRate(value) {
  return Math.round(value * 1000) / 10;
}

export function aggregateTbMissionAttempts(attempts = [], options = {}) {
  const minimumRateSample = Math.max(1, Math.floor(finite(options?.minimumRateSample, 5)));
  const adequateSample = Math.max(minimumRateSample, Math.floor(finite(options?.adequateSample, 20)));
  const normalized = array(attempts).map((attempt) => normalizeTbMissionAttempt(attempt));
  const countable = normalized.filter(attemptCountable);
  const complete = countable.filter((row) => row.outcome === TB_ATTEMPT_OUTCOME.COMPLETE).length;
  const partial = countable.filter((row) => row.outcome === TB_ATTEMPT_OUTCOME.PARTIAL).length;
  const failed = countable.filter((row) => row.outcome === TB_ATTEMPT_OUTCOME.FAILED).length;
  const skipped = normalized.filter((row) => row.outcome === TB_ATTEMPT_OUTCOME.SKIPPED).length;
  const unknown = normalized.filter((row) => row.outcome === TB_ATTEMPT_OUTCOME.UNKNOWN).length;
  const observedCompletionRate = countable.length >= minimumRateSample ? roundedRate(complete / countable.length) : null;
  const sampleLabel = countable.length < minimumRateSample
    ? 'RAW ATTEMPTS ONLY'
    : countable.length < adequateSample
      ? 'LOW SAMPLE — OBSERVED RATE'
      : 'OBSERVED RATE';

  return Object.freeze({
    recorded: normalized.length,
    attempts: countable.length,
    complete,
    partial,
    failed,
    skipped,
    unknown,
    observedCompletionRate,
    sampleLabel,
    minimumRateSample,
    adequateSample,
    predictiveProbability: null,
    evidenceBoundary: 'Observed completion rate is descriptive Guild evidence, not a predicted win probability.',
  });
}

export function aggregateTbMissionAttemptsBySquad(attempts = [], options = {}) {
  const groups = new Map();
  for (const attempt of array(attempts).map((row) => normalizeTbMissionAttempt(row))) {
    const signature = attempt.squadSignature || 'UNKNOWN-SQUAD';
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(attempt);
  }

  return Object.freeze([...groups.entries()].map(([squadSignature, rows]) => Object.freeze({
    squadSignature,
    ...aggregateTbMissionAttempts(rows, options),
  })).sort((a, b) => b.attempts - a.attempts || (b.observedCompletionRate ?? -1) - (a.observedCompletionRate ?? -1) || a.squadSignature.localeCompare(b.squadSignature)));
}
