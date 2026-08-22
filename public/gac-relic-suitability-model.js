import { normalizeId, normalizeMembers, relicTier, rosterIndex } from './gac-counter-matrix-model.js';

function nullableFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

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
  const number = nullableFinite(value);
  if (number === null) return '—';
  return `${number >= 0 ? '+' : ''}${number.toFixed(1).replace(/\.0$/, '')}`;
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
    const historicalAverageRelicDelta = nullableFinite(assignment?.averageRelicDelta);
    const historicalRelicSamples = Math.max(0, Math.floor(Number(assignment?.relicDeltaSamples) || 0));
    return Object.freeze({
      rowKey: String(assignment?.rowKey || ''),
      defenseLeaderBaseId: normalizeId(defense?.leaderBaseId || defense?.members?.[0]),
      counterLeaderBaseId: normalizeId(assignment?.counterLeaderBaseId),
      counterMembers: Object.freeze(normalizeMembers(assignment?.counterMembers)),
      battles: Math.max(0, Number(assignment?.battles) || 0),
      winRate: nullableFinite(assignment?.winRate),
      averageBanners: nullableFinite(assignment?.averageBanners),
      historicalAverageRelicDelta,
      historicalRelicSamples,
      historicalRelicEvidenceAvailable: historicalRelicSamples > 0 && historicalAverageRelicDelta !== null,
      ...fit,
    });
  }));
}

export { currentRelicSuitability, formatRelicDelta, nullableFinite, relicSuitabilityForAllocation, teamAverageRelic };
