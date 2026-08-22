import { analyzeTeamCombatPreparation } from './tb-combat-intelligence.js';
import { evaluateTbMissionReadinessPolicyV2 } from './tb-mission-readiness-policy-v2.js';
import {
  aggregateTbMissionAttempts,
  aggregateTbMissionAttemptsBySquad,
} from './tb-mission-attempt-evidence.js';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();

export const ROTE_TACTICAL_EVIDENCE_CLASS = Object.freeze({
  GAME_DATA: 'GAME DATA / VERIFIED',
  COMMUNITY: 'COMMUNITY REFERENCE',
  GUILD: 'GUILD EVIDENCE',
  PLAYER: 'PLAYER EVIDENCE',
});

function recommendationForNode(node = {}) {
  const recommendations = array(node?.mission?.recommendations);
  const wanted = text(node?.recommendationId);
  if (wanted) {
    const exact = recommendations.find((row) => text(row?.id) === wanted);
    if (exact) return exact;
  }
  return recommendations[0] || null;
}

function missionAttempts(node, attempts) {
  const missionId = text(node?.missionId || node?.mission?.id);
  return array(attempts).filter((row) => !missionId || text(row?.missionId) === missionId);
}

function playerAttempts(rows, player = {}) {
  const playerId = text(player?.playerId);
  const allyCode = text(player?.allyCode).replace(/\D/g, '');
  if (!playerId && !allyCode) return [];
  return rows.filter((row) => (playerId && text(row?.playerId) === playerId)
    || (allyCode && text(row?.allyCode).replace(/\D/g, '') === allyCode));
}

function communitySources(recommendation = {}) {
  const sources = [
    ...array(recommendation?.sources),
    ...array(recommendation?.sourceRefs),
    text(recommendation?.source),
  ].filter(Boolean);
  return Object.freeze([...new Set(sources.map(text).filter(Boolean))]);
}

export function buildRoteTacticalMissionIntelligence(options = {}) {
  const node = options?.node || null;
  const mission = node?.mission || null;
  if (!mission) return null;

  const body = options?.body || null;
  const catalog = options?.catalog || {};
  const recommendation = options?.recommendation || recommendationForNode(node);
  const readiness = body
    ? (node?.readiness || evaluateTbMissionReadinessPolicyV2(body, mission, recommendation, catalog))
    : null;
  const combat = body && recommendation
    ? analyzeTeamCombatPreparation(body, mission, recommendation, catalog, options?.knowledge || {})
    : null;

  const attempts = missionAttempts(node, options?.attempts);
  const guildEvidence = aggregateTbMissionAttempts(attempts, options?.samplePolicy || {});
  const squads = aggregateTbMissionAttemptsBySquad(attempts, options?.samplePolicy || {});
  const personalRows = playerAttempts(attempts, options?.player || {});
  const personalEvidence = aggregateTbMissionAttempts(personalRows, options?.samplePolicy || {});

  return Object.freeze({
    missionId: text(mission?.id),
    planetId: text(mission?.planetId || node?.planetId),
    phase: text(mission?.phase),
    missionType: text(mission?.missionType),
    node: Object.freeze({ id: text(node?.id), top: Number(node?.top || 0), left: Number(node?.left || 0) }),
    recommendationId: text(recommendation?.id),
    readiness,
    mechanics: Object.freeze(array(combat?.mechanics || mission?.mechanics)),
    enemies: Object.freeze(array(combat?.enemies || mission?.enemies)),
    mechanicCoverage: combat?.mechanicCoverage || null,
    battleStrategy: combat?.battleStrategy || null,
    interactionProfile: combat?.interactionProfile || null,
    combatPreparation: combat,
    observed: Object.freeze({
      guild: guildEvidence,
      bySquad: squads,
      player: personalEvidence,
    }),
    evidence: Object.freeze({
      official: Object.freeze({
        class: ROTE_TACTICAL_EVIDENCE_CLASS.GAME_DATA,
        verifiedEntry: mission?.entry?.verified === true,
        sourceRefs: Object.freeze(array(mission?.sourceRefs || mission?.sources).map(text).filter(Boolean)),
      }),
      community: Object.freeze({
        class: ROTE_TACTICAL_EVIDENCE_CLASS.COMMUNITY,
        recommendationId: text(recommendation?.id),
        sourceRefs: communitySources(recommendation),
      }),
      guild: Object.freeze({ class: ROTE_TACTICAL_EVIDENCE_CLASS.GUILD, recorded: guildEvidence.recorded }),
      player: Object.freeze({ class: ROTE_TACTICAL_EVIDENCE_CLASS.PLAYER, recorded: personalEvidence.recorded }),
    }),
    evidenceBoundary: 'Verified mission legality and game mechanics remain separate from community strategy and from Command Center observed Guild/player results.',
  });
}
