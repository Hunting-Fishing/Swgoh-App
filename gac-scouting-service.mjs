import { createGacDefensePredictionService } from "./gac-defense-prediction-service.mjs";
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
  if (!/^\d{9}$/.test(allyCode)) {
    const error = new Error("A valid 9-digit Ally Code is required.");
    error.status = 400;
    throw error;
  }
  return allyCode;
}

function normalizeBaseId(value) {
  return clean(value).split(":")[0].toUpperCase();
}

function normalizeMembers(value) {
  return [...new Set(asArray(value).map(normalizeBaseId).filter(Boolean))];
}

function boundedLimit(value, fallback = 2000, max = 5000) {
  const parsed = Math.floor(finite(value, fallback));
  return Math.max(100, Math.min(max, parsed || fallback));
}

function isCharacterBattle(row) {
  const kind = clean(row?.metadata?.battleType).toLowerCase();
  return !kind || kind === "character";
}

function teamSignature(format, leaderBaseId, members) {
  return `${clean(format).toLowerCase()}|${normalizeBaseId(leaderBaseId)}|${normalizeMembers(members).join(",")}`;
}

function newest(left, right) {
  const a = Date.parse(clean(left)) || 0;
  const b = Date.parse(clean(right)) || 0;
  return b > a ? clean(right) : clean(left);
}

function summarizeTeams(rows, perspective) {
  const groups = new Map();
  for (const row of asArray(rows)) {
    if (!isCharacterBattle(row)) continue;
    const offense = perspective === "offense";
    const leaderBaseId = normalizeBaseId(offense ? row.attacker_leader_base_id : row.defender_leader_base_id);
    const members = normalizeMembers(offense ? row.attacker_members : row.defender_members);
    if (!leaderBaseId || !members.length) continue;
    const format = clean(row.format).toLowerCase();
    const key = teamSignature(format, leaderBaseId, members);
    if (!groups.has(key)) {
      groups.set(key, {
        format,
        leaderBaseId,
        members,
        observations: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        unknown: 0,
        seasons: new Set(),
        observers: new Set(),
        lastSeenAt: "",
      });
    }
    const group = groups.get(key);
    group.observations += 1;
    const outcome = clean(row.battle_outcome).toLowerCase();
    if (outcome === "win") group.wins += 1;
    else if (outcome === "loss") group.losses += 1;
    else if (outcome === "draw") group.draws += 1;
    else group.unknown += 1;
    if (clean(row.season_id)) group.seasons.add(clean(row.season_id));
    if (clean(row.swgoh_player_id)) group.observers.add(clean(row.swgoh_player_id));
    group.lastSeenAt = newest(group.lastSeenAt, row.source_updated_at);
  }

  return [...groups.values()].map((group) => {
    const resolved = group.wins + group.losses + group.draws;
    if (perspective === "defense") {
      return Object.freeze({
        format: group.format,
        leaderBaseId: group.leaderBaseId,
        members: Object.freeze(group.members),
        observations: group.observations,
        holds: group.losses,
        beaten: group.wins,
        draws: group.draws,
        unknown: group.unknown,
        holdRate: resolved ? group.losses / resolved : null,
        observedByPlayers: group.observers.size,
        seasons: group.seasons.size,
        lastSeenAt: group.lastSeenAt,
      });
    }
    return Object.freeze({
      format: group.format,
      leaderBaseId: group.leaderBaseId,
      members: Object.freeze(group.members),
      attempts: group.observations,
      wins: group.wins,
      losses: group.losses,
      draws: group.draws,
      unknown: group.unknown,
      winRate: resolved ? group.wins / resolved : null,
      seasons: group.seasons.size,
      lastSeenAt: group.lastSeenAt,
    });
  }).sort((a, b) => {
    const left = perspective === "defense" ? a.observations : a.attempts;
    const right = perspective === "defense" ? b.observations : b.attempts;
    const rateLeft = perspective === "defense" ? finite(a.holdRate) : finite(a.winRate);
    const rateRight = perspective === "defense" ? finite(b.holdRate) : finite(b.winRate);
    return right - left || rateRight - rateLeft || a.leaderBaseId.localeCompare(b.leaderBaseId);
  });
}

async function selectTargetPlayer(store, allyCode) {
  const rows = asArray(await store.select("players", {
    select: "id,ally_code,swgoh_player_id,name",
    ally_code: `eq.${allyCode}`,
    limit: 1,
  }));
  return rows[0] || null;
}

async function selectBattleRows(store, query) {
  return asArray(await store.select("gac_battles", {
    select: "swgoh_player_id,ally_code,event_instance_id,season_id,format,round_number,match_index,match_id,opponent_swgoh_player_id,opponent_ally_code,opponent_name,attacker_leader_base_id,attacker_members,defender_leader_base_id,defender_members,battle_outcome,source,source_ref,source_updated_at,imported_at,metadata",
    order: "source_updated_at.desc",
    ...query,
  }));
}

export function createGacScoutingService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const prediction = options.prediction || createGacDefensePredictionService({ store, now: options.now });

  async function getScoutingReport(allyCodeInput, reportOptions = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const limit = boundedLimit(reportOptions.limit);
    const player = await selectTargetPlayer(store, allyCode);
    const playerId = clean(player?.swgoh_player_id);

    let [offenseRows, defenseRows] = await Promise.all([
      selectBattleRows(store, { ally_code: `eq.${allyCode}`, limit }),
      selectBattleRows(store, { opponent_ally_code: `eq.${allyCode}`, limit }),
    ]);

    if (!offenseRows.length && playerId) {
      offenseRows = await selectBattleRows(store, { swgoh_player_id: `eq.${playerId}`, limit });
    }
    if (!defenseRows.length && playerId) {
      defenseRows = await selectBattleRows(store, { opponent_swgoh_player_id: `eq.${playerId}`, limit });
    }

    const defenses = summarizeTeams(defenseRows, "defense");
    const offenses = summarizeTeams(offenseRows, "offense");
    const observedByPlayers = new Set(defenseRows.map((row) => clean(row.swgoh_player_id)).filter(Boolean)).size;
    let defensePrediction = null;
    try {
      defensePrediction = await prediction.getDefensePrediction(allyCode, {
        limit,
        player,
        battleRows: defenseRows,
      });
    } catch (error) {
      defensePrediction = Object.freeze({
        source: "historical-gac-defense-intelligence",
        truth: "historical-prediction-not-current-board",
        unavailable: true,
        error: clean(error?.message || "Defense prediction evidence is temporarily unavailable.").slice(0, 240),
        coverage: Object.freeze({ predictions: 0 }),
        predictions: Object.freeze([]),
      });
    }

    return Object.freeze({
      source: "persisted-gac-battle-scouting",
      player: Object.freeze({
        allyCode,
        playerId,
        name: clean(player?.name),
      }),
      coverage: Object.freeze({
        defensiveBattleRows: defenseRows.length,
        offensiveBattleRows: offenseRows.length,
        observedByPlayers,
        hasDefenseEvidence: defenses.length > 0,
        hasOffenseEvidence: offenses.length > 0,
        hasDefensePrediction: asArray(defensePrediction?.predictions).length > 0,
      }),
      defensePrediction,
      defensiveTendencies: Object.freeze(defenses.slice(0, 30)),
      offensiveTendencies: Object.freeze(offenses.slice(0, 30)),
      notes: Object.freeze([
        "Defense tendencies are reconstructed from persisted attacks against this player, including sourced history and explicitly owner-confirmed completed battles; they are historical observations, not a claim about the current hidden board.",
        "Offense tendencies come from persisted GAC battle evidence, including sourced imports and explicitly owner-confirmed completed battles.",
        "Defense prediction is a separate historical-only layer: published history drives recurrence and only completed-event verified boards may contribute named zone/slot tendencies.",
      ]),
    });
  }

  return Object.freeze({ getScoutingReport });
}

export const gacScoutingService = createGacScoutingService();

export { summarizeTeams };
