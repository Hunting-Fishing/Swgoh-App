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

function normalizeAllyCode(value) {
  const allyCode = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(allyCode) ? allyCode : "";
}

function inFilter(values = []) {
  const safe = [...new Set(values.map(clean).filter((value) => /^[0-9a-f-]{20,40}$/i.test(value)))];
  return safe.length ? `in.(${safe.join(",")})` : "";
}

function allyInFilter(values = []) {
  const safe = [...new Set(values.map(normalizeAllyCode).filter(Boolean))];
  return safe.length ? `in.(${safe.join(",")})` : "";
}

function timestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizeLeague(value) {
  const league = clean(value).toUpperCase();
  return ["KYBER", "AURODIUM", "CHROMIUM", "BRONZIUM", "CARBONITE"].includes(league) ? league : "";
}

function normalizedPlayer(entry = {}) {
  const playerId = clean(entry.playerId || entry.swgohPlayerId || entry.swgoh_player_id || entry.id);
  if (!playerId) return null;
  return Object.freeze({
    playerId,
    allyCode: normalizeAllyCode(entry.allyCode || entry.ally_code),
    name: clean(entry.name || entry.playerName || "Unknown Player"),
    guildName: clean(entry.guildName || entry.guild_name),
    score: finite(entry.score),
    rank: finite(entry.rank),
    skillRating: finite(entry.skillRating || entry.skill_rating),
    profileAvailable: entry.profileAvailable !== false,
  });
}

function currentRoundFrom(playerContext = {}, currentEvent = {}) {
  const candidates = [
    playerContext?.round,
    playerContext?.roundNumber,
    playerContext?.currentRound,
    playerContext?.currentRoundNumber,
    playerContext?.event?.round,
    playerContext?.event?.roundNumber,
    currentEvent?.round,
    currentEvent?.roundNumber,
    currentEvent?.currentRound,
    currentEvent?.currentRoundNumber,
    currentEvent?.event?.round,
    currentEvent?.event?.roundNumber,
  ];
  const eventInstanceId = clean(currentEvent?.eventInstanceId || currentEvent?.event?.eventInstanceId || playerContext?.event?.eventInstanceId);
  for (const status of asArray(playerContext?.seasonStatus)) {
    const statusEventId = clean(status?.eventInstanceId);
    if (eventInstanceId && statusEventId && statusEventId !== eventInstanceId) continue;
    candidates.push(status?.round, status?.roundNumber, status?.currentRound, status?.currentRoundNumber);
  }
  for (const candidate of candidates) {
    const round = Number(candidate);
    if (Number.isInteger(round) && round >= 1 && round <= 3) return round;
  }
  return null;
}

export function createGacBracketIndexService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const now = options.now || (() => new Date());

  function status() {
    const persistence = typeof store?.status === "function" ? store.status() : { configured: true };
    return Object.freeze({
      configured: persistence?.configured !== false,
      mode: "supabase-live-gac-bracket-index",
    });
  }

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function persistBracket(bracketInput, options = {}) {
    const bracket = bracketInput || {};
    const event = bracket.event || {};
    const eventInstanceId = clean(event.eventInstanceId || bracket.eventInstanceId);
    const league = normalizeLeague(bracket.league);
    const bracketIndex = Number(bracket.bracketIndex);
    const groupId = clean(bracket.groupId || (eventInstanceId && league && Number.isInteger(bracketIndex)
      ? `${eventInstanceId}:${league}:${bracketIndex}`
      : ""));
    if (!eventInstanceId || !league || !Number.isInteger(bracketIndex) || bracketIndex < 0 || !groupId) {
      const error = new Error("A complete live GAC bracket payload is required for indexing.");
      error.status = 400;
      throw error;
    }

    const capturedAt = now().toISOString();
    const eventRow = {
      event_instance_id: eventInstanceId,
      season_id: clean(event.id || event.seasonId || eventInstanceId.split(":")[0] || eventInstanceId),
      instance_id: clean(event.instanceId) || null,
      format: ["3v3", "5v5"].includes(clean(bracket.format).toLowerCase()) ? clean(bracket.format).toLowerCase() : null,
      status: clean(event.status) || null,
      starts_at: timestamp(event.startTime || event.displayStartTime),
      ends_at: timestamp(event.rewardTime || event.displayEndTime),
      source: "comlink",
      source_ref: clean(options.sourceRef || "/v1/gac/bracket/by-player"),
      captured_at: capturedAt,
      metadata: {
        lookupMethod: clean(bracket.lookup?.method),
        playerCount: asArray(bracket.players).length,
      },
    };
    const eventUpsert = asArray(await store.upsert("gac_events", [eventRow], { onConflict: "event_instance_id" }));
    const persistedEvent = eventUpsert[0] || await selectOne("gac_events", {
      select: "id,event_instance_id",
      event_instance_id: `eq.${eventInstanceId}`,
    });
    if (!persistedEvent?.id) throw new Error("The GAC event could not be indexed.");

    const bracketRow = {
      event_id: persistedEvent.id,
      league,
      bracket_index: bracketIndex,
      group_id: groupId,
      captured_at: capturedAt,
      source: "comlink",
      metadata: {
        lookupMethod: clean(bracket.lookup?.method),
        lookupAllyCode: normalizeAllyCode(bracket.lookup?.allyCode),
      },
    };
    const bracketUpsert = asArray(await store.upsert("gac_brackets", [bracketRow], {
      onConflict: "event_id,league,bracket_index",
    }));
    const persistedBracket = bracketUpsert[0] || await selectOne("gac_brackets", {
      select: "id,event_id,league,bracket_index,group_id,captured_at",
      event_id: `eq.${persistedEvent.id}`,
      league: `eq.${league}`,
      bracket_index: `eq.${bracketIndex}`,
    });
    if (!persistedBracket?.id) throw new Error("The GAC bracket could not be indexed.");

    const players = asArray(bracket.players).map(normalizedPlayer).filter(Boolean);
    const allyFilter = allyInFilter(players.map((player) => player.allyCode));
    const canonicalPlayers = allyFilter ? asArray(await store.select("players", {
      select: "id,ally_code",
      ally_code: allyFilter,
      limit: 20,
    })) : [];
    const canonicalByAlly = new Map(canonicalPlayers.map((player) => [normalizeAllyCode(player.ally_code), clean(player.id)]));
    const rows = players.map((player) => ({
      bracket_id: persistedBracket.id,
      player_id: canonicalByAlly.get(player.allyCode) || null,
      swgoh_player_id: player.playerId,
      ally_code: player.allyCode || null,
      player_name: player.name || "Unknown Player",
      skill_rating: player.skillRating || null,
      bracket_score: player.score,
      bracket_rank: player.rank || null,
      guild_name: player.guildName || null,
      captured_at: capturedAt,
      metadata: { profileAvailable: player.profileAvailable },
    }));
    if (rows.length) {
      await store.upsert("gac_bracket_players", rows, { onConflict: "bracket_id,swgoh_player_id" });
    }

    return Object.freeze({
      indexed: true,
      eventInstanceId,
      league,
      bracketIndex,
      groupId,
      players: rows.length,
      capturedAt,
    });
  }

  async function findIndexedBracket(allyCodeInput, eventInstanceIdInput) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const eventInstanceId = clean(eventInstanceIdInput);
    if (!allyCode || !eventInstanceId) return null;

    const event = await selectOne("gac_events", {
      select: "id,event_instance_id,season_id,instance_id,format,status,starts_at,ends_at,captured_at",
      event_instance_id: `eq.${eventInstanceId}`,
    });
    if (!event?.id) return null;

    const memberships = asArray(await store.select("gac_bracket_players", {
      select: "bracket_id,swgoh_player_id,ally_code,player_name,captured_at",
      ally_code: `eq.${allyCode}`,
      order: "captured_at.desc",
      limit: 10,
    }));
    const bracketIds = inFilter(memberships.map((row) => row.bracket_id));
    if (!bracketIds) return null;
    const brackets = asArray(await store.select("gac_brackets", {
      select: "id,event_id,league,bracket_index,group_id,captured_at,metadata",
      id: bracketIds,
      event_id: `eq.${event.id}`,
      order: "captured_at.desc",
      limit: 10,
    }));
    const bracket = brackets[0];
    if (!bracket?.id) return null;

    const playerRows = asArray(await store.select("gac_bracket_players", {
      select: "swgoh_player_id,ally_code,player_name,skill_rating,bracket_score,bracket_rank,guild_name,captured_at,metadata",
      bracket_id: `eq.${bracket.id}`,
      order: "bracket_rank.asc.nullslast,player_name.asc",
      limit: 16,
    }));
    const players = playerRows.map((row) => Object.freeze({
      playerId: clean(row.swgoh_player_id),
      allyCode: normalizeAllyCode(row.ally_code),
      name: clean(row.player_name || "Unknown Player"),
      skillRating: finite(row.skill_rating),
      score: finite(row.bracket_score),
      rank: finite(row.bracket_rank),
      guildName: clean(row.guild_name),
      profileAvailable: row?.metadata?.profileAvailable !== false,
    }));

    return Object.freeze({
      source: "persisted-gac-bracket-index",
      event: Object.freeze({
        id: clean(event.season_id),
        instanceId: clean(event.instance_id),
        eventInstanceId: clean(event.event_instance_id),
        status: clean(event.status),
        startTime: clean(event.starts_at),
        rewardTime: clean(event.ends_at),
      }),
      format: clean(event.format),
      league: clean(bracket.league),
      bracketIndex: finite(bracket.bracket_index),
      groupId: clean(bracket.group_id),
      players: Object.freeze(players),
      playerCount: players.length,
      lookup: Object.freeze({ allyCode, method: "persisted-bracket-index" }),
      opponents: Object.freeze(players.filter((entry) => entry.allyCode !== allyCode)),
      indexedAt: clean(bracket.captured_at),
    });
  }

  async function findExactOpponent(allyCodeInput, eventInstanceIdInput, roundInput) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const eventInstanceId = clean(eventInstanceIdInput);
    const round = Number(roundInput);
    if (!allyCode || !eventInstanceId || !Number.isInteger(round) || round < 1 || round > 3) return null;

    const [player, event] = await Promise.all([
      selectOne("players", { select: "id,ally_code,swgoh_player_id,name", ally_code: `eq.${allyCode}` }),
      selectOne("gac_events", { select: "id,event_instance_id", event_instance_id: `eq.${eventInstanceId}` }),
    ]);
    if (!player?.id || !event?.id) return null;

    const rows = asArray(await store.select("gac_rounds", {
      select: "opponent_swgoh_player_id,opponent_ally_code,opponent_name,source,source_ref,confidence,verified,recorded_at",
      event_id: `eq.${event.id}`,
      player_id: `eq.${player.id}`,
      round_number: `eq.${round}`,
      order: "verified.desc,confidence.desc,recorded_at.desc",
      limit: 5,
    }));
    const row = rows.find((candidate) => candidate?.verified === true || finite(candidate?.confidence) >= 0.9);
    if (!row) return null;

    let opponentAllyCode = normalizeAllyCode(row.opponent_ally_code);
    if (!opponentAllyCode && clean(row.opponent_swgoh_player_id)) {
      const opponentPlayer = await selectOne("players", {
        select: "ally_code,name,swgoh_player_id",
        swgoh_player_id: `eq.${clean(row.opponent_swgoh_player_id)}`,
      });
      opponentAllyCode = normalizeAllyCode(opponentPlayer?.ally_code);
    }
    if (!opponentAllyCode) return null;

    return Object.freeze({
      opponent: Object.freeze({
        allyCode: opponentAllyCode,
        playerId: clean(row.opponent_swgoh_player_id),
        name: clean(row.opponent_name),
      }),
      resolution: Object.freeze({
        exact: true,
        method: "persisted-event-round-evidence",
        eventInstanceId,
        round,
        source: clean(row.source),
        sourceRef: clean(row.source_ref),
        confidence: finite(row.confidence),
        verified: row.verified === true,
        recordedAt: clean(row.recorded_at),
      }),
    });
  }

  return Object.freeze({
    status,
    persistBracket,
    findIndexedBracket,
    findExactOpponent,
    currentRoundFrom,
  });
}

export const gacBracketIndexService = createGacBracketIndexService();

export { currentRoundFrom, normalizeAllyCode, normalizedPlayer, timestamp };
