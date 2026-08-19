import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, "");
  if (!/^\d{9}$/.test(code)) {
    const error = new Error("A valid 9-digit Ally Code is required.");
    error.status = 400;
    throw error;
  }
  return code;
}
function normalizeFormat(value) {
  const format = clean(value).toLowerCase();
  if (!format) return "";
  if (!new Set(["3v3", "5v5"]).has(format)) {
    const error = new Error("GAC format must be 3v3 or 5v5.");
    error.status = 400;
    throw error;
  }
  return format;
}
function normalizeBaseId(value) {
  return clean(value).split(":")[0].toUpperCase();
}
function normalizeMembers(value) {
  return [...new Set(asArray(value).map(normalizeBaseId).filter(Boolean))].sort();
}
function teamSignature(format, leaderBaseId, members) {
  return `${clean(format).toLowerCase()}|${normalizeBaseId(leaderBaseId)}|${normalizeMembers(members).join(",")}`;
}
function inFilter(values = []) {
  const safe = [...new Set(values.map(clean).filter((value) => /^[0-9a-f-]{20,40}$/i.test(value)))];
  return safe.length ? `in.(${safe.join(",")})` : "";
}
function newest(left, right) {
  return (Date.parse(clean(right)) || 0) > (Date.parse(clean(left)) || 0) ? clean(right) : clean(left);
}
function formatFromSize(value) {
  const size = Number(value);
  return size === 3 ? "3v3" : size === 5 ? "5v5" : "";
}
function rowFormat(row = {}, event = {}) {
  return normalizeFormat(event?.format || formatFromSize(row?.metadata?.size) || formatFromSize(asArray(row?.members).length));
}
function historicalEvent(event = {}, nowMs = Date.now()) {
  const status = clean(event?.status).toLowerCase();
  const endedAt = Date.parse(clean(event?.ends_at));
  if (endedAt && endedAt < nowMs) return true;
  if (/^history(?:[-_].*)?$/.test(status)) return true;
  return /^(?:complete|completed|ended|finished|closed|final)(?:[-_].*)?$/.test(status);
}
function battleBoardKey(row = {}) {
  const observer = clean(row.swgoh_player_id || row.ally_code || "observer");
  const event = clean(row.event_instance_id || row.season_id || "event");
  const match = clean(row.match_id) || `round:${finite(row.round_number, -1)}:match:${finite(row.match_index, -1)}`;
  return `${observer}|${event}|${match}`;
}
function verifiedBoardKey(row = {}, round = {}, event = {}) {
  const eventId = clean(row?.metadata?.eventInstanceId || event?.event_instance_id || round?.event_id || "event");
  const roundNumber = finite(row?.metadata?.round || round?.round_number, 0);
  const target = clean(row?.metadata?.opponentAllyCode || "target");
  return `${eventId}|${roundNumber}|${target}|${clean(row.round_id)}`;
}
function battlePlacementRows(rows = [], format = "") {
  const output = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    if (clean(row?.source) !== "c3po-gahistory") continue;
    const kind = clean(row?.metadata?.battleType).toLowerCase();
    if (kind && kind !== "character") continue;
    const rowMode = clean(row?.format).toLowerCase();
    if (format && rowMode !== format) continue;
    const leaderBaseId = normalizeBaseId(row?.defender_leader_base_id);
    const members = normalizeMembers(row?.defender_members);
    if (!leaderBaseId || !members.length) continue;
    const boardKey = battleBoardKey(row);
    const signature = teamSignature(rowMode, leaderBaseId, members);
    const key = `${boardKey}|${signature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(Object.freeze({
      kind: "battle-reconstructed",
      format: rowMode,
      boardKey,
      signature,
      leaderBaseId,
      members: Object.freeze(members),
      observer: clean(row?.swgoh_player_id),
      seasonId: clean(row?.season_id),
      lastSeenAt: clean(row?.source_updated_at || row?.imported_at),
    }));
  }
  return Object.freeze(output);
}
function verifiedPlacementRows(rows = [], roundsById = new Map(), eventsById = new Map(), options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  const format = normalizeFormat(options.format);
  const included = [];
  const withheld = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    if (clean(row?.owner) !== "opponent" || clean(row?.side) !== "defense") continue;
    if (clean(row?.source) !== "user-confirmed-current-board") continue;
    const round = roundsById.get(clean(row?.round_id)) || {};
    const event = eventsById.get(clean(round?.event_id)) || {};
    const rowMode = rowFormat(row, event);
    if (format && rowMode !== format) continue;
    const leaderBaseId = normalizeBaseId(row?.leader_base_id);
    const members = normalizeMembers(row?.members);
    if (!leaderBaseId || !members.length || !rowMode) continue;
    const boardKey = verifiedBoardKey(row, round, event);
    const signature = teamSignature(rowMode, leaderBaseId, members);
    const placementKey = `${boardKey}|${clean(row?.zone)}|${row?.squad_slot ?? ""}|${signature}`;
    if (seen.has(placementKey)) continue;
    seen.add(placementKey);
    const normalized = Object.freeze({
      kind: "verified-zone",
      format: rowMode,
      boardKey,
      signature,
      leaderBaseId,
      members: Object.freeze(members),
      zone: clean(row?.zone),
      slot: row?.squad_slot === null || row?.squad_slot === undefined ? null : finite(row.squad_slot, null),
      datacron: row?.datacron && typeof row.datacron === "object" ? row.datacron : null,
      eventInstanceId: clean(event?.event_instance_id || row?.metadata?.eventInstanceId),
      round: finite(round?.round_number || row?.metadata?.round, 0),
      lastSeenAt: clean(row?.observed_at || round?.recorded_at),
    });
    if (historicalEvent(event, nowMs)) included.push(normalized);
    else withheld.push(normalized);
  }
  return Object.freeze({ included: Object.freeze(included), withheld: Object.freeze(withheld) });
}
function boardSetsByFormat(rows = []) {
  const index = new Map();
  for (const row of asArray(rows)) {
    const format = clean(row?.format).toLowerCase();
    if (!format || !row?.boardKey) continue;
    if (!index.has(format)) index.set(format, new Set());
    index.get(format).add(row.boardKey);
  }
  return index;
}
function summarizePredictionPlacements(battlePlacements = [], verifiedPlacements = []) {
  const groups = new Map();
  const battleBoards = new Set(asArray(battlePlacements).map((row) => row.boardKey));
  const verifiedBoards = new Set(asArray(verifiedPlacements).map((row) => row.boardKey));
  const battleBoardsByFormat = boardSetsByFormat(battlePlacements);
  const verifiedBoardsByFormat = boardSetsByFormat(verifiedPlacements);

  function ensure(row) {
    if (!groups.has(row.signature)) {
      groups.set(row.signature, {
        format: row.format,
        leaderBaseId: row.leaderBaseId,
        members: row.members,
        battleBoards: new Set(),
        verifiedBoards: new Set(),
        observers: new Set(),
        seasons: new Set(),
        zones: new Map(),
        slots: new Map(),
        lastSeenAt: "",
        latestDatacron: null,
        latestDatacronAt: 0,
      });
    }
    return groups.get(row.signature);
  }

  for (const row of asArray(battlePlacements)) {
    const group = ensure(row);
    group.battleBoards.add(row.boardKey);
    if (row.observer) group.observers.add(row.observer);
    if (row.seasonId) group.seasons.add(row.seasonId);
    group.lastSeenAt = newest(group.lastSeenAt, row.lastSeenAt);
  }
  for (const row of asArray(verifiedPlacements)) {
    const group = ensure(row);
    group.verifiedBoards.add(row.boardKey);
    if (row.zone) {
      if (!group.zones.has(row.zone)) group.zones.set(row.zone, new Set());
      group.zones.get(row.zone).add(row.boardKey);
      if (row.slot !== null) {
        const slotKey = `${row.zone}|${row.slot}`;
        if (!group.slots.has(slotKey)) group.slots.set(slotKey, new Set());
        group.slots.get(slotKey).add(row.boardKey);
      }
    }
    const datacronAt = Date.parse(row.lastSeenAt) || 0;
    if (row.datacron && datacronAt >= group.latestDatacronAt) {
      group.latestDatacron = row.datacron;
      group.latestDatacronAt = datacronAt;
    }
    group.lastSeenAt = newest(group.lastSeenAt, row.lastSeenAt);
  }

  const predictions = [...groups.values()].map((group) => {
    const verifiedCount = group.verifiedBoards.size;
    const battleCount = group.battleBoards.size;
    const formatBattleBoards = battleBoardsByFormat.get(group.format)?.size || 0;
    const formatVerifiedBoards = verifiedBoardsByFormat.get(group.format)?.size || 0;
    const zoneTendencies = [...group.zones.entries()].map(([zone, boards]) => Object.freeze({
      zone,
      verifiedBoards: boards.size,
      shareOfVerifiedAppearances: verifiedCount ? boards.size / verifiedCount : null,
    })).sort((a, b) => b.verifiedBoards - a.verifiedBoards || a.zone.localeCompare(b.zone));
    const slotTendencies = [...group.slots.entries()].map(([key, boards]) => {
      const separator = key.lastIndexOf("|");
      return Object.freeze({
        zone: key.slice(0, separator),
        slot: Number(key.slice(separator + 1)),
        verifiedBoards: boards.size,
        shareOfVerifiedAppearances: verifiedCount ? boards.size / verifiedCount : null,
      });
    }).sort((a, b) => b.verifiedBoards - a.verifiedBoards || a.zone.localeCompare(b.zone) || a.slot - b.slot);
    const evidenceClass = verifiedCount >= 2
      ? "verified-zone-recurring"
      : verifiedCount === 1
        ? "verified-zone-once"
        : battleCount >= 3
          ? "battle-recurring"
          : "battle-observed";
    return Object.freeze({
      format: group.format,
      leaderBaseId: group.leaderBaseId,
      members: Object.freeze([...group.members]),
      evidenceClass,
      verifiedHistoricalBoards: verifiedCount,
      verifiedBoardAppearanceRate: formatVerifiedBoards ? verifiedCount / formatVerifiedBoards : null,
      battleObservedMatchups: battleCount,
      battleObservedAppearanceRate: formatBattleBoards ? battleCount / formatBattleBoards : null,
      formatCoverage: Object.freeze({
        battleObservedMatchups: formatBattleBoards,
        verifiedHistoricalBoards: formatVerifiedBoards,
      }),
      observedByPlayers: group.observers.size,
      seasons: group.seasons.size,
      lastSeenAt: group.lastSeenAt,
      zoneTendencies: Object.freeze(zoneTendencies),
      slotTendencies: Object.freeze(slotTendencies),
      latestVerifiedDatacron: group.latestDatacron,
    });
  });

  predictions.sort((a, b) =>
    b.verifiedHistoricalBoards - a.verifiedHistoricalBoards ||
    b.battleObservedMatchups - a.battleObservedMatchups ||
    b.observedByPlayers - a.observedByPlayers ||
    b.seasons - a.seasons ||
    (Date.parse(b.lastSeenAt) || 0) - (Date.parse(a.lastSeenAt) || 0) ||
    a.leaderBaseId.localeCompare(b.leaderBaseId)
  );

  const byFormat = {};
  for (const format of new Set([...battleBoardsByFormat.keys(), ...verifiedBoardsByFormat.keys()])) {
    byFormat[format] = Object.freeze({
      battleObservedMatchups: battleBoardsByFormat.get(format)?.size || 0,
      verifiedHistoricalBoards: verifiedBoardsByFormat.get(format)?.size || 0,
    });
  }

  return Object.freeze({
    battleBoardsObserved: battleBoards.size,
    verifiedHistoricalBoards: verifiedBoards.size,
    byFormat: Object.freeze(byFormat),
    predictions: Object.freeze(predictions.map((entry, index) => Object.freeze({ ...entry, priorityRank: index + 1 }))),
  });
}

function suppliedHistoricalBattleRows(rows, allyCode, playerId) {
  return asArray(rows).filter((row) => {
    if (clean(row?.source) !== "c3po-gahistory") return false;
    const opponentAllyCode = clean(row?.opponent_ally_code).replace(/\D/g, "");
    const opponentPlayerId = clean(row?.opponent_swgoh_player_id);
    return opponentAllyCode === allyCode || Boolean(playerId && opponentPlayerId === playerId);
  });
}

export function createGacDefensePredictionService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const now = options.now || (() => Date.now());

  async function selectTargetPlayer(allyCode) {
    const rows = asArray(await store.select("players", {
      select: "id,ally_code,swgoh_player_id,name",
      ally_code: `eq.${allyCode}`,
      limit: 1,
    }));
    return rows[0] || null;
  }

  async function getDefensePrediction(allyCodeInput, predictionOptions = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const format = normalizeFormat(predictionOptions.format);
    const limit = Math.max(100, Math.min(5000, Math.floor(finite(predictionOptions.limit, 2500))));
    const suppliedPlayer = predictionOptions?.player && typeof predictionOptions.player === "object" ? predictionOptions.player : null;
    const suppliedPlayerCode = clean(suppliedPlayer?.ally_code || suppliedPlayer?.allyCode).replace(/\D/g, "");
    const player = suppliedPlayer && suppliedPlayerCode === allyCode ? suppliedPlayer : await selectTargetPlayer(allyCode);
    const playerId = clean(player?.swgoh_player_id || player?.playerId);

    let battleRows;
    if (Array.isArray(predictionOptions.battleRows)) {
      battleRows = suppliedHistoricalBattleRows(predictionOptions.battleRows, allyCode, playerId);
    } else {
      battleRows = asArray(await store.select("gac_battles", {
        select: "swgoh_player_id,ally_code,event_instance_id,season_id,format,round_number,match_index,match_id,opponent_swgoh_player_id,opponent_ally_code,defender_leader_base_id,defender_members,source,source_ref,source_updated_at,imported_at,metadata",
        opponent_ally_code: `eq.${allyCode}`,
        source: "eq.c3po-gahistory",
        order: "source_updated_at.desc",
        limit,
      }));
      if (!battleRows.length && playerId) {
        battleRows = asArray(await store.select("gac_battles", {
          select: "swgoh_player_id,ally_code,event_instance_id,season_id,format,round_number,match_index,match_id,opponent_swgoh_player_id,opponent_ally_code,defender_leader_base_id,defender_members,source,source_ref,source_updated_at,imported_at,metadata",
          opponent_swgoh_player_id: `eq.${playerId}`,
          source: "eq.c3po-gahistory",
          order: "source_updated_at.desc",
          limit,
        }));
      }
    }

    const opponentRounds = asArray(await store.select("gac_rounds", {
      select: "id,event_id,round_number,player_id,opponent_ally_code,result,verified,source,recorded_at",
      opponent_ally_code: `eq.${allyCode}`,
      order: "recorded_at.desc",
      limit: 500,
    }));
    const roundIds = inFilter(opponentRounds.map((row) => row.id));
    const eventIds = inFilter(opponentRounds.map((row) => row.event_id));
    const [events, squadRows] = await Promise.all([
      eventIds ? store.select("gac_events", {
        select: "id,event_instance_id,season_id,format,status,ends_at",
        id: eventIds,
        limit: 1000,
      }) : [],
      roundIds ? store.select("gac_round_squads", {
        select: "round_id,owner,side,zone,squad_slot,leader_base_id,members,datacron,source,confidence,observed_at,metadata",
        round_id: roundIds,
        owner: "eq.opponent",
        side: "eq.defense",
        source: "eq.user-confirmed-current-board",
        order: "observed_at.desc",
        limit: 5000,
      }) : [],
    ]);
    const roundsById = new Map(opponentRounds.map((row) => [clean(row.id), row]));
    const eventsById = new Map(asArray(events).map((row) => [clean(row.id), row]));

    const broad = battlePlacementRows(battleRows, format);
    const verified = verifiedPlacementRows(squadRows, roundsById, eventsById, {
      format,
      nowMs: now(),
    });
    const summary = summarizePredictionPlacements(broad, verified.included);

    return Object.freeze({
      source: "historical-gac-defense-intelligence",
      truth: "historical-prediction-not-current-board",
      player: Object.freeze({
        allyCode,
        playerId,
        name: clean(player?.name),
      }),
      format: format || "all",
      coverage: Object.freeze({
        publishedHistoricalBattleRows: battleRows.length,
        deduplicatedBattlePlacements: broad.length,
        battleObservedMatchups: summary.battleBoardsObserved,
        verifiedHistoricalBoardRows: verified.included.length,
        verifiedHistoricalBoards: summary.verifiedHistoricalBoards,
        withheldCurrentOrUnresolvedBoardRows: verified.withheld.length,
        byFormat: summary.byFormat,
        predictions: summary.predictions.length,
      }),
      predictions: Object.freeze(summary.predictions.slice(0, 30)),
      notes: Object.freeze([
        "Predictions are historical scouting evidence, never a claim about the opponent's current hidden board.",
        "Broad recurrence uses published C-3PO GAHistory battle rows only; current War Room battle logs are not republished through this prediction path.",
        "Repeated attacks against the same exact defense in one matchup are deduplicated before placement frequency is calculated.",
        "Named zone/slot tendencies come only from verified opponent-board observations after the parent GAC event is historical/completed.",
        "Current or completion-unresolved verified board rows are withheld from this public historical prediction path.",
        "Appearance rates use incomplete observed-board coverage and are scouting frequencies, not calibrated presence probabilities.",
      ]),
    });
  }

  return Object.freeze({ getDefensePrediction });
}

export const gacDefensePredictionService = createGacDefensePredictionService();

export {
  battleBoardKey,
  battlePlacementRows,
  boardSetsByFormat,
  historicalEvent,
  summarizePredictionPlacements,
  suppliedHistoricalBattleRows,
  teamSignature,
  verifiedPlacementRows,
};
