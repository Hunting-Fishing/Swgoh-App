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
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function members(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))].sort(); }
function latest(left, right) {
  const a = Date.parse(clean(left)) || 0;
  const b = Date.parse(clean(right)) || 0;
  return b > a ? clean(right) : clean(left);
}
function signature(row = {}) {
  return [
    clean(row.format).toLowerCase(),
    normalizeBaseId(row.enemy_leader_base_id),
    members(row.enemy_members).join(","),
    normalizeBaseId(row.counter_leader_base_id),
    members(row.counter_members).join(","),
  ].join("|");
}

function verifiedBattleObservation(row = {}) {
  if (clean(row.source) !== "verified-owner-war-room") return null;
  const format = clean(row.format).toLowerCase();
  const enemyLeader = normalizeBaseId(row.defender_leader_base_id);
  const enemyMembers = members(row.defender_members);
  const counterLeader = normalizeBaseId(row.attacker_leader_base_id);
  const counterMembers = members(row.attacker_members);
  const outcome = clean(row.battle_outcome).toLowerCase();
  if (!["3v3", "5v5"].includes(format) || !enemyLeader || !counterLeader || !enemyMembers.length || !counterMembers.length) return null;
  if (!["win", "loss", "draw"].includes(outcome)) return null;
  const banners = nullableFinite(row?.metadata?.banners);
  return Object.freeze({
    format,
    enemy_leader_base_id: enemyLeader,
    enemy_members: enemyMembers,
    counter_leader_base_id: counterLeader,
    counter_members: counterMembers,
    battles: 1,
    wins: outcome === "win" ? 1 : 0,
    holds: outcome === "loss" ? 1 : 0,
    draws: outcome === "draw" ? 1 : 0,
    average_banners: banners,
    league: null,
    season_id: clean(row.season_id) || null,
    source: "verified-owner-war-room",
    source_ref: clean(row.source_ref),
    source_updated_at: clean(row.source_updated_at || row.imported_at),
    confidence: 1,
    observed_at: clean(row.imported_at || row.source_updated_at),
    evidence_sources: ["verified-owner-war-room"],
  });
}

function mergeCounterEvidence(rows = []) {
  const groups = new Map();
  for (const input of asArray(rows)) {
    const key = signature(input);
    if (!key || key.startsWith("|||")) continue;
    const battles = Math.max(0, finite(input.battles));
    if (!battles) continue;
    const wins = Math.max(0, Math.min(battles, finite(input.wins)));
    const holds = Math.max(0, Math.min(battles, finite(input.holds)));
    const draws = Math.max(0, Math.min(battles, finite(input.draws)));
    const avgBanners = nullableFinite(input.average_banners);
    const source = clean(input.source || "historical-evidence");
    const confidence = Math.max(0, Math.min(1, finite(input.confidence, 1)));
    if (!groups.has(key)) {
      groups.set(key, {
        format: clean(input.format).toLowerCase(),
        enemy_leader_base_id: normalizeBaseId(input.enemy_leader_base_id),
        enemy_members: members(input.enemy_members),
        counter_leader_base_id: normalizeBaseId(input.counter_leader_base_id),
        counter_members: members(input.counter_members),
        battles: 0,
        wins: 0,
        holds: 0,
        draws: 0,
        bannerWeightedTotal: 0,
        bannerBattleCount: 0,
        confidenceWeightedTotal: 0,
        sources: new Set(),
        sourceRefs: new Set(),
        seasons: new Set(),
        league: clean(input.league),
        source_updated_at: "",
        observed_at: "",
      });
    }
    const group = groups.get(key);
    group.battles += battles;
    group.wins += wins;
    group.holds += holds;
    group.draws += draws;
    if (avgBanners !== null) {
      group.bannerWeightedTotal += avgBanners * battles;
      group.bannerBattleCount += battles;
    }
    group.confidenceWeightedTotal += confidence * battles;
    if (source) group.sources.add(source);
    if (clean(input.source_ref)) group.sourceRefs.add(clean(input.source_ref));
    if (clean(input.season_id)) group.seasons.add(clean(input.season_id));
    group.league = group.league || clean(input.league);
    group.source_updated_at = latest(group.source_updated_at, input.source_updated_at);
    group.observed_at = latest(group.observed_at, input.observed_at || input.source_updated_at);
  }

  return [...groups.values()].map((group) => {
    const sources = [...group.sources].sort();
    const seasons = [...group.seasons].sort();
    return Object.freeze({
      format: group.format,
      enemy_leader_base_id: group.enemy_leader_base_id,
      enemy_members: Object.freeze(group.enemy_members),
      counter_leader_base_id: group.counter_leader_base_id,
      counter_members: Object.freeze(group.counter_members),
      battles: group.battles,
      wins: Math.min(group.battles, group.wins),
      holds: Math.min(group.battles, group.holds),
      draws: Math.min(group.battles, group.draws),
      average_banners: group.bannerBattleCount ? group.bannerWeightedTotal / group.bannerBattleCount : null,
      league: group.league || null,
      season_id: seasons.length === 1 ? seasons[0] : null,
      source: sources.length === 1 ? sources[0] : "combined-evidence",
      source_ref: [...group.sourceRefs].slice(0, 4).join(" | "),
      source_updated_at: group.source_updated_at || null,
      confidence: group.battles ? group.confidenceWeightedTotal / group.battles : 1,
      observed_at: group.observed_at || null,
      evidence_sources: Object.freeze(sources),
      season_ids: Object.freeze(seasons),
    });
  }).sort((a, b) => b.battles - a.battles || b.wins - a.wins || finite(b.average_banners) - finite(a.average_banners));
}

export { members, mergeCounterEvidence, signature, verifiedBattleObservation };
