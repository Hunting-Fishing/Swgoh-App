import crypto from "node:crypto";
import { gacFleetBoardService } from "./gac-fleet-board-service.mjs";
import { normalizeAttackFleet, sanitizeAttemptLog } from "./gac-fleet-attack-plan-service.mjs";
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
function deterministicKey(parts) { return crypto.createHash("sha256").update(parts.map(clean).join("|")).digest("hex"); }
function normalizedMembers(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }

export function createGacFleetVerifiedBattleService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const boards = options.boards || gacFleetBoardService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function verifyAttempt(userId, input = {}) {
    if (input.confirm !== true) {
      const error = new Error("Explicit owner confirmation is required before a Fleet War Room result can become battle evidence.");
      error.status = 400;
      throw error;
    }
    const resolved = await boards.resolveRound(userId, input);
    const assignmentId = Number(input.assignmentId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      const error = new Error("A valid Fleet War Room assignment ID is required.");
      error.status = 400;
      throw error;
    }
    const assignment = await selectOne("gac_fleet_attack_plan_assignments", {
      select: "id,round_id,defense_fleet_id,attempt_log,source",
      id: `eq.${assignmentId}`,
      round_id: `eq.${resolved.roundRow.id}`,
      source: "eq.verified-owner-fleet-war-room",
    });
    if (!assignment?.id) {
      const error = new Error("That Fleet War Room assignment is not part of the verified current round.");
      error.status = 404;
      throw error;
    }
    const attempts = sanitizeAttemptLog(assignment.attempt_log);
    const attemptIndex = validAttemptIndex(input.attemptIndex, attempts.length);
    if (attemptIndex === null) {
      const error = new Error("Select the completed fleet attempt you are explicitly confirming.");
      error.status = 400;
      throw error;
    }
    const attempt = attempts[attemptIndex] || {};
    const result = validResult(attempt.status);
    if (!result) {
      const error = new Error("Only a completed Fleet War Room Win or Loss can become battle evidence.");
      error.status = 409;
      throw error;
    }
    const attacker = normalizeAttackFleet(attempt);
    const defense = await selectOne("gac_round_fleets", {
      select: "id,round_id,capital_ship_base_id,starters,reinforcements,members,zone,fleet_slot,owner,side,source",
      id: `eq.${Number(assignment.defense_fleet_id)}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: "eq.opponent",
      side: "eq.defense",
      source: "eq.user-confirmed-current-fleet-board",
    });
    if (!defense?.id) {
      const error = new Error("The verified enemy fleet snapshot for this attempt is unavailable.");
      error.status = 409;
      throw error;
    }
    const defenderCapital = normalizeBaseId(defense.capital_ship_base_id);
    const defenderStarters = normalizedMembers(defense.starters).filter((id) => id !== defenderCapital);
    const defenderReinforcements = normalizedMembers(defense.reinforcements).filter((id) => id !== defenderCapital && !defenderStarters.includes(id));
    const defenderMembers = normalizedMembers([defenderCapital, ...defenderStarters, ...defenderReinforcements]);
    if (!defenderCapital || defenderStarters.length !== 3 || defenderReinforcements.length > 4 || defenderMembers.length !== 4 + defenderReinforcements.length) {
      const error = new Error("The saved enemy fleet snapshot is incomplete and cannot become battle evidence.");
      error.status = 409;
      throw error;
    }
    const event = await selectOne("gac_events", { select: "id,event_instance_id,season_id,format", id: `eq.${resolved.event.id}` });
    const format = clean(event?.format).toLowerCase();
    if (!["3v3", "5v5"].includes(format)) {
      const error = new Error("The current GAC event format is not verified for fleet battle archival.");
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
    const battleKey = deterministicKey(["verified-owner-fleet-war-room", eventInstanceId, swgohPlayerId, resolved.round, defense.id, attemptIndex]);
    const existing = await selectOne("gac_battles", { select: "id,battle_key,battle_outcome,source,source_ref,imported_at,metadata", battle_key: `eq.${battleKey}` });
    if (existing?.id) {
      return Object.freeze({
        source: "verified-owner-fleet-war-room",
        saved: true,
        alreadyVerified: true,
        eventInstanceId,
        round: resolved.round,
        assignmentId,
        attemptIndex,
        battle: Object.freeze({ id: existing.id, battleKey, outcome: clean(existing.battle_outcome), sourceRef: clean(existing.source_ref) }),
      });
    }
    const sourceRef = `fleet-war-room:${assignmentId}:attempt:${attemptIndex + 1}`;
    const importedAt = now().toISOString();
    const row = {
      battle_key: battleKey,
      player_id: resolved.player.id,
      swgoh_player_id: swgohPlayerId,
      ally_code: resolved.allyCode,
      event_instance_id: eventInstanceId || null,
      season_id: clean(event?.season_id) || null,
      format,
      match_index: Math.max(0, Number(resolved.round) - 1),
      attack_group_index: Math.max(0, Number(defense.fleet_slot ?? 0)),
      duel_index: attemptIndex,
      round_number: resolved.round,
      match_id: null,
      opponent_swgoh_player_id: clean(resolved.confirmed?.opponent?.playerId) || null,
      opponent_ally_code: resolved.opponentAllyCode || null,
      opponent_name: clean(resolved.confirmed?.opponent?.name) || null,
      attacker_leader_base_id: attacker.capitalShipBaseId,
      attacker_members: attacker.members,
      defender_leader_base_id: defenderCapital,
      defender_members: defenderMembers,
      battle_outcome: result,
      source: "verified-owner-fleet-war-room",
      source_ref: sourceRef,
      source_updated_at: clean(attempt.at) || importedAt,
      imported_at: importedAt,
      metadata: {
        battleType: "fleet",
        explicitOwnerConfirmation: true,
        confirmedByUserId: resolved.userId,
        verificationMethod: "verified-owner-explicit-fleet-battle-confirmation",
        assignmentId,
        defenseFleetId: Number(defense.id),
        attemptIndex,
        banners: attempt.banners == null ? null : Math.max(0, Number(attempt.banners) || 0),
        zone: clean(defense.zone) || "BACK-TOP",
        slot: defense.fleet_slot == null ? null : Number(defense.fleet_slot),
        attackerRoles: {
          capitalShipBaseId: attacker.capitalShipBaseId,
          starters: attacker.starters,
          reinforcements: attacker.reinforcements,
          rolesConfirmedByUser: true,
        },
        defenderRoles: {
          capitalShipBaseId: defenderCapital,
          starters: defenderStarters,
          reinforcements: defenderReinforcements,
          rolesConfirmedByUser: true,
        },
        coordinateSemantics: "verified-round/fleet-slot/fleet-war-room-attempt",
        counterEvidenceEligible: true,
        datacronApplicable: false,
      },
    };
    const inserted = asArray(await store.upsert("gac_battles", [row], { onConflict: "battle_key" }));
    const saved = inserted[0] || row;
    return Object.freeze({
      source: "verified-owner-fleet-war-room",
      saved: true,
      alreadyVerified: false,
      eventInstanceId,
      round: resolved.round,
      assignmentId,
      attemptIndex,
      battle: Object.freeze({
        id: saved.id ?? null,
        battleKey,
        outcome: result,
        sourceRef,
        attackerCapitalShipBaseId: attacker.capitalShipBaseId,
        defenderCapitalShipBaseId: defenderCapital,
        banners: row.metadata.banners,
      }),
    });
  }

  return Object.freeze({ verifyAttempt });
}

export const gacFleetVerifiedBattleService = createGacFleetVerifiedBattleService();

export { deterministicKey, normalizedMembers, validAttemptIndex, validResult };
