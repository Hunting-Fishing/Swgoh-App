import crypto from "node:crypto";
import { createC3poHistorySource, normalizePlayerBattles } from "./gac-c3po-source.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function deterministicKey(parts) {
  return crypto.createHash("sha256").update(parts.map(clean).join("|")).digest("hex");
}

function chunks(values, size = 200) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function battleRow(battle, context) {
  const battleKey = deterministicKey([
    "c3po-gahistory",
    battle.eventInstanceId || battle.seasonId,
    battle.format,
    battle.playerId,
    battle.matchIndex,
    battle.attackGroupIndex,
    battle.duelIndex,
  ]);
  return {
    battle_key: battleKey,
    player_id: context.playerRowId,
    swgoh_player_id: battle.playerId,
    ally_code: battle.allyCode || null,
    event_instance_id: battle.eventInstanceId || null,
    season_id: battle.seasonId || null,
    format: battle.format,
    match_index: battle.matchIndex,
    attack_group_index: battle.attackGroupIndex,
    duel_index: battle.duelIndex,
    round_number: battle.roundNumber,
    match_id: battle.matchId || null,
    opponent_swgoh_player_id: battle.opponentPlayerId || null,
    opponent_ally_code: battle.opponentAllyCode || null,
    opponent_name: battle.opponentName || null,
    attacker_leader_base_id: battle.attackerLeaderBaseId || null,
    attacker_members: battle.attackerMembers,
    defender_leader_base_id: battle.defenderLeaderBaseId || null,
    defender_members: battle.defenderMembers,
    battle_outcome: battle.outcome,
    source: "c3po-gahistory",
    source_ref: context.sourceRef,
    source_updated_at: context.sourceUpdatedAt,
    metadata: {
      battleType: battle.battleType,
      rawOutcome: battle.rawOutcome,
    },
  };
}

function roundRowsFromBattles(battles, context) {
  const byRound = new Map();
  for (const battle of battles) {
    if (![1, 2, 3].includes(Number(battle.roundNumber))) continue;
    const key = Number(battle.roundNumber);
    if (!byRound.has(key)) byRound.set(key, battle);
  }
  return [...byRound.entries()].map(([roundNumber, battle]) => ({
    event_id: context.eventRowId,
    round_number: roundNumber,
    player_id: context.playerRowId,
    opponent_swgoh_player_id: battle.opponentPlayerId || null,
    opponent_ally_code: battle.opponentAllyCode || null,
    opponent_name: battle.opponentName || null,
    result: "unknown",
    player_banners: null,
    opponent_banners: null,
    source: "c3po-gahistory",
    source_ref: context.sourceRef,
    confidence: battle.opponentPlayerId || battle.opponentAllyCode || battle.opponentName ? 0.95 : 0.85,
    verified: false,
    recorded_at: context.sourceUpdatedAt,
    metadata: {
      importedFromMatchIndex: battle.matchIndex,
      sourceRoundNumber: true,
    },
  }));
}

export function createGacHistoryImportService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const source = options.source || createC3poHistorySource(options.sourceOptions);
  const now = options.now || (() => new Date());

  async function findPlayer(allyCode) {
    const rows = asArray(await store.select("players", {
      select: "id,ally_code,swgoh_player_id,name",
      ally_code: `eq.${allyCode}`,
      limit: 1,
    }));
    const player = rows[0];
    if (!player) {
      const error = new Error("The player must exist in the canonical roster store before GAC history can be imported.");
      error.status = 404;
      throw error;
    }
    const playerId = clean(player.swgoh_player_id);
    if (!playerId) {
      const error = new Error("The canonical player record does not have a SWGOH player ID yet.");
      error.status = 409;
      throw error;
    }
    return { ...player, swgoh_player_id: playerId };
  }

  async function upsertEvent(info) {
    const eventInstanceId = clean(info.eventInstanceId || `${info.mode}:${info.instanceId}`);
    const row = {
      event_instance_id: eventInstanceId,
      season_id: clean(info.season || info.instanceId),
      instance_id: clean(info.instanceId) || null,
      format: info.mode,
      status: "history-published",
      source: "c3po-gahistory",
      source_ref: `${source.baseUrl}/${info.mode}/info.json`,
      captured_at: now().toISOString(),
      metadata: {},
    };
    const upserted = asArray(await store.upsert("gac_events", [row], { onConflict: "event_instance_id" }));
    let event = upserted[0] || null;
    if (!event?.id) {
      const selected = asArray(await store.select("gac_events", {
        select: "id,event_instance_id",
        event_instance_id: `eq.${eventInstanceId}`,
        limit: 1,
      }));
      event = selected[0] || event;
    }
    return { eventInstanceId, eventRowId: clean(event?.id) };
  }

  async function importMode(player, mode) {
    const info = await source.getInfo(mode);
    const raw = await source.getPlayer(mode, player.swgoh_player_id);
    if (!raw) {
      return Object.freeze({ mode, eventInstanceId: info.eventInstanceId, season: info.season, imported: 0, available: false });
    }
    const event = await upsertEvent(info);
    const sourceUpdatedAt = now().toISOString();
    const sourceRef = `${source.baseUrl}/${mode}/${encodeURIComponent(player.swgoh_player_id)}.json`;
    const battles = normalizePlayerBattles(raw, {
      mode,
      playerId: player.swgoh_player_id,
      allyCode: player.ally_code,
      eventInstanceId: event.eventInstanceId,
      season: info.season,
    });
    const rows = battles.map((battle) => battleRow(battle, {
      playerRowId: player.id,
      sourceRef,
      sourceUpdatedAt,
    }));
    for (const batch of chunks(rows, 200)) {
      if (batch.length) await store.upsert("gac_battles", batch, { onConflict: "battle_key" });
    }

    let roundRows = [];
    if (event.eventRowId) {
      roundRows = roundRowsFromBattles(battles, {
        eventRowId: event.eventRowId,
        playerRowId: player.id,
        sourceRef,
        sourceUpdatedAt,
      });
      if (roundRows.length) {
        await store.upsert("gac_rounds", roundRows, {
          onConflict: "event_id,round_number,player_id,source",
        });
      }
    }

    return Object.freeze({
      mode,
      eventInstanceId: event.eventInstanceId,
      season: info.season,
      imported: rows.length,
      importedRounds: roundRows.length,
      available: true,
      characterBattles: battles.filter((battle) => battle.battleType === "character").length,
      fleetBattles: battles.filter((battle) => battle.battleType === "fleet").length,
    });
  }

  async function importPlayer(allyCodeInput, options = {}) {
    const allyCode = normalizeAllyCode(allyCodeInput);
    const player = await findPlayer(allyCode);
    const modes = asArray(options.modes).length ? options.modes : ["3v3", "5v5"];
    const results = [];
    for (const mode of modes) results.push(await importMode(player, mode));
    return Object.freeze({
      source: "c3po-gahistory",
      player: Object.freeze({ allyCode, playerId: player.swgoh_player_id, name: clean(player.name) }),
      results: Object.freeze(results),
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      importedRounds: results.reduce((sum, result) => sum + (result.importedRounds || 0), 0),
      importedAt: now().toISOString(),
    });
  }

  return Object.freeze({ importPlayer, importMode });
}

export const gacHistoryImportService = createGacHistoryImportService();
