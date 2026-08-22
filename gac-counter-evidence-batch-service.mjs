import { mergeCounterEvidence, verifiedBattleObservation } from "./gac-counter-evidence-merge.mjs";
import { gacDatacronCounterEvidenceService } from "./gac-datacron-counter-evidence-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function nullableFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
function normalizeLeaderList(values, max = 20) {
  const leaders = [...new Set(asArray(values).flatMap((value) => clean(value).split(",")).map(normalizeBaseId).filter(Boolean))].slice(0, max);
  if (!leaders.length) {
    const error = new Error("At least one valid enemy leader base ID is required.");
    error.status = 400;
    throw error;
  }
  return leaders;
}
function boundedLimit(value, fallback = 40, max = 100) {
  const parsed = Math.floor(finite(value, fallback));
  return Math.max(1, Math.min(max, parsed || fallback));
}
function textInFilter(values) {
  return `in.(${values.join(",")})`;
}
function counterRow(row = {}) {
  const battles = Math.max(0, finite(row.battles));
  const wins = Math.max(0, Math.min(battles, finite(row.wins)));
  return Object.freeze({
    format: clean(row.format),
    enemyLeaderBaseId: clean(row.enemy_leader_base_id),
    enemyMembers: Object.freeze(asArray(row.enemy_members)),
    counterLeaderBaseId: clean(row.counter_leader_base_id),
    counterMembers: Object.freeze(asArray(row.counter_members)),
    battles,
    wins,
    holds: Math.max(0, finite(row.holds)),
    draws: Math.max(0, finite(row.draws)),
    winRate: battles ? wins / battles : 0,
    averageBanners: nullableFinite(row.average_banners),
    league: clean(row.league),
    seasonId: clean(row.season_id),
    seasonIds: Object.freeze(asArray(row.season_ids)),
    source: clean(row.source),
    evidenceSources: Object.freeze(asArray(row.evidence_sources)),
    sourceRef: clean(row.source_ref),
    sourceUpdatedAt: clean(row.source_updated_at),
    confidence: Math.max(0, Math.min(1, finite(row.confidence, 1))),
    observedAt: clean(row.observed_at),
  });
}

export function createGacCounterEvidenceBatchService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const datacronEvidence = options.datacronEvidence || gacDatacronCounterEvidenceService;

  async function getCounterEvidenceBatch(input = {}) {
    const format = normalizeFormat(input.format);
    const leaders = normalizeLeaderList(input.enemyLeaderBaseIds);
    const limit = boundedLimit(input.limit);
    const leaderFilter = textInFilter(leaders);
    const rowLimit = Math.min(5000, Math.max(250, leaders.length * limit * 3));

    const [aggregateRows, verifiedBattleRows, datacronBatch] = await Promise.all([
      store.select("gac_counter_observations", {
        select: "format,enemy_leader_base_id,enemy_members,counter_leader_base_id,counter_members,battles,wins,holds,draws,average_banners,league,season_id,source,source_ref,source_updated_at,confidence,observed_at",
        format: `eq.${format}`,
        enemy_leader_base_id: leaderFilter,
        order: "battles.desc,wins.desc,average_banners.desc.nullslast",
        limit: rowLimit,
      }),
      store.select("gac_battles", {
        select: "format,season_id,attacker_leader_base_id,attacker_members,defender_leader_base_id,defender_members,battle_outcome,source,source_ref,source_updated_at,imported_at,metadata",
        format: `eq.${format}`,
        defender_leader_base_id: leaderFilter,
        source: "eq.verified-owner-war-room",
        order: "source_updated_at.desc",
        limit: rowLimit,
      }),
      datacronEvidence?.getBatch
        ? datacronEvidence.getBatch({ format, enemyLeaderBaseIds: leaders, limit }).catch((error) => Object.freeze({
            source: "gac-datacron-battle-evidence",
            format,
            leaders: Object.freeze(leaders),
            results: Object.freeze(leaders.map((leader) => Object.freeze({ enemyLeaderBaseId: leader, observations: Object.freeze([]), count: 0 }))),
            count: 0,
            warehouseReady: false,
            error: clean(error?.message || error).slice(0, 200),
          }))
        : Promise.resolve(null),
    ]);

    const verifiedObservations = asArray(verifiedBattleRows).map(verifiedBattleObservation).filter(Boolean);
    const merged = mergeCounterEvidence([...asArray(aggregateRows), ...verifiedObservations]);
    const grouped = new Map(leaders.map((leader) => [leader, []]));
    for (const row of merged) {
      const leader = normalizeBaseId(row.enemy_leader_base_id);
      if (grouped.has(leader)) grouped.get(leader).push(counterRow(row));
    }

    const results = leaders.map((leader) => {
      const observations = grouped.get(leader).slice(0, limit);
      return Object.freeze({
        enemyLeaderBaseId: leader,
        observations: Object.freeze(observations),
        count: observations.length,
        evidenceSources: Object.freeze([...new Set(observations.flatMap((row) => row.evidenceSources.length ? row.evidenceSources : [row.source]).filter(Boolean))].sort()),
        verifiedBattleSamples: verifiedObservations.filter((row) => normalizeBaseId(row.enemy_leader_base_id) === leader).length,
      });
    });

    return Object.freeze({
      source: "gac-counter-evidence-batch",
      format,
      leaders: Object.freeze(leaders),
      results: Object.freeze(results),
      count: results.reduce((sum, result) => sum + result.count, 0),
      verifiedBattleSamples: verifiedObservations.length,
      evidenceSources: Object.freeze([...new Set(results.flatMap((result) => result.evidenceSources))].sort()),
      datacronEvidence: datacronBatch || Object.freeze({
        source: "gac-datacron-battle-evidence",
        format,
        leaders: Object.freeze(leaders),
        results: Object.freeze([]),
        count: 0,
        warehouseReady: false,
      }),
    });
  }

  return Object.freeze({ getCounterEvidenceBatch });
}

export const gacCounterEvidenceBatchService = createGacCounterEvidenceBatchService();

export { boundedLimit, normalizeBaseId, normalizeFormat, normalizeLeaderList, textInFilter };
