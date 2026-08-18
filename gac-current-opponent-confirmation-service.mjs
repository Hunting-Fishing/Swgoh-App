import { gacBracketIndexService } from "./gac-bracket-index-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(code) ? code : "";
}

function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}

export function createGacCurrentOpponentConfirmationService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const bracketIndex = options.bracketIndex || gacBracketIndexService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function assertVerifiedOwnership(userIdInput, allyCodeInput) {
    const userId = clean(userIdInput);
    const allyCode = normalizeAllyCode(allyCodeInput);
    if (!userId || !allyCode) {
      const error = new Error("A signed-in verified player is required to confirm a GAC matchup.");
      error.status = 401;
      throw error;
    }

    const player = await selectOne("players", {
      select: "id,ally_code,swgoh_player_id,name",
      ally_code: `eq.${allyCode}`,
    });
    if (!player?.id) {
      const error = new Error("The player must exist in the canonical roster store before a GAC matchup can be confirmed.");
      error.status = 404;
      throw error;
    }

    const link = await selectOne("user_player_links", {
      select: "user_id,player_id,verification_status,verified_at",
      user_id: `eq.${userId}`,
      player_id: `eq.${player.id}`,
      verification_status: "eq.verified",
    });
    if (!link?.verified_at && clean(link?.verification_status) !== "verified") {
      const error = new Error("This signed-in account has not verified ownership of that Ally Code.");
      error.status = 403;
      throw error;
    }
    return player;
  }

  async function confirm(userIdInput, input = {}) {
    const allyCode = normalizeAllyCode(input.allyCode);
    const opponentAllyCode = normalizeAllyCode(input.opponentAllyCode);
    const eventInstanceId = clean(input.eventInstanceId);
    const round = validRound(input.round);
    if (!allyCode || !opponentAllyCode || allyCode === opponentAllyCode) {
      const error = new Error("Two different valid 9-digit Ally Codes are required.");
      error.status = 400;
      throw error;
    }
    if (!eventInstanceId || !round) {
      const error = new Error("The current GAC event and Round 1, 2, or 3 are required.");
      error.status = 400;
      throw error;
    }

    const player = await assertVerifiedOwnership(userIdInput, allyCode);
    const bracket = await bracketIndex.findIndexedBracket(allyCode, eventInstanceId);
    if (!bracket) {
      const error = new Error("Resolve the live 8-player bracket before confirming the current opponent.");
      error.status = 409;
      throw error;
    }
    const opponent = asArray(bracket.players).find((entry) => normalizeAllyCode(entry?.allyCode) === opponentAllyCode);
    if (!opponent) {
      const error = new Error("The selected opponent is not a member of this player's indexed live GAC bracket.");
      error.status = 409;
      throw error;
    }

    const event = await selectOne("gac_events", {
      select: "id,event_instance_id",
      event_instance_id: `eq.${eventInstanceId}`,
    });
    if (!event?.id) {
      const error = new Error("The current GAC event has not been indexed yet.");
      error.status = 409;
      throw error;
    }
    const opponentPlayer = await selectOne("players", {
      select: "id,ally_code,swgoh_player_id,name",
      ally_code: `eq.${opponentAllyCode}`,
    }).catch(() => null);

    const recordedAt = now().toISOString();
    const row = {
      event_id: event.id,
      round_number: round,
      player_id: player.id,
      opponent_player_id: opponentPlayer?.id || null,
      opponent_swgoh_player_id: clean(opponent?.playerId || opponentPlayer?.swgoh_player_id) || null,
      opponent_ally_code: opponentAllyCode,
      opponent_name: clean(opponent?.name || opponentPlayer?.name) || null,
      result: "unknown",
      player_banners: null,
      opponent_banners: null,
      source: "user-confirmed-current-bracket",
      source_ref: clean(input.sourceRef || "gac-command-center"),
      confidence: 1,
      verified: true,
      recorded_at: recordedAt,
      metadata: {
        confirmationMethod: "verified-user-selected-live-bracket-opponent",
        confirmedByUserId: clean(userIdInput),
        bracketVerified: true,
        exactOpponentEligible: true,
        roundSource: clean(input.roundSource || "user-confirmed"),
        league: clean(bracket.league),
        bracketIndex: Number(bracket.bracketIndex ?? 0),
        groupId: clean(bracket.groupId),
      },
    };
    await store.upsert("gac_rounds", [row], {
      onConflict: "event_id,round_number,player_id,source",
    });

    return Object.freeze({
      source: "user-confirmed-current-bracket",
      opponent: Object.freeze({
        allyCode: opponentAllyCode,
        playerId: clean(row.opponent_swgoh_player_id),
        name: clean(row.opponent_name),
      }),
      resolution: Object.freeze({
        exact: true,
        method: "verified-user-confirmed-current-bracket",
        eventInstanceId,
        round,
        source: row.source,
        confidence: 1,
        verified: true,
        recordedAt,
        roundSource: row.metadata.roundSource,
      }),
    });
  }

  return Object.freeze({
    assertVerifiedOwnership,
    confirm,
  });
}

export const gacCurrentOpponentConfirmationService = createGacCurrentOpponentConfirmationService();

export { normalizeAllyCode, validRound };
