import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableFinite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAllyCode(value) {
  const allyCode = clean(value).replace(/\D/g, "");
  if (!/^\d{9}$/.test(allyCode)) {
    const error = new Error("A valid 9-digit Ally Code is required.");
    error.status = 400;
    throw error;
  }
  return allyCode;
}

function normalizeFormat(value) {
  const format = clean(value).toLowerCase();
  if (!format) return "";
  if (!["3v3", "5v5"].includes(format)) {
    const error = new Error("GAC format must be 3v3 or 5v5.");
    error.status = 400;
    throw error;
  }
  return format;
}

function normalizeBaseId(value) {
  const baseId = clean(value).toUpperCase();
  if (!/^[A-Z0-9_:-]{1,100}$/.test(baseId)) {
    const error = new Error("A valid enemy leader base ID is required.");
    error.status = 400;
    throw error;
  }
  return baseId;
}

function boundedLimit(value, fallback, max) {
  const parsed = Math.floor(finite(value, fallback));
  return Math.max(1, Math.min(max, parsed || fallback));
}

function inFilter(values = []) {
  const safe = [...new Set(values.map(clean).filter((value) => /^[0-9a-f-]{20,40}$/i.test(value)))];
  return safe.length ? `in.(${safe.join(",")})` : "";
}

function roundRow(row = {}, event = {}, squads = []) {
  return Object.freeze({
    id: clean(row.id),
    round: finite(row.round_number),
    event: Object.freeze({
      id: clean(event.event_instance_id),
      seasonId: clean(event.season_id),
      format: clean(event.format),
      status: clean(event.status),
      startsAt: clean(event.starts_at),
      endsAt: clean(event.ends_at),
    }),
    opponent: Object.freeze({
      playerId: clean(row.opponent_swgoh_player_id),
      allyCode: clean(row.opponent_ally_code),
      name: clean(row.opponent_name),
    }),
    result: clean(row.result || "unknown"),
    playerBanners: nullableFinite(row.player_banners),
    opponentBanners: nullableFinite(row.opponent_banners),
    source: clean(row.source),
    sourceRef: clean(row.source_ref),
    confidence: finite(row.confidence, 1),
    verified: row.verified === true,
    recordedAt: clean(row.recorded_at),
    squads: Object.freeze(asArray(squads).map((squad) => Object.freeze({
      owner: clean(squad.owner),
      side: clean(squad.side),
      zone: clean(squad.zone),
      slot: nullableFinite(squad.squad_slot),
      leaderBaseId: clean(squad.leader_base_id),
      members: Object.freeze(asArray(squad.members)),
      datacron: squad.datacron || null,
      banners: nullableFinite(squad.banners),
      successful: squad.successful === true ? true : squad.successful === false ? false : null,
      attempt: nullableFinite(squad.battle_attempt),
      source: clean(squad.source),
      sourceRef: clean(squad.source_ref),
      confidence: finite(squad.confidence, 1),
      observedAt: clean(squad.observed_at),
    }))),
  });
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
    winRate: battles ? wins / battles : 0,
    averageBanners: nullableFinite(row.average_banners),
    league: clean(row.league),
    seasonId: clean(row.season_id),
    source: clean(row.source),
    sourceRef: clean(row.source_ref),
    sourceUpdatedAt: clean(row.source_updated_at),
    confidence: finite(row.confidence, 1),
    observedAt: clean(row.observed_at),
  });
}

export function createGacHistoryService(options = {}) {
  const store = options.store || supabaseCoreStore;

  function status() {
    const persistence = typeof store?.status === "function" ? store.status() : { configured: true };
    return Object.freeze({
      configured: persistence?.configured !== false,
      mode: "supabase-gac-history-and-counter-evidence",
    });
  }

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function getPlayerHistory(allyCodeInput, options = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const limit = boundedLimit(options.limit, 30, 100);
    const player = await selectOne("players", {
      select: "id,ally_code,swgoh_player_id,name",
      ally_code: `eq.${allyCode}`,
    });
    if (!player) {
      const error = new Error("No persisted GAC player exists for that Ally Code yet.");
      error.status = 404;
      throw error;
    }

    const rounds = asArray(await store.select("gac_rounds", {
      select: "id,event_id,round_number,opponent_swgoh_player_id,opponent_ally_code,opponent_name,result,player_banners,opponent_banners,source,source_ref,confidence,verified,recorded_at,metadata",
      player_id: `eq.${player.id}`,
      order: "recorded_at.desc,round_number.desc",
      limit,
    }));
    if (!rounds.length) {
      return Object.freeze({
        source: "gac-history",
        player: Object.freeze({ allyCode, name: clean(player.name), playerId: clean(player.swgoh_player_id) }),
        rounds: Object.freeze([]),
        summary: Object.freeze({ rounds: 0, wins: 0, losses: 0, verified: 0 }),
      });
    }

    const eventFilter = inFilter(rounds.map((row) => row.event_id));
    const roundFilter = inFilter(rounds.map((row) => row.id));
    const [events, squads] = await Promise.all([
      eventFilter ? store.select("gac_events", {
        select: "id,event_instance_id,season_id,format,status,starts_at,ends_at,source,source_ref",
        id: eventFilter,
        limit: 100,
      }) : [],
      roundFilter ? store.select("gac_round_squads", {
        select: "round_id,owner,side,zone,squad_slot,leader_base_id,members,datacron,banners,successful,battle_attempt,source,source_ref,confidence,observed_at",
        round_id: roundFilter,
        order: "round_id.asc,owner.asc,side.asc,squad_slot.asc",
        limit: 1000,
      }) : [],
    ]);
    const eventIndex = new Map(asArray(events).map((row) => [clean(row.id), row]));
    const squadsByRound = new Map();
    for (const squad of asArray(squads)) {
      const key = clean(squad.round_id);
      if (!squadsByRound.has(key)) squadsByRound.set(key, []);
      squadsByRound.get(key).push(squad);
    }
    const normalizedRounds = rounds.map((row) => roundRow(
      row,
      eventIndex.get(clean(row.event_id)) || {},
      squadsByRound.get(clean(row.id)) || []
    ));
    return Object.freeze({
      source: "gac-history",
      player: Object.freeze({ allyCode, name: clean(player.name), playerId: clean(player.swgoh_player_id) }),
      rounds: Object.freeze(normalizedRounds),
      summary: Object.freeze({
        rounds: normalizedRounds.length,
        wins: normalizedRounds.filter((row) => row.result === "win").length,
        losses: normalizedRounds.filter((row) => row.result === "loss").length,
        verified: normalizedRounds.filter((row) => row.verified).length,
      }),
    });
  }

  async function getCounterEvidence(options = {}) {
    const format = normalizeFormat(options.format);
    const enemyLeaderBaseId = normalizeBaseId(options.enemyLeaderBaseId);
    const limit = boundedLimit(options.limit, 100, 500);
    const rows = asArray(await store.select("gac_counter_observations", {
      select: "format,enemy_leader_base_id,enemy_members,counter_leader_base_id,counter_members,battles,wins,holds,average_banners,league,season_id,source,source_ref,source_updated_at,confidence,observed_at",
      format: `eq.${format}`,
      enemy_leader_base_id: `eq.${enemyLeaderBaseId}`,
      order: "battles.desc,wins.desc,average_banners.desc.nullslast",
      limit,
    }));
    return Object.freeze({
      source: "gac-counter-evidence",
      format,
      enemyLeaderBaseId,
      observations: Object.freeze(rows.map(counterRow)),
      count: rows.length,
    });
  }

  return Object.freeze({ status, getPlayerHistory, getCounterEvidence });
}

export const gacHistoryService = createGacHistoryService();
