import { normalizeId, normalizeMembers, relicTier, rosterIndex } from './gac-counter-matrix-model.js';

function teamAverageRelic(members = [], roster = {}) {
  const index = roster instanceof Map ? roster : rosterIndex(roster);
  const ids = normalizeMembers(members);
  if (!ids.length) return null;
  const units = ids.map((id) => index.get(id)).filter(Boolean);
  if (units.length !== ids.length) return null;
  return units.reduce((sum, unit) => sum + relicTier(unit), 0) / units.length;
}

function currentRelicSuitability({ defenseMembers = [], counterMembers = [], opponentRoster = {}, ownRoster = {} } = {}) {
  const defenderAverageRelic = teamAverageRelic(defenseMembers, opponentRoster);
  const attackerAverageRelic = teamAverageRelic(counterMembers, ownRoster);
  const relicDelta = defenderAverageRelic === null || attackerAverageRelic === null ? null : attackerAverageRelic - defenderAverageRelic;
  const band = relicDelta === null ? 'unknown' : relicDelta >= 1.5 ? 'overgeared' : relicDelta >= -0.5 ? 'comparable' : relicDelta >= -1.5 ? 'underdog' : 'deep-underdog';
  return Object.freeze({ defenderAverageRelic, attackerAverageRelic, relicDelta, band });
}

function formatRelicDelta(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(1).replace(/\.0$/, '')}`;
}

function relicSuitabilityForAllocation(allocation = [], defenses = [], ownRoster = {}, opponentRoster = {}) {
  const defenseByKey = new Map((Array.isArray(defenses) ? defenses : []).map((row, index) => [
    `${String(row?.zone || '').toUpperCase()}|${Number.isInteger(Number(row?.slot)) ? Number(row.slot) : index}`,
    row,
  ]));
  return Object.freeze((Array.isArray(allocation) ? allocation : []).map((assignment) => {
    const defense = defenseByKey.get(String(assignment?.rowKey || '')) || {};
    const fit = currentRelicSuitability({
      defenseMembers: defense?.members,
      counterMembers: assignment?.counterMembers,
      opponentRoster,
      ownRoster,
    });
    const historicalAverageRelicDelta = Number.isFinite(Number(assignment?.averageRelicDelta)) ? Number(assignment.averageRelicDelta) : null;
    const historicalRelicSamples = Math.max(0, Math.floor(Number(assignment?.relicDeltaSamples) || 0));
    return Object.freeze({
      rowKey: String(assignment?.rowKey || ''),
      defenseLeaderBaseId: normalizeId(defense?.leaderBaseId || defense?.members?.[0]),
      counterLeaderBaseId: normalizeId(assignment?.counterLeaderBaseId),
      counterMembers: Object.freeze(normalizeMembers(assignment?.counterMembers)),
      battles: Number(assignment?.battles || 0),
      winRate: Number.isFinite(Number(assignment?.winRate)) ? Number(assignment.winRate) : null,
      averageBanners: Number.isFinite(Number(assignment?.averageBanners)) ? Number(assignment.averageBanners) : null,
      historicalAverageRelicDelta,
      historicalRelicSamples,
      historicalRelicEvidenceAvailable: historicalRelicSamples > 0 && historicalAverageRelicDelta !== null,
      ...fit,
    });
  }));
}

export { currentRelicSuitability, formatRelicDelta, relicSuitabilityForAllocation, teamAverageRelic };
