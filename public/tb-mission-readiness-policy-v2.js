import {
  evaluateTbMissionReadinessV2,
  TB_READINESS_EVIDENCE,
  TB_TACTICAL_READINESS,
} from './tb-mission-readiness-v2.js';

export const TB_TACTICAL_READINESS_V2 = Object.freeze({
  ...TB_TACTICAL_READINESS,
  NEEDS_LEVEL: 'NEEDS LEVEL',
  NEEDS_GEAR_RELICS: 'NEEDS GEAR / RELICS',
});

const array = (value) => Array.isArray(value) ? value : [];

function failedProgression(result = {}) {
  return array(result.progression).flatMap((row) => [
    { baseId: row?.baseId || '', name: row?.name || '', key: 'level', evidence: row?.level },
    { baseId: row?.baseId || '', name: row?.name || '', key: 'stars', evidence: row?.stars },
    { baseId: row?.baseId || '', name: row?.name || '', key: 'gear', evidence: row?.gear },
    { baseId: row?.baseId || '', name: row?.name || '', key: 'relic', evidence: row?.relic },
  ]).filter((row) => row.evidence?.state === TB_READINESS_EVIDENCE.FAIL);
}

function unknownRequiredEvidence(result = {}) {
  const explicit = [
    ...array(result.abilities),
    ...array(result.zetas),
    ...array(result.omicrons),
    ...array(result.stats),
  ].filter((row) => row?.required === true && row?.state === TB_READINESS_EVIDENCE.UNKNOWN)
    .map((row) => ({ type: 'battle-evidence', ...row }));

  const progression = array(result.progression).flatMap((row) => [
    ['level', row?.level],
    ['stars', row?.stars],
    ['gear', row?.gear],
    ['relic', row?.relic],
  ].filter(([, evidence]) => evidence?.state === TB_READINESS_EVIDENCE.UNKNOWN)
    .map(([key, evidence]) => ({ type: 'progression', baseId: row?.baseId || '', name: row?.name || '', key, ...evidence })));

  return [...progression, ...explicit];
}

export function refineTbTacticalReadinessVerdict(result = {}) {
  if (result?.entry?.ready !== true) return result?.verdict || TB_TACTICAL_READINESS_V2.BLOCKED_ENTRY;

  // The lower-level evaluator intentionally surfaces all progression evidence.
  // Once the official entry gate is already true, a higher community/minimum
  // battle target must never be relabeled as an official entry failure.
  if (result?.verdict === TB_TACTICAL_READINESS.BLOCKED_ENTRY) {
    const failed = failedProgression(result);
    if (failed.some((row) => row.key === 'level')) return TB_TACTICAL_READINESS_V2.NEEDS_LEVEL;
    if (failed.some((row) => row.key === 'gear' || row.key === 'relic' || row.key === 'stars')) return TB_TACTICAL_READINESS_V2.NEEDS_GEAR_RELICS;
  }

  return result?.verdict || TB_TACTICAL_READINESS_V2.ENTRY_READY_BATTLE_UNKNOWN;
}

export function evaluateTbMissionReadinessPolicyV2(body = {}, mission = {}, recommendation = null, catalog = {}) {
  const evidence = evaluateTbMissionReadinessV2(body, mission, recommendation, catalog);
  const verdict = refineTbTacticalReadinessVerdict(evidence);
  const progressionFailures = failedProgression(evidence);
  const unknownEvidence = unknownRequiredEvidence(evidence);

  return Object.freeze({
    ...evidence,
    verdict,
    progressionFailures: Object.freeze(progressionFailures.map((row) => Object.freeze(row))),
    unknownEvidence: Object.freeze(unknownEvidence.map((row) => Object.freeze(row))),
    officialEntryReady: evidence?.entry?.ready === true,
    battleEvidenceComplete: unknownEvidence.length === 0,
  });
}
