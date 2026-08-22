const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const normalizeId = (value) => clean(value?.baseId || value).split(':')[0].toUpperCase();

function normalizeMembers(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean))];
}

function teamSignature(leaderBaseId, members = []) {
  const leader = normalizeId(leaderBaseId || members?.[0]);
  const normalized = normalizeMembers(members).sort();
  return `${leader}|${normalized.join(',')}`;
}

function rosterIndex(roster = {}) {
  const rows = [
    ...(Array.isArray(roster?.units) ? roster.units : []),
    ...(Array.isArray(roster?.ships) ? roster.ships : []),
  ];
  return new Map(rows.map((unit) => [normalizeId(unit), unit]).filter(([id]) => Boolean(id)));
}

function relicTier(unit = {}) {
  const value = Number(unit?.relic ?? unit?.relicTier ?? unit?.relicLevel ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function evidenceVariant(row = {}) {
  const battles = Math.max(0, n(row?.battles));
  const wins = Math.max(0, Math.min(battles, n(row?.wins)));
  const rate = battles ? wins / battles : 0;
  const averageRelicDelta = row?.averageRelicDelta === null || row?.averageRelicDelta === undefined || row?.averageRelicDelta === '' ? null : Number(row.averageRelicDelta);
  return Object.freeze({
    enemyLeaderBaseId: normalizeId(row?.enemyLeaderBaseId),
    enemyMembers: Object.freeze(normalizeMembers(row?.enemyMembers)),
    counterLeaderBaseId: normalizeId(row?.counterLeaderBaseId),
    counterMembers: Object.freeze(normalizeMembers(row?.counterMembers)),
    battles,
    wins,
    winRate: Number.isFinite(Number(row?.winRate)) ? Math.max(0, Math.min(1, Number(row.winRate))) : rate,
    averageBanners: row?.averageBanners === null || row?.averageBanners === undefined || row?.averageBanners === '' ? null : Number(row.averageBanners),
    averageRelicDelta: Number.isFinite(averageRelicDelta) ? averageRelicDelta : null,
    relicDeltaSamples: Math.max(0, Math.floor(n(row?.relicDeltaSamples))),
    confidence: Math.max(0, Math.min(1, Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 1)),
    league: clean(row?.league),
    seasonId: clean(row?.seasonId),
    source: clean(row?.source),
    evidenceSources: Object.freeze(Array.isArray(row?.evidenceSources) ? row.evidenceSources.map(clean).filter(Boolean) : []),
  });
}

function counterAvailability(variant, roster = {}, unavailableBaseIds = [], options = {}) {
  const index = roster instanceof Map ? roster : rosterIndex(roster);
  const unavailable = unavailableBaseIds instanceof Set ? unavailableBaseIds : new Set(normalizeMembers(unavailableBaseIds));
  const minimumRelic = Math.max(0, n(options.minimumRelic));
  const missing = [];
  const unavailableMembers = [];
  const underRelic = [];
  const resolved = [];
  for (const id of normalizeMembers(variant?.counterMembers)) {
    const unit = index.get(id);
    if (!unit) missing.push(id);
    else {
      resolved.push(unit);
      if (unavailable.has(id)) unavailableMembers.push(id);
      if (minimumRelic > 0 && relicTier(unit) < minimumRelic) underRelic.push(id);
    }
  }
  const available = !missing.length && !unavailableMembers.length && !underRelic.length && resolved.length === normalizeMembers(variant?.counterMembers).length;
  return Object.freeze({
    available,
    missing: Object.freeze(missing),
    unavailableMembers: Object.freeze(unavailableMembers),
    underRelic: Object.freeze(underRelic),
    resolved: Object.freeze(resolved),
    reason: missing.length ? 'missing-units' : unavailableMembers.length ? 'already-used-or-reserved' : underRelic.length ? 'below-minimum-relic' : available ? 'available' : 'incomplete-counter',
  });
}

function aggregateVariants(variants = []) {
  const rows = Array.isArray(variants) ? variants.filter(Boolean) : [];
  const battles = rows.reduce((sum, row) => sum + Math.max(0, n(row.battles)), 0);
  const wins = rows.reduce((sum, row) => sum + Math.max(0, n(row.wins)), 0);
  const bannerRows = rows.filter((row) => Number.isFinite(Number(row.averageBanners)) && n(row.battles) > 0);
  const bannerWeight = bannerRows.reduce((sum, row) => sum + n(row.battles), 0);
  const averageBanners = bannerWeight
    ? bannerRows.reduce((sum, row) => sum + Number(row.averageBanners) * n(row.battles), 0) / bannerWeight
    : null;
  const relicRows = rows.filter((row) => Number.isFinite(Number(row.averageRelicDelta)) && n(row.relicDeltaSamples) > 0);
  const relicDeltaSamples = relicRows.reduce((sum, row) => sum + n(row.relicDeltaSamples), 0);
  const averageRelicDelta = relicDeltaSamples
    ? relicRows.reduce((sum, row) => sum + Number(row.averageRelicDelta) * n(row.relicDeltaSamples), 0) / relicDeltaSamples
    : null;
  const confidenceWeight = rows.reduce((sum, row) => sum + Math.max(1, n(row.battles)), 0);
  const confidence = confidenceWeight
    ? rows.reduce((sum, row) => sum + n(row.confidence) * Math.max(1, n(row.battles)), 0) / confidenceWeight
    : 0;
  return Object.freeze({
    battles,
    wins,
    winRate: battles ? wins / battles : 0,
    averageBanners,
    averageRelicDelta,
    relicDeltaSamples,
    confidence,
  });
}

function evidenceClass(cell = {}, minimumBattles = 5) {
  const battles = n(cell?.battles);
  if (battles < Math.max(1, n(minimumBattles))) return 'insufficient';
  const rate = Number(cell?.winRate || 0);
  if (rate >= 0.9) return 'elite';
  if (rate >= 0.75) return 'strong';
  if (rate >= 0.55) return 'mixed';
  return 'poor';
}

function variantScore(variant = {}) {
  const sample = Math.log10(Math.max(1, n(variant?.battles)) + 1);
  const banner = Number.isFinite(Number(variant?.averageBanners)) ? Number(variant.averageBanners) : 0;
  return Number(variant?.winRate || 0) * 1000 + sample * 35 + n(variant?.confidence) * 20 + banner * 0.5;
}

function allocateNonOverlapping(rows = [], minimumBattles = 5) {
  const threshold = Math.max(1, n(minimumBattles));
  const candidates = rows.map((row) => {
    const variants = (Array.isArray(row?.variants) ? row.variants : [])
      .filter((variant) => variant?.availability?.available === true && n(variant?.battles) >= threshold)
      .slice()
      .sort((a, b) => variantScore(b) - variantScore(a) || b.battles - a.battles)
      .slice(0, 24);
    return { row, variants };
  });
  candidates.sort((a, b) => a.variants.length - b.variants.length || variantScore(b.variants[0]) - variantScore(a.variants[0]));
  const used = new Set();
  const assignments = [];
  for (const entry of candidates) {
    const variant = entry.variants.find((candidate) => normalizeMembers(candidate.counterMembers).every((id) => !used.has(id))) || null;
    if (!variant) continue;
    const members = normalizeMembers(variant.counterMembers);
    for (const id of members) used.add(id);
    assignments.push(Object.freeze({
      rowKey: entry.row.key,
      defenseId: entry.row.defenseId,
      defenseLeaderBaseId: entry.row.leaderBaseId,
      counterLeaderBaseId: variant.counterLeaderBaseId,
      counterMembers: Object.freeze(members),
      battles: variant.battles,
      wins: variant.wins,
      winRate: variant.winRate,
      averageBanners: variant.averageBanners,
      averageRelicDelta: variant.averageRelicDelta,
      relicDeltaSamples: variant.relicDeltaSamples,
      confidence: variant.confidence,
    }));
  }
  const complete = rows.length > 0 && assignments.length === rows.length;
  const bannersKnown = complete && assignments.every((row) => Number.isFinite(Number(row.averageBanners)));
  return Object.freeze({
    assignments: Object.freeze(assignments),
    usedBaseIds: Object.freeze([...used]),
    coveredRows: assignments.length,
    totalRows: rows.length,
    complete,
    projectedBanners: bannersKnown ? assignments.reduce((sum, row) => sum + Number(row.averageBanners), 0) : null,
  });
}

function buildCounterMatrix({
  defenses = [],
  batch = {},
  ownRoster = {},
  unavailableBaseIds = [],
  minimumBattles = 5,
  minimumRelic = 0,
  rosterOnly = true,
  exactDefenseFirst = true,
  maxColumns = 14,
} = {}) {
  const roster = rosterIndex(ownRoster);
  const unavailable = new Set(normalizeMembers(unavailableBaseIds));
  const byLeader = new Map((Array.isArray(batch?.results) ? batch.results : [])
    .map((entry) => [normalizeId(entry?.enemyLeaderBaseId), Array.isArray(entry?.observations) ? entry.observations.map(evidenceVariant) : []])
    .filter(([leader]) => Boolean(leader)));

  const rowModels = (Array.isArray(defenses) ? defenses : [])
    .filter((defense) => clean(defense?.zone).toUpperCase() !== 'BACK-TOP')
    .map((defense, index) => {
      const leaderBaseId = normalizeId(defense?.leaderBaseId || defense?.members?.[0]);
      const members = normalizeMembers(defense?.members);
      const currentSignature = teamSignature(leaderBaseId, members);
      const sourceRows = byLeader.get(leaderBaseId) || [];
      const exactRows = sourceRows.filter((row) => teamSignature(row.enemyLeaderBaseId, row.enemyMembers) === currentSignature);
      const evidenceRows = exactDefenseFirst && exactRows.length ? exactRows : sourceRows;
      const scope = exactRows.length ? 'exact-defense' : 'leader-aggregate';
      const variants = evidenceRows.map((variant) => {
        const availability = counterAvailability(variant, roster, unavailable, { minimumRelic });
        return Object.freeze({ ...variant, availability });
      }).filter((variant) => !rosterOnly || variant.availability.available);
      return Object.freeze({
        key: `${clean(defense?.zone).toUpperCase()}|${Number(defense?.slot ?? index)}`,
        defenseId: Number(defense?.id || 0) || null,
        zone: clean(defense?.zone).toUpperCase(),
        slot: Number.isInteger(Number(defense?.slot)) ? Number(defense.slot) : index,
        leaderBaseId,
        members: Object.freeze(members),
        scope,
        variants: Object.freeze(variants),
      });
    }).filter((row) => row.leaderBaseId);

  const columnEvidence = new Map();
  for (const row of rowModels) {
    for (const variant of row.variants) {
      const leader = variant.counterLeaderBaseId;
      if (!leader) continue;
      if (!columnEvidence.has(leader)) columnEvidence.set(leader, { battles: 0, wins: 0, rows: 0 });
      const entry = columnEvidence.get(leader);
      entry.battles += variant.battles;
      entry.wins += variant.wins;
      entry.rows += 1;
    }
  }
  const columns = [...columnEvidence.entries()]
    .sort((a, b) => b[1].battles - a[1].battles || b[1].wins - a[1].wins || a[0].localeCompare(b[0]))
    .slice(0, Math.max(1, n(maxColumns) || 14))
    .map(([leaderBaseId, summary]) => Object.freeze({ leaderBaseId, ...summary }));

  const rows = rowModels.map((row) => {
    const cells = new Map();
    for (const column of columns) {
      const variants = row.variants.filter((variant) => variant.counterLeaderBaseId === column.leaderBaseId);
      const aggregate = aggregateVariants(variants);
      cells.set(column.leaderBaseId, Object.freeze({
        ...aggregate,
        evidenceClass: evidenceClass(aggregate, minimumBattles),
        variants: Object.freeze(variants.slice().sort((a, b) => b.battles - a.battles || b.winRate - a.winRate)),
        scope: row.scope,
      }));
    }
    const eligibleCells = [...cells.values()].filter((cell) => cell.battles >= Math.max(1, n(minimumBattles)));
    const bestCell = eligibleCells.sort((a, b) => b.winRate - a.winRate || b.battles - a.battles || n(b.averageBanners) - n(a.averageBanners))[0] || null;
    return Object.freeze({ ...row, cells, bestCell });
  });

  const allocation = allocateNonOverlapping(rows, minimumBattles);
  return Object.freeze({
    rows: Object.freeze(rows),
    columns: Object.freeze(columns),
    minimumBattles: Math.max(1, n(minimumBattles) || 5),
    minimumRelic: Math.max(0, n(minimumRelic)),
    rosterOnly: Boolean(rosterOnly),
    exactDefenseFirst: Boolean(exactDefenseFirst),
    projectedBanners: allocation.projectedBanners,
    coveredRows: allocation.coveredRows,
    totalRows: rows.length,
    allocation,
  });
}

export {
  aggregateVariants,
  allocateNonOverlapping,
  buildCounterMatrix,
  counterAvailability,
  evidenceClass,
  evidenceVariant,
  normalizeId,
  normalizeMembers,
  relicTier,
  rosterIndex,
  teamSignature,
  variantScore,
};
