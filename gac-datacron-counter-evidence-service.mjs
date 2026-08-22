import { supabaseCoreStore } from "./supabase-core-store.mjs";
import {
  datacronEvidenceSignature,
  normalizeDatacronEvidence,
} from "./public/gac-datacron-evidence-signature.js";

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
function normalizeBaseId(value) { return clean(value?.baseId || value).split(":")[0].toUpperCase(); }
function normalizeMembers(values = []) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }
function normalizeFormat(value) {
  const format = clean(value).toLowerCase();
  if (!["3v3", "5v5"].includes(format)) {
    const error = new Error("GAC format must be 3v3 or 5v5.");
    error.status = 400;
    throw error;
  }
  return format;
}
function normalizeOutcome(value) {
  const outcome = clean(value).toLowerCase();
  return ["win", "loss", "draw", "unknown"].includes(outcome) ? outcome : "unknown";
}
function normalizeState(value, datacron = null) {
  return normalizeDatacronEvidence(datacron, value).state;
}
function normalizedLeaderList(values, max = 20) {
  const leaders = [...new Set(asArray(values).flatMap((value) => clean(value).split(",")).map(normalizeBaseId).filter(Boolean))].slice(0, max);
  if (!leaders.length) {
    const error = new Error("At least one valid enemy leader base ID is required.");
    error.status = 400;
    throw error;
  }
  return leaders;
}
function boundedLimit(value, fallback = 60, max = 150) {
  const parsed = Math.floor(finite(value, fallback));
  return Math.max(1, Math.min(max, parsed || fallback));
}
function inFilter(values) { return `in.(${values.join(",")})`; }
function teamSignature(leader, members = []) {
  return `${normalizeBaseId(leader)}|${normalizeMembers(members).sort().join(",")}`;
}
function groupKey(row = {}) {
  return [
    clean(row.format).toLowerCase(),
    teamSignature(row.enemy_leader_base_id, row.enemy_members),
    clean(row.defender_datacron_signature),
    teamSignature(row.counter_leader_base_id, row.counter_members),
    clean(row.attacker_datacron_signature),
  ].join(">>");
}
function newest(left, right) {
  return (Date.parse(clean(right)) || 0) > (Date.parse(clean(left)) || 0) ? clean(right) : clean(left);
}

function evidenceRow(row = {}) {
  return Object.freeze({
    battleKey: clean(row.battle_key),
    format: clean(row.format).toLowerCase(),
    enemyLeaderBaseId: normalizeBaseId(row.enemy_leader_base_id),
    enemyMembers: Object.freeze(normalizeMembers(row.enemy_members)),
    defenderDatacronState: clean(row.defender_datacron_state).toLowerCase(),
    defenderDatacronSignature: clean(row.defender_datacron_signature),
    defenderDatacron: row.defender_datacron && typeof row.defender_datacron === "object" ? row.defender_datacron : null,
    counterLeaderBaseId: normalizeBaseId(row.counter_leader_base_id),
    counterMembers: Object.freeze(normalizeMembers(row.counter_members)),
    attackerDatacronState: clean(row.attacker_datacron_state).toLowerCase(),
    attackerDatacronSignature: clean(row.attacker_datacron_signature),
    attackerDatacron: row.attacker_datacron && typeof row.attacker_datacron === "object" ? row.attacker_datacron : null,
    battleOutcome: normalizeOutcome(row.battle_outcome),
    banners: nullableFinite(row.banners),
    seasonId: clean(row.season_id),
    source: clean(row.source),
    sourceRef: clean(row.source_ref),
    observedAt: clean(row.observed_at),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  });
}

function aggregateEvidence(rows = []) {
  const groups = new Map();
  for (const raw of asArray(rows)) {
    const row = evidenceRow(raw);
    if (!row.enemyLeaderBaseId || !row.counterLeaderBaseId || !row.defenderDatacronSignature || !row.attackerDatacronSignature) continue;
    const key = groupKey({
      format: row.format,
      enemy_leader_base_id: row.enemyLeaderBaseId,
      enemy_members: row.enemyMembers,
      defender_datacron_signature: row.defenderDatacronSignature,
      counter_leader_base_id: row.counterLeaderBaseId,
      counter_members: row.counterMembers,
      attacker_datacron_signature: row.attackerDatacronSignature,
    });
    if (!groups.has(key)) {
      groups.set(key, {
        format: row.format,
        enemyLeaderBaseId: row.enemyLeaderBaseId,
        enemyMembers: row.enemyMembers,
        defenderDatacronState: row.defenderDatacronState,
        defenderDatacronSignature: row.defenderDatacronSignature,
        defenderDatacron: row.defenderDatacron,
        counterLeaderBaseId: row.counterLeaderBaseId,
        counterMembers: row.counterMembers,
        attackerDatacronState: row.attackerDatacronState,
        attackerDatacronSignature: row.attackerDatacronSignature,
        attackerDatacron: row.attackerDatacron,
        battles: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        unknown: 0,
        bannerTotal: 0,
        bannerSamples: 0,
        seasons: new Set(),
        sources: new Set(),
        lastObservedAt: "",
      });
    }
    const group = groups.get(key);
    group.battles += 1;
    if (row.battleOutcome === "win") group.wins += 1;
    else if (row.battleOutcome === "loss") group.losses += 1;
    else if (row.battleOutcome === "draw") group.draws += 1;
    else group.unknown += 1;
    if (row.banners !== null) { group.bannerTotal += row.banners; group.bannerSamples += 1; }
    if (row.seasonId) group.seasons.add(row.seasonId);
    if (row.source) group.sources.add(row.source);
    group.lastObservedAt = newest(group.lastObservedAt, row.observedAt);
  }
  return [...groups.values()].map((group) => {
    const resolved = group.wins + group.losses + group.draws;
    return Object.freeze({
      format: group.format,
      enemyLeaderBaseId: group.enemyLeaderBaseId,
      enemyMembers: Object.freeze([...group.enemyMembers]),
      defenderDatacronState: group.defenderDatacronState,
      defenderDatacronSignature: group.defenderDatacronSignature,
      defenderDatacron: group.defenderDatacron,
      counterLeaderBaseId: group.counterLeaderBaseId,
      counterMembers: Object.freeze([...group.counterMembers]),
      attackerDatacronState: group.attackerDatacronState,
      attackerDatacronSignature: group.attackerDatacronSignature,
      attackerDatacron: group.attackerDatacron,
      battles: group.battles,
      wins: group.wins,
      losses: group.losses,
      draws: group.draws,
      unknown: group.unknown,
      winRate: resolved ? group.wins / resolved : null,
      averageBanners: group.bannerSamples ? group.bannerTotal / group.bannerSamples : null,
      bannerSamples: group.bannerSamples,
      seasons: group.seasons.size,
      evidenceSources: Object.freeze([...group.sources].sort()),
      lastObservedAt: group.lastObservedAt,
    });
  }).sort((a, b) => b.battles - a.battles || finite(b.winRate) - finite(a.winRate) || a.counterLeaderBaseId.localeCompare(b.counterLeaderBaseId));
}

export function createGacDatacronCounterEvidenceService(options = {}) {
  const store = options.store || supabaseCoreStore;

  async function recordBattle(input = {}) {
    const battleKey = clean(input.battleKey);
    const format = normalizeFormat(input.format);
    const enemyLeaderBaseId = normalizeBaseId(input.enemyLeaderBaseId);
    const enemyMembers = normalizeMembers(input.enemyMembers);
    const counterLeaderBaseId = normalizeBaseId(input.counterLeaderBaseId);
    const counterMembers = normalizeMembers(input.counterMembers);
    if (!battleKey || !enemyLeaderBaseId || !enemyMembers.length || !counterLeaderBaseId || !counterMembers.length) {
      const error = new Error("Complete battle identity and both squad snapshots are required for Datacron evidence.");
      error.status = 400;
      throw error;
    }
    const defender = normalizeDatacronEvidence(input.defenderDatacron, input.defenderDatacronState);
    const attacker = normalizeDatacronEvidence(input.attackerDatacron, input.attackerDatacronState);
    const observedAt = clean(input.observedAt) || new Date().toISOString();
    const row = {
      battle_key: battleKey,
      format,
      enemy_leader_base_id: enemyLeaderBaseId,
      enemy_members: enemyMembers,
      defender_datacron_state: defender.state,
      defender_datacron_signature: defender.signature,
      defender_datacron: defender.state === "assigned" ? defender : null,
      counter_leader_base_id: counterLeaderBaseId,
      counter_members: counterMembers,
      attacker_datacron_state: attacker.state,
      attacker_datacron_signature: attacker.signature,
      attacker_datacron: attacker.state === "assigned" ? attacker : null,
      battle_outcome: normalizeOutcome(input.battleOutcome),
      banners: input.banners === null || input.banners === undefined || input.banners === "" ? null : Math.max(0, Math.floor(finite(input.banners))),
      season_id: clean(input.seasonId) || null,
      source: clean(input.source || "verified-owner-war-room"),
      source_ref: clean(input.sourceRef) || null,
      observed_at: observedAt,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    };
    const saved = asArray(await store.upsert("gac_datacron_battle_evidence", [row], { onConflict: "battle_key" }));
    return Object.freeze({ source: "gac-datacron-battle-evidence", saved: true, evidence: Object.freeze(evidenceRow(saved[0] || row)) });
  }

  async function getBatch(input = {}) {
    const format = normalizeFormat(input.format);
    const leaders = normalizedLeaderList(input.enemyLeaderBaseIds);
    const limit = boundedLimit(input.limit);
    const rowLimit = Math.min(10_000, Math.max(500, leaders.length * limit * 20));
    let rows;
    try {
      rows = asArray(await store.select("gac_datacron_battle_evidence", {
        select: "battle_key,format,enemy_leader_base_id,enemy_members,defender_datacron_state,defender_datacron_signature,defender_datacron,counter_leader_base_id,counter_members,attacker_datacron_state,attacker_datacron_signature,attacker_datacron,battle_outcome,banners,season_id,source,source_ref,observed_at,metadata",
        format: `eq.${format}`,
        enemy_leader_base_id: inFilter(leaders),
        order: "observed_at.desc",
        limit: rowLimit,
      }));
    } catch (error) {
      if (/gac_datacron_battle_evidence|relation|schema cache|does not exist/i.test(clean(error?.message))) {
        return Object.freeze({ source: "gac-datacron-battle-evidence", format, leaders: Object.freeze(leaders), results: Object.freeze(leaders.map((leader) => Object.freeze({ enemyLeaderBaseId: leader, observations: Object.freeze([]), count: 0 }))), count: 0, warehouseReady: false });
      }
      throw error;
    }
    const aggregated = aggregateEvidence(rows);
    const byLeader = new Map(leaders.map((leader) => [leader, []]));
    for (const row of aggregated) if (byLeader.has(row.enemyLeaderBaseId)) byLeader.get(row.enemyLeaderBaseId).push(row);
    const results = leaders.map((leader) => Object.freeze({
      enemyLeaderBaseId: leader,
      observations: Object.freeze((byLeader.get(leader) || []).slice(0, limit)),
      count: (byLeader.get(leader) || []).length,
    }));
    return Object.freeze({
      source: "gac-datacron-battle-evidence",
      format,
      leaders: Object.freeze(leaders),
      results: Object.freeze(results),
      count: results.reduce((sum, row) => sum + row.observations.length, 0),
      warehouseReady: true,
    });
  }

  return Object.freeze({ recordBattle, getBatch });
}

export const gacDatacronCounterEvidenceService = createGacDatacronCounterEvidenceService();

export {
  aggregateEvidence,
  boundedLimit,
  evidenceRow,
  groupKey,
  normalizeFormat,
  normalizedLeaderList,
  teamSignature,
};
