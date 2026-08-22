import crypto from "node:crypto";
import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import { gacDatacronCounterEvidenceService } from "./gac-datacron-counter-evidence-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function validResult(value) {
  const result = clean(value).toLowerCase();
  return result === "win" || result === "loss" ? result : "";
}
function validAttemptIndex(value, length) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < length ? index : null;
}
function deterministicKey(parts) {
  return crypto.createHash("sha256").update(parts.map(clean).join("|")).digest("hex");
}
function normalizedMembers(values) {
  return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))];
}
function defenderDatacronState(defense = {}) {
  if (clean(defense?.datacron?.id)) return "assigned";
  const state = clean(defense?.metadata?.datacronState).toLowerCase();
  return state === "none" ? "none" : "unknown";
}
function attackerDatacronState(assignment = {}) {
  return clean(assignment?.datacron?.id) ? "assigned" : "none";
}

export function createGacVerifiedBattleService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const boards = options.boards || gacBoardObservationService;
  const datacronEvidence = options.datacronEvidence || gacDatacronCounterEvidenceService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function archiveDatacronEvidence(input = {}) {
    if (!datacronEvidence?.recordBattle) return null;
    try {
      return await datacronEvidence.recordBattle(input);
    } catch (error) {
      console.warn("Verified GAC battle saved without supplemental Datacron evidence", error?.message || error);
      return null;
    }
  }

  async function verifyAttempt(userId, input = {}) {
    if (input.confirm !== true) {
      const error = new Error("Explicit owner confirmation is required before a War Room result can be archived as battle evidence.");
      error.status = 400;
      throw error;
    }

    const resolved = await boards.resolveRound(userId, input);
    const assignmentId = Number(input.assignmentId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      const error = new Error("A valid War Room assignment ID is required.");
      error.status = 400;
      throw error;
    }

    const assignment = await selectOne("gac_attack_plan_assignments", {
      select: "id,round_id,defense_squad_id,attempt_log,datacron,source",
      id: `eq.${assignmentId}`,
      round_id: `eq.${resolved.roundRow.id}`,
      source: "eq.verified-owner-war-room",
    });
    if (!assignment?.id) {
      const error = new Error("That War Room assignment is not part of the verified current round.");
      error.status = 404;
      throw error;
    }

    const attempts = asArray(assignment.attempt_log);
    const attemptIndex = validAttemptIndex(input.attemptIndex, attempts.length);
    if (attemptIndex === null) {
      const error = new Error("Select the completed War Room attempt you are explicitly confirming.");
      error.status = 400;
      throw error;
    }
    const attempt = attempts[attemptIndex] || {};
    const result = validResult(attempt.status);
    const attackerMembers = normalizedMembers(attempt.members);
    const attackerLeader = normalizeBaseId(attempt.leaderBaseId);
    if (!result || !attackerLeader || !attackerMembers.length || !attackerMembers.includes(attackerLeader)) {
      const error = new Error("Only a completed Win or Loss attempt with a complete attacker snapshot can be archived.");
      error.status = 409;
      throw error;
    }

    const defense = await selectOne("gac_round_squads", {
      select: "id,round_id,leader_base_id,members,datacron,zone,squad_slot,owner,side,source,metadata",
      id: `eq.${Number(assignment.defense_squad_id)}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: "eq.opponent",
      side: "eq.defense",
      source: "eq.user-confirmed-current-board",
    });
    if (!defense?.id) {
      const error = new Error("The verified enemy defense snapshot for this attempt is unavailable.");
      error.status = 409;
      throw error;
    }
    const defenderMembers = normalizedMembers(defense.members);
    const defenderLeader = normalizeBaseId(defense.leader_base_id);
    if (!defenderLeader || !defenderMembers.length || !defenderMembers.includes(defenderLeader)) {
      const error = new Error("The saved enemy defense snapshot is incomplete and cannot become battle evidence.");
      error.status = 409;
      throw error;
    }

    const event = await selectOne("gac_events", {
      select: "id,event_instance_id,season_id,format",
      id: `eq.${resolved.event.id}`,
    });
    const format = clean(event?.format).toLowerCase();
    if (!["3v3", "5v5"].includes(format)) {
      const inferred = attackerMembers.length === 3 && defenderMembers.length === 3 ? "3v3"
        : attackerMembers.length === 5 && defenderMembers.length === 5 ? "5v5" : "";
      if (!inferred) {
        const error = new Error("The GAC format cannot be verified for this completed attempt.");
        error.status = 409;
        throw error;
      }
    }
    const verifiedFormat = ["3v3", "5v5"].includes(format)
      ? format
      : (attackerMembers.length === 3 ? "3v3" : "5v5");
    const expectedSize = verifiedFormat === "3v3" ? 3 : 5;
    if (attackerMembers.length !== expectedSize || defenderMembers.length !== expectedSize) {
      const error = new Error(`The completed attempt does not match the verified ${verifiedFormat} squad size.`);
      error.status = 409;
      throw error;
    }

    const swgohPlayerId = clean(resolved.player?.swgoh_player_id);
    if (!swgohPlayerId) {
      const error = new Error("The verified owner does not have a canonical SWGOH player ID yet.");
      error.status = 409;
      throw error;
    }
    const eventInstanceId = clean(event?.event_instance_id || resolved.eventInstanceId);
    const battleKey = deterministicKey([
      "verified-owner-war-room",
      eventInstanceId,
      swgohPlayerId,
      resolved.round,
      defense.id,
      attemptIndex,
    ]);
    const sourceRef = `war-room:${assignmentId}:attempt:${attemptIndex + 1}`;
    const importedAt = now().toISOString();
    const dcEvidenceInput = {
      battleKey,
      format: verifiedFormat,
      enemyLeaderBaseId: defenderLeader,
      enemyMembers: defenderMembers,
      defenderDatacronState: defenderDatacronState(defense),
      defenderDatacron: defense.datacron || null,
      counterLeaderBaseId: attackerLeader,
      counterMembers: attackerMembers,
      attackerDatacronState: attackerDatacronState(assignment),
      attackerDatacron: assignment.datacron || null,
      battleOutcome: result,
      banners: attempt.banners == null ? null : Math.max(0, Number(attempt.banners) || 0),
      seasonId: clean(event?.season_id),
      source: "verified-owner-war-room",
      sourceRef,
      observedAt: clean(attempt.at) || importedAt,
      metadata: {
        explicitOwnerConfirmation: true,
        assignmentId,
        defenseId: Number(defense.id),
        round: resolved.round,
        eventInstanceId,
      },
    };

    const existing = await selectOne("gac_battles", {
      select: "id,battle_key,battle_outcome,source,source_ref,imported_at,metadata",
      battle_key: `eq.${battleKey}`,
    });
    if (existing?.id) {
      const datacronEvidenceResult = await archiveDatacronEvidence(dcEvidenceInput);
      return Object.freeze({
        source: "verified-owner-war-room",
        saved: true,
        alreadyVerified: true,
        eventInstanceId,
        round: resolved.round,
        assignmentId,
        attemptIndex,
        datacronEvidence: datacronEvidenceResult,
        battle: Object.freeze({ id: existing.id, battleKey, outcome: clean(existing.battle_outcome), sourceRef: clean(existing.source_ref) }),
      });
    }

    const row = {
      battle_key: battleKey,
      player_id: resolved.player.id,
      swgoh_player_id: swgohPlayerId,
      ally_code: resolved.allyCode,
      event_instance_id: eventInstanceId || null,
      season_id: clean(event?.season_id) || null,
      format: verifiedFormat,
      match_index: Math.max(0, Number(resolved.round) - 1),
      attack_group_index: Math.max(0, Number(defense.squad_slot ?? 0)),
      duel_index: attemptIndex,
      round_number: resolved.round,
      match_id: null,
      opponent_swgoh_player_id: clean(resolved.confirmed?.opponent?.playerId) || null,
      opponent_ally_code: resolved.opponentAllyCode || null,
      opponent_name: clean(resolved.confirmed?.opponent?.name) || null,
      attacker_leader_base_id: attackerLeader,
      attacker_members: attackerMembers,
      defender_leader_base_id: defenderLeader,
      defender_members: defenderMembers,
      battle_outcome: result,
      source: "verified-owner-war-room",
      source_ref: sourceRef,
      source_updated_at: clean(attempt.at) || importedAt,
      imported_at: importedAt,
      metadata: {
        explicitOwnerConfirmation: true,
        confirmedByUserId: resolved.userId,
        verificationMethod: "verified-owner-explicit-battle-confirmation",
        assignmentId,
        defenseId: Number(defense.id),
        attemptIndex,
        banners: dcEvidenceInput.banners,
        attackerDatacronId: clean(attempt.datacronId || assignment?.datacron?.id) || null,
        defenderDatacronId: clean(defense?.datacron?.id) || null,
        attackerDatacronState: dcEvidenceInput.attackerDatacronState,
        defenderDatacronState: dcEvidenceInput.defenderDatacronState,
        zone: clean(defense.zone) || null,
        slot: defense.squad_slot == null ? null : Number(defense.squad_slot),
        coordinateSemantics: "verified-round/defense-slot/war-room-attempt",
        counterEvidenceEligible: true,
      },
    };
    const inserted = asArray(await store.upsert("gac_battles", [row], { onConflict: "battle_key" }));
    const saved = inserted[0] || row;
    const datacronEvidenceResult = await archiveDatacronEvidence(dcEvidenceInput);
    return Object.freeze({
      source: "verified-owner-war-room",
      saved: true,
      alreadyVerified: false,
      eventInstanceId,
      round: resolved.round,
      assignmentId,
      attemptIndex,
      datacronEvidence: datacronEvidenceResult,
      battle: Object.freeze({
        id: saved.id ?? null,
        battleKey,
        outcome: result,
        sourceRef,
        attackerLeaderBaseId: attackerLeader,
        defenderLeaderBaseId: defenderLeader,
        banners: row.metadata.banners,
      }),
    });
  }

  return Object.freeze({ verifyAttempt });
}

export const gacVerifiedBattleService = createGacVerifiedBattleService();

export {
  attackerDatacronState,
  defenderDatacronState,
  deterministicKey,
  normalizedMembers,
  validAttemptIndex,
  validResult,
};
