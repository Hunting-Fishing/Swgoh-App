import { buildGuildRoteMissionCoverage } from './guild-rote-mission-coverage-model.js';
import { evaluateTbMissionReadinessPolicyV2 } from './tb-mission-readiness-policy-v2.js';
import { TB_TACTICAL_READINESS } from './tb-mission-readiness-v2.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

export const GUILD_ROTE_TACTICAL_STATE = Object.freeze({
  ENTRY_READY: 'ENTRY READY',
  MINIMUM_READY: 'MINIMUM READY',
  SAFER_READY: 'SAFER READY',
  BLOCKED: 'BLOCKED',
  UNKNOWN_EVIDENCE: 'UNKNOWN EVIDENCE',
});

export const GUILD_ROTE_TACTICAL_STATE_ORDER = Object.freeze([
  GUILD_ROTE_TACTICAL_STATE.SAFER_READY,
  GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY,
  GUILD_ROTE_TACTICAL_STATE.ENTRY_READY,
  GUILD_ROTE_TACTICAL_STATE.BLOCKED,
  GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE,
]);

function selectedRecommendation(mission = {}, options = {}) {
  if (typeof options.recommendationResolver === 'function') {
    const resolved = options.recommendationResolver(mission);
    if (resolved) return resolved;
  }
  const wantedId = text(options.recommendationIdByMission?.[mission?.id]);
  const recommendations = array(mission?.recommendations);
  if (wantedId) {
    const exact = recommendations.find((row) => text(row?.id) === wantedId);
    if (exact) return exact;
  }
  return recommendations[0] || null;
}

export function classifyGuildRoteTacticalReadiness(input = {}) {
  if (input.rosterAvailable !== true) return GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE;
  if (text(input.entryEvidence || 'exact') !== 'exact') return GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE;

  const readiness = input.readiness || null;
  if (!readiness) return GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE;
  if (readiness.officialEntryReady !== true) return GUILD_ROTE_TACTICAL_STATE.BLOCKED;
  if (array(readiness.unknownEvidence).length > 0) return GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE;

  if (readiness.verdict === TB_TACTICAL_READINESS.SAFER_TARGET_READY) {
    return GUILD_ROTE_TACTICAL_STATE.SAFER_READY;
  }
  if (readiness.verdict === TB_TACTICAL_READINESS.MINIMUM_READY) {
    return GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY;
  }
  return GUILD_ROTE_TACTICAL_STATE.ENTRY_READY;
}

function tacticalGapLabel(readiness = null) {
  if (!readiness) return 'Roster or tactical evidence unavailable';
  if (readiness.officialEntryReady !== true) return text(readiness.verdict || 'Official entry blocked');
  if (array(readiness.unknownEvidence).length) return `${array(readiness.unknownEvidence).length} required evidence item(s) unknown`;
  if (readiness.verdict === TB_TACTICAL_READINESS.SAFER_TARGET_READY) return 'Safer target met';
  if (readiness.verdict === TB_TACTICAL_READINESS.MINIMUM_READY) return 'Minimum target met';
  return text(readiness.verdict || 'Official entry ready');
}

export function buildGuildRoteTacticalCell(member = {}, missionRow = {}, catalog = [], options = {}) {
  const entryEvidence = text(missionRow?.evidence || 'exact');
  if (member?.rosterAvailable !== true || entryEvidence !== 'exact') {
    const state = GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE;
    return Object.freeze({
      member,
      state,
      entryEvidence,
      recommendation: null,
      readiness: null,
      officialEntryReady: null,
      verdict: '',
      unknownEvidenceCount: member?.rosterAvailable === true ? 0 : 1,
      tacticalGap: member?.rosterAvailable === true ? 'Mission entry evidence is incomplete' : 'Guild member roster is unavailable',
    });
  }

  const mission = missionRow?.mission || {};
  const recommendation = selectedRecommendation(mission, options);
  const readiness = evaluateTbMissionReadinessPolicyV2(
    member,
    mission,
    recommendation,
    { units: array(catalog) },
  );
  const state = classifyGuildRoteTacticalReadiness({
    rosterAvailable: true,
    entryEvidence,
    readiness,
  });

  return Object.freeze({
    member,
    state,
    entryEvidence,
    recommendation,
    readiness,
    officialEntryReady: readiness?.officialEntryReady === true,
    verdict: text(readiness?.verdict),
    unknownEvidenceCount: array(readiness?.unknownEvidence).length,
    progressionFailureCount: array(readiness?.progressionFailures).length,
    tacticalGap: tacticalGapLabel(readiness),
  });
}

export function summarizeGuildRoteTacticalCells(cells = []) {
  const counts = Object.fromEntries(GUILD_ROTE_TACTICAL_STATE_ORDER.map((state) => [state, 0]));
  for (const cell of array(cells)) {
    const state = GUILD_ROTE_TACTICAL_STATE_ORDER.includes(cell?.state)
      ? cell.state
      : GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE;
    counts[state] += 1;
  }
  const known = array(cells).length - counts[GUILD_ROTE_TACTICAL_STATE.UNKNOWN_EVIDENCE];
  const battleReady = counts[GUILD_ROTE_TACTICAL_STATE.MINIMUM_READY] + counts[GUILD_ROTE_TACTICAL_STATE.SAFER_READY];
  return Object.freeze({
    total: array(cells).length,
    known,
    battleReady,
    counts: Object.freeze(counts),
  });
}

export function buildGuildRoteTacticalMissionRow(missionRow = {}, members = [], catalog = [], options = {}) {
  const cells = array(members).map((member) => buildGuildRoteTacticalCell(member, missionRow, catalog, options));
  return Object.freeze({
    key: text(missionRow?.key || missionRow?.mission?.id),
    planetId: text(missionRow?.planetId),
    planetName: text(missionRow?.planetName),
    phase: text(missionRow?.phase),
    lane: text(missionRow?.lane),
    mission: missionRow?.mission || null,
    evidence: text(missionRow?.evidence || 'exact'),
    cells: Object.freeze(cells),
    summary: summarizeGuildRoteTacticalCells(cells),
  });
}

export function buildGuildRoteTacticalReadinessMatrix(guildSnapshot = {}, catalog = [], options = {}) {
  const coverage = options.coverage || buildGuildRoteMissionCoverage(guildSnapshot, catalog, {
    redundancyTarget: options.redundancyTarget,
  });
  const members = array(coverage?.members);
  const missions = array(coverage?.missions).map((missionRow) =>
    buildGuildRoteTacticalMissionRow(missionRow, members, catalog, options));
  const cells = missions.flatMap((mission) => mission.cells);

  return Object.freeze({
    source: 'guild-rote-tactical-readiness-v2',
    states: GUILD_ROTE_TACTICAL_STATE,
    members: Object.freeze(members),
    missions: Object.freeze(missions),
    summary: summarizeGuildRoteTacticalCells(cells),
    evidenceBoundary: 'Official entry legality, tactical battle preparation, and unknown evidence remain separate. UNKNOWN is never coerced to zero or failure.',
  });
}
