import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeFormat(value) {
  const format = clean(value).toLowerCase();
  if (!["3v3", "5v5"].includes(format)) {
    const error = new Error("GAC format must be 3v3 or 5v5.");
    error.status = 400;
    throw error;
  }
  return format;
}
function normalizeBaseId(value) {
  const id = clean(value).split(":")[0].toUpperCase();
  return /^[A-Z0-9_:-]{1,100}$/.test(id) ? id : "";
}
function normalizeMembers(values) {
  return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))].sort();
}
function normalizeCapitalList(values, max = 12) {
  const capitals = [...new Set(asArray(values)
    .flatMap((value) => clean(value).split(","))
    .map(normalizeBaseId)
    .filter(Boolean))]
    .slice(0, max);
  if (!capitals.length) {
    const error = new Error("At least one valid enemy capital-ship Base ID is required.");
    error.status = 400;
    throw error;
  }
  return capitals;
}
function boundedLimit(value, fallback = 30, max = 100) {
  const parsed = Math.floor(finite(value, fallback));
  return Math.max(1, Math.min(max, parsed || fallback));
}
function textInFilter(values) { return `in.(${values.join(",")})`; }
function isFleetBattle(row = {}) {
  const type = clean(row?.metadata?.battleType).toLowerCase();
  if (type) return type === "fleet";
  const attacker = normalizeBaseId(row.attacker_leader_base_id);
  const defender = normalizeBaseId(row.defender_leader_base_id);
  return attacker.startsWith("CAPITAL") && defender.startsWith("CAPITAL");
}
function sourceTimestamp(row = {}) {
  return clean(row.source_updated_at || row.imported_at || row.observed_at);
}
function evidenceReliability({ battles = 0, wins = 0 } = {}) {
  const count = Math.max(0, finite(battles));
  const positive = Math.max(0, Math.min(count, finite(wins)));
  const rate = count ? positive / count : 0;
  if (!count || !positive) return Object.freeze({ tier: "no-positive", rank: 0, automatic: false, label: "No observed wins" });
  if (count >= 10 && rate >= 0.7) return Object.freeze({ tier: "strong", rank: 4, automatic: true, label: "Strong historical sample" });
  if (count >= 5 && rate >= 0.6) return Object.freeze({ tier: "established", rank: 3, automatic: true, label: "Established historical sample" });
  if (count >= 2 && rate >= 0.5) return Object.freeze({ tier: "limited", rank: 2, automatic: true, label: "Limited positive sample" });
  if (count === 1 && positive === 1) return Object.freeze({ tier: "single-positive", rank: 1, automatic: true, label: "Single observed win" });
  return Object.freeze({ tier: "hold-heavy", rank: 0, automatic: false, label: "Hold-heavy / insufficient positive evidence" });
}
function aggregateFleetRows(rows = []) {
  const groups = new Map();
  for (const row of asArray(rows)) {
    if (!isFleetBattle(row)) continue;
    const defenderCapitalShipBaseId = normalizeBaseId(row.defender_leader_base_id);
    const attackerCapitalShipBaseId = normalizeBaseId(row.attacker_leader_base_id);
    const defenderMembers = normalizeMembers(row.defender_members);
    const attackerMembers = normalizeMembers(row.attacker_members);
    if (!defenderCapitalShipBaseId || !attackerCapitalShipBaseId || !defenderMembers.length || !attackerMembers.length) continue;
    const key = [
      defenderCapitalShipBaseId,
      defenderMembers.join(","),
      attackerCapitalShipBaseId,
      attackerMembers.join(","),
    ].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        defenderCapitalShipBaseId,
        defenderMembers,
        attackerCapitalShipBaseId,
        attackerMembers,
        battles: 0,
        wins: 0,
        holds: 0,
        draws: 0,
        seasons: new Set(),
        evidenceSources: new Set(),
        sourceRefs: new Set(),
        firstObservedAt: "",
        lastObservedAt: "",
      });
    }
    const group = groups.get(key);
    group.battles += 1;
    const outcome = clean(row.battle_outcome).toLowerCase();
    if (outcome === "win") group.wins += 1;
    else if (outcome === "loss") group.holds += 1;
    else if (outcome === "draw") group.draws += 1;
    const season = clean(row.season_id);
    const source = clean(row.source);
    const sourceRef = clean(row.source_ref);
    const timestamp = sourceTimestamp(row);
    if (season) group.seasons.add(season);
    if (source) group.evidenceSources.add(source);
    if (sourceRef) group.sourceRefs.add(sourceRef);
    if (timestamp && (!group.firstObservedAt || timestamp < group.firstObservedAt)) group.firstObservedAt = timestamp;
    if (timestamp && (!group.lastObservedAt || timestamp > group.lastObservedAt)) group.lastObservedAt = timestamp;
  }

  return [...groups.values()].map((group) => {
    const observedWinRate = group.battles ? group.wins / group.battles : null;
    const reliability = evidenceReliability(group);
    return Object.freeze({
      defenderCapitalShipBaseId: group.defenderCapitalShipBaseId,
      defenderMembers: Object.freeze(group.defenderMembers),
      attackerCapitalShipBaseId: group.attackerCapitalShipBaseId,
      attackerMembers: Object.freeze(group.attackerMembers),
      battles: group.battles,
      wins: group.wins,
      holds: group.holds,
      draws: group.draws,
      observedWinRate,
      reliability,
      seasons: Object.freeze([...group.seasons].sort()),
      evidenceSources: Object.freeze([...group.evidenceSources].sort()),
      sourceRefs: Object.freeze([...group.sourceRefs].sort()),
      firstObservedAt: group.firstObservedAt,
      lastObservedAt: group.lastObservedAt,
      compositionScope: "capital-plus-member-set",
      roleScope: "starter-reinforcement-roles-not-retained-by-history-store",
    });
  }).sort((left, right) => {
    if (right.reliability.rank !== left.reliability.rank) return right.reliability.rank - left.reliability.rank;
    if (right.battles !== left.battles) return right.battles - left.battles;
    const rightRate = right.observedWinRate ?? -1;
    const leftRate = left.observedWinRate ?? -1;
    if (rightRate !== leftRate) return rightRate - leftRate;
    return left.attackerCapitalShipBaseId.localeCompare(right.attackerCapitalShipBaseId);
  });
}

export function createGacFleetCounterEvidenceService(options = {}) {
  const store = options.store || supabaseCoreStore;

  async function getFleetCounterEvidenceBatch(input = {}) {
    const format = normalizeFormat(input.format);
    const capitals = normalizeCapitalList(input.enemyCapitalShipBaseIds);
    const limit = boundedLimit(input.limit);
    const rowLimit = Math.min(6000, Math.max(300, capitals.length * limit * 12));
    const rows = await store.select("gac_battles", {
      select: "format,season_id,attacker_leader_base_id,attacker_members,defender_leader_base_id,defender_members,battle_outcome,source,source_ref,source_updated_at,imported_at,metadata",
      format: `eq.${format}`,
      defender_leader_base_id: textInFilter(capitals),
      order: "source_updated_at.desc.nullslast,imported_at.desc.nullslast",
      limit: rowLimit,
    });
    const aggregated = aggregateFleetRows(rows);
    const results = capitals.map((capital) => {
      const observations = aggregated.filter((row) => row.defenderCapitalShipBaseId === capital).slice(0, limit);
      return Object.freeze({
        enemyCapitalShipBaseId: capital,
        observations: Object.freeze(observations),
        count: observations.length,
        battleSamples: observations.reduce((sum, row) => sum + row.battles, 0),
        evidenceSources: Object.freeze([...new Set(observations.flatMap((row) => row.evidenceSources))].sort()),
      });
    });
    return Object.freeze({
      source: "gac-fleet-counter-evidence",
      format,
      capitals: Object.freeze(capitals),
      results: Object.freeze(results),
      count: results.reduce((sum, result) => sum + result.count, 0),
      battleSamples: results.reduce((sum, result) => sum + result.battleSamples, 0),
      evidenceSources: Object.freeze([...new Set(results.flatMap((result) => result.evidenceSources))].sort()),
      scope: Object.freeze({
        battleType: "fleet",
        composition: "capital-plus-member-set",
        starterReinforcementRoles: "unknown-in-persisted-history",
        observedRateIsPrediction: false,
      }),
    });
  }

  return Object.freeze({ getFleetCounterEvidenceBatch });
}

export const gacFleetCounterEvidenceService = createGacFleetCounterEvidenceService();

export {
  aggregateFleetRows,
  boundedLimit,
  evidenceReliability,
  isFleetBattle,
  normalizeBaseId,
  normalizeCapitalList,
  normalizeFormat,
  normalizeMembers,
  textInFilter,
};
