import { gacFleetBoardService } from "./gac-fleet-board-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) {
  const id = clean(value).split(":")[0].toUpperCase();
  return /^[A-Z0-9_:-]{1,100}$/.test(id) ? id : "";
}
function normalizeIds(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }
function validStatus(value) {
  const status = clean(value).toLowerCase();
  return new Set(["planned", "attempted", "win", "loss", "abandoned"]).has(status) ? status : "";
}
function completedStatus(status) { return ["win", "loss", "abandoned"].includes(status); }
function transitionAllowed(previousInput, nextInput) {
  const previous = validStatus(previousInput) || "planned";
  const next = validStatus(nextInput);
  if (!next) return false;
  if (previous === next) return true;
  if (previous === "planned") return ["attempted", "win", "loss", "abandoned"].includes(next);
  if (previous === "attempted") return ["win", "loss"].includes(next);
  return false;
}
function normalizeAttackFleet(value = {}) {
  const capitalShipBaseId = normalizeBaseId(value.capitalShipBaseId);
  const starters = normalizeIds(value.starters).filter((id) => id !== capitalShipBaseId);
  const reinforcements = normalizeIds(value.reinforcements).filter((id) => id !== capitalShipBaseId && !starters.includes(id));
  if (!capitalShipBaseId) {
    const error = new Error("Select the attacking capital ship before locking a Fleet War Room plan.");
    error.status = 400;
    throw error;
  }
  if (starters.length !== 3) {
    const error = new Error("Confirm exactly three starting ships before locking this fleet counter. Historical fleet member evidence does not prove starter roles.");
    error.status = 400;
    throw error;
  }
  if (reinforcements.length > 4) {
    const error = new Error("A Fleet War Room plan can contain at most four reinforcements.");
    error.status = 400;
    throw error;
  }
  const members = normalizeIds([capitalShipBaseId, ...starters, ...reinforcements]);
  if (members.length !== 4 + reinforcements.length) {
    const error = new Error("Capital ship, starters and reinforcements must be unique fleet units.");
    error.status = 400;
    throw error;
  }
  return Object.freeze({ capitalShipBaseId, starters: Object.freeze(starters), reinforcements: Object.freeze(reinforcements), members: Object.freeze(members) });
}
function sanitizeAttempt(value = {}) {
  const status = validStatus(value.status);
  if (!["win", "loss"].includes(status)) return null;
  try {
    const fleet = normalizeAttackFleet(value);
    return Object.freeze({
      ...fleet,
      status,
      banners: value.banners == null ? null : Math.max(0, Math.floor(Number(value.banners) || 0)),
      at: clean(value.at),
    });
  } catch {
    return null;
  }
}
function sanitizeAttemptLog(value) { return Object.freeze(asArray(value).map(sanitizeAttempt).filter(Boolean).slice(-20)); }
function normalizeAssignment(row, defense = null) {
  if (!row) return null;
  const fleet = normalizeAttackFleet({
    capitalShipBaseId: row.attacker_capital_ship_base_id,
    starters: row.attacker_starters,
    reinforcements: row.attacker_reinforcements,
  });
  return Object.freeze({
    id: row.id ?? null,
    defenseFleetId: Number(row.defense_fleet_id),
    defense: defense ? Object.freeze({
      id: defense.id ?? null,
      capitalShipBaseId: normalizeBaseId(defense.capital_ship_base_id),
      starters: Object.freeze(normalizeIds(defense.starters)),
      reinforcements: Object.freeze(normalizeIds(defense.reinforcements)),
      members: Object.freeze(normalizeIds(defense.members)),
      zone: clean(defense.zone),
      slot: defense.fleet_slot == null ? null : Number(defense.fleet_slot),
    }) : null,
    ...fleet,
    status: validStatus(row.status) || "planned",
    attemptCount: Number(row.attempt_count || 0),
    attemptLog: sanitizeAttemptLog(row.attempt_log),
    banners: row.banners == null ? null : Number(row.banners),
    plannedAt: clean(row.planned_at),
    updatedAt: clean(row.updated_at),
    completedAt: clean(row.completed_at),
    source: clean(row.source || "verified-owner-fleet-war-room"),
    sourceRef: clean(row.source_ref),
  });
}

export function createGacFleetAttackPlanService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const boards = options.boards || gacFleetBoardService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }
  async function resolvedRound(userId, input = {}) { return boards.resolveRound(userId, input); }

  async function assertDefense(resolved, defenseIdInput) {
    const defenseId = Number(defenseIdInput);
    if (!Number.isInteger(defenseId) || defenseId <= 0) {
      const error = new Error("A valid saved enemy fleet defense ID is required.");
      error.status = 400;
      throw error;
    }
    const defense = await selectOne("gac_round_fleets", {
      select: "id,round_id,owner,side,zone,fleet_slot,capital_ship_base_id,starters,reinforcements,members,source",
      id: `eq.${defenseId}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: "eq.opponent",
      side: "eq.defense",
      source: "eq.user-confirmed-current-fleet-board",
    });
    if (!defense?.id) {
      const error = new Error("The selected fleet is not verified current-board evidence for this round.");
      error.status = 404;
      throw error;
    }
    return defense;
  }

  async function ownDefenseReservedIds(resolved) {
    const rows = asArray(await store.select("gac_round_fleets", {
      select: "capital_ship_base_id,starters,reinforcements,members",
      round_id: `eq.${resolved.roundRow.id}`,
      owner: "eq.player",
      side: "eq.defense",
      source: "eq.user-confirmed-current-fleet-board",
      limit: 10,
    }));
    return new Set(rows.flatMap((row) => normalizeIds(row.members?.length ? row.members : [row.capital_ship_base_id, ...asArray(row.starters), ...asArray(row.reinforcements)])));
  }

  async function assertNoUsedOverlap(resolved, defenseFleetId, members, existingAssignmentId = null) {
    const assignments = asArray(await store.select("gac_fleet_attack_plan_assignments", {
      select: "id,defense_fleet_id,attacker_members,status,attempt_log",
      round_id: `eq.${resolved.roundRow.id}`,
      limit: 20,
    }));
    const requested = new Set(normalizeIds(members));
    const used = await ownDefenseReservedIds(resolved);
    for (const assignment of assignments) {
      for (const attempt of sanitizeAttemptLog(assignment.attempt_log)) {
        for (const id of attempt.members) used.add(id);
      }
      const isCurrent = existingAssignmentId && Number(assignment.id) === Number(existingAssignmentId);
      if (!isCurrent && ["planned", "attempted"].includes(validStatus(assignment.status))) {
        for (const id of normalizeIds(assignment.attacker_members)) used.add(id);
      }
      if (!isCurrent && Number(assignment.defense_fleet_id) === Number(defenseFleetId)) continue;
    }
    const overlap = [...requested].filter((id) => used.has(id));
    if (overlap.length) {
      const error = new Error(`Those fleet units are already reserved on defense, allocated, or consumed in this round: ${overlap.join(", ")}.`);
      error.status = 409;
      throw error;
    }
  }

  async function saveAssignment(userId, input = {}) {
    const resolved = await resolvedRound(userId, input);
    const defense = await assertDefense(resolved, input.defenseFleetId);
    const fleet = normalizeAttackFleet(input);
    const existing = await selectOne("gac_fleet_attack_plan_assignments", {
      select: "id,round_id,defense_fleet_id,status,attempt_count,attempt_log,planned_at",
      round_id: `eq.${resolved.roundRow.id}`,
      defense_fleet_id: `eq.${defense.id}`,
    });
    const existingStatus = validStatus(existing?.status);
    if (existingStatus === "attempted") {
      const error = new Error("This fleet defense already has an attempt in progress. Record the win or loss before replanning it.");
      error.status = 409;
      throw error;
    }
    if (existingStatus === "win") {
      const error = new Error("This fleet defense is already cleared in the current Fleet War Room.");
      error.status = 409;
      throw error;
    }
    await assertNoUsedOverlap(resolved, defense.id, fleet.members, existing?.id || null);
    const timestamp = now().toISOString();
    const row = {
      round_id: resolved.roundRow.id,
      defense_fleet_id: defense.id,
      attacker_capital_ship_base_id: fleet.capitalShipBaseId,
      attacker_starters: fleet.starters,
      attacker_reinforcements: fleet.reinforcements,
      attacker_members: fleet.members,
      status: "planned",
      attempt_count: Number(existing?.attempt_count || 0),
      attempt_log: sanitizeAttemptLog(existing?.attempt_log),
      banners: null,
      source: "verified-owner-fleet-war-room",
      source_ref: clean(input.sourceRef || "gac-command-center-fleet-war-room"),
      planned_at: clean(existing?.planned_at) || timestamp,
      updated_at: timestamp,
      completed_at: null,
      metadata: {
        allyCode: resolved.allyCode,
        opponentAllyCode: resolved.opponentAllyCode,
        eventInstanceId: resolved.eventInstanceId,
        round: resolved.round,
        verificationMethod: "verified-owner-saved-fleet-plan",
        rolesConfirmedByUser: true,
        datacronApplicable: false,
      },
    };
    const saved = asArray(await store.upsert("gac_fleet_attack_plan_assignments", [row], { onConflict: "round_id,defense_fleet_id" }));
    return Object.freeze({
      source: "verified-owner-fleet-war-room",
      saved: true,
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      assignment: normalizeAssignment(saved[0] || { ...row, id: existing?.id || null }, defense),
    });
  }

  async function updateStatus(userId, input = {}) {
    const resolved = await resolvedRound(userId, input);
    const assignmentId = Number(input.id);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      const error = new Error("A valid Fleet War Room assignment ID is required.");
      error.status = 400;
      throw error;
    }
    const status = validStatus(input.status);
    if (!status) {
      const error = new Error("Fleet War Room status must be planned, attempted, win, loss, or abandoned.");
      error.status = 400;
      throw error;
    }
    const assignment = await selectOne("gac_fleet_attack_plan_assignments", {
      select: "id,round_id,defense_fleet_id,attacker_capital_ship_base_id,attacker_starters,attacker_reinforcements,attacker_members,status,attempt_count,attempt_log,banners,planned_at,completed_at,source,source_ref",
      id: `eq.${assignmentId}`,
      round_id: `eq.${resolved.roundRow.id}`,
    });
    if (!assignment?.id) {
      const error = new Error("That fleet assignment does not belong to the verified current round.");
      error.status = 404;
      throw error;
    }
    const previousStatus = validStatus(assignment.status) || "planned";
    if (!transitionAllowed(previousStatus, status)) {
      const error = new Error(`Invalid Fleet War Room transition: ${previousStatus} → ${status}.`);
      error.status = 409;
      throw error;
    }
    const fleet = normalizeAttackFleet({
      capitalShipBaseId: assignment.attacker_capital_ship_base_id,
      starters: assignment.attacker_starters,
      reinforcements: assignment.attacker_reinforcements,
    });
    const timestamp = now().toISOString();
    const startsAttempt = status === "attempted" && previousStatus === "planned";
    const directResult = ["win", "loss"].includes(status) && previousStatus === "planned";
    const nextAttempts = Number(assignment.attempt_count || 0) + (startsAttempt || directResult ? 1 : 0);
    const banners = input.banners === null || input.banners === undefined || input.banners === ""
      ? null
      : Math.max(0, Math.floor(Number(input.banners) || 0));
    const attemptLog = [...sanitizeAttemptLog(assignment.attempt_log)];
    const closesAttempt = ["win", "loss"].includes(status) && !["win", "loss"].includes(previousStatus);
    if (closesAttempt) attemptLog.push(Object.freeze({ ...fleet, status, banners, at: timestamp }));
    const completedAt = completedStatus(status) ? clean(assignment.completed_at) || timestamp : null;
    const updated = asArray(await store.update("gac_fleet_attack_plan_assignments", {
      status,
      attempt_count: Math.max(nextAttempts, attemptLog.length),
      attempt_log: attemptLog.slice(-20),
      banners,
      updated_at: timestamp,
      completed_at: completedAt,
    }, { id: `eq.${assignmentId}`, round_id: `eq.${resolved.roundRow.id}` }));
    const defense = await assertDefense(resolved, assignment.defense_fleet_id);
    return Object.freeze({
      source: "verified-owner-fleet-war-room",
      updated: true,
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      assignment: normalizeAssignment(updated[0] || {
        ...assignment,
        status,
        attempt_count: Math.max(nextAttempts, attemptLog.length),
        attempt_log: attemptLog,
        banners,
        updated_at: timestamp,
        completed_at: completedAt,
      }, defense),
    });
  }

  async function getAssignments(userId, input = {}) {
    const resolved = await resolvedRound(userId, input);
    const rows = asArray(await store.select("gac_fleet_attack_plan_assignments", {
      select: "id,round_id,defense_fleet_id,attacker_capital_ship_base_id,attacker_starters,attacker_reinforcements,attacker_members,status,attempt_count,attempt_log,banners,source,source_ref,planned_at,updated_at,completed_at,metadata",
      round_id: `eq.${resolved.roundRow.id}`,
      order: "updated_at.asc",
      limit: 20,
    }));
    const defenses = new Map();
    for (const id of [...new Set(rows.map((row) => Number(row.defense_fleet_id)).filter((id) => Number.isInteger(id) && id > 0))]) {
      const defense = await assertDefense(resolved, id).catch(() => null);
      if (defense) defenses.set(id, defense);
    }
    return Object.freeze({
      source: "verified-owner-fleet-war-room",
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      opponent: Object.freeze({ allyCode: resolved.opponentAllyCode, name: clean(resolved.confirmed?.opponent?.name) }),
      assignments: Object.freeze(rows.map((row) => normalizeAssignment(row, defenses.get(Number(row.defense_fleet_id)))).filter(Boolean)),
    });
  }

  return Object.freeze({ assertDefense, assertNoUsedOverlap, getAssignments, ownDefenseReservedIds, saveAssignment, updateStatus });
}

export const gacFleetAttackPlanService = createGacFleetAttackPlanService();

export {
  completedStatus,
  normalizeAttackFleet,
  normalizeAssignment,
  normalizeBaseId,
  normalizeIds,
  sanitizeAttempt,
  sanitizeAttemptLog,
  transitionAllowed,
  validStatus,
};
