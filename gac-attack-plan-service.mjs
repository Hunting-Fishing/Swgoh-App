import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) {
  const id = clean(value).split(":")[0].toUpperCase();
  return /^[A-Z0-9_:-]{1,100}$/.test(id) ? id : "";
}
function normalizedMembers(values, size) {
  const members = [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))];
  if (![3, 5].includes(size) || members.length !== size) {
    const error = new Error(`Select exactly ${size === 3 ? 3 : 5} attackers for this GAC plan.`);
    error.status = 400;
    throw error;
  }
  return members;
}
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
function sanitizeDatacron(value) {
  if (!value || typeof value !== "object" || !clean(value.id)) return null;
  return Object.freeze({
    id: clean(value.id),
    setId: value.setId ?? null,
    templateId: clean(value.templateId),
    level: Number.isFinite(Number(value.level)) ? Number(value.level) : asArray(value.affixes).length,
    affixes: Object.freeze(asArray(value.affixes).slice(0, 12).map((affix) => Object.freeze({
      tier: Number.isFinite(Number(affix?.tier)) ? Number(affix.tier) : null,
      abilityId: clean(affix?.abilityId),
      abilityName: clean(affix?.abilityName).slice(0, 200),
      abilityDescription: clean(affix?.abilityDescription).slice(0, 4000),
      abilityTextResolved: affix?.abilityTextResolved === true,
      targetRule: clean(affix?.targetRule),
      requiredRelicTier: Number.isFinite(Number(affix?.requiredRelicTier)) ? Number(affix.requiredRelicTier) : null,
    }))),
  });
}
function sanitizeAttempt(value = {}) {
  const status = validStatus(value?.status);
  if (!["win", "loss"].includes(status)) return null;
  return Object.freeze({
    members: Object.freeze(asArray(value?.members).map(normalizeBaseId).filter(Boolean)),
    leaderBaseId: normalizeBaseId(value?.leaderBaseId),
    datacronId: clean(value?.datacronId),
    status,
    banners: value?.banners == null ? null : Math.max(0, Math.floor(Number(value.banners) || 0)),
    at: clean(value?.at),
  });
}
function sanitizeAttemptLog(value) {
  return Object.freeze(asArray(value).map(sanitizeAttempt).filter(Boolean).slice(-20));
}

export function createGacAttackPlanService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const boards = options.boards || gacBoardObservationService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function resolvedRound(userId, input = {}) {
    return boards.resolveRound(userId, input);
  }

  async function assertDefense(resolved, defenseIdInput) {
    const defenseId = Number(defenseIdInput);
    if (!Number.isInteger(defenseId) || defenseId <= 0) {
      const error = new Error("A valid saved enemy defense ID is required.");
      error.status = 400;
      throw error;
    }
    const defense = await selectOne("gac_round_squads", {
      select: "id,round_id,owner,side,leader_base_id,members,datacron,zone,squad_slot,source",
      id: `eq.${defenseId}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: "eq.opponent",
      side: "eq.defense",
      source: "eq.user-confirmed-current-board",
    });
    if (!defense?.id) {
      const error = new Error("The selected defense is not verified current-board evidence for this round.");
      error.status = 404;
      throw error;
    }
    return defense;
  }

  async function assertNoUsedOverlap(resolved, defenseId, members, existingAssignmentId = null) {
    const assignments = asArray(await store.select("gac_attack_plan_assignments", {
      select: "id,defense_squad_id,attacker_members,status,attempt_log",
      round_id: `eq.${resolved.roundRow.id}`,
      limit: 100,
    }));
    const requested = new Set(members);
    const used = new Set();
    for (const assignment of assignments) {
      for (const attempt of sanitizeAttemptLog(assignment.attempt_log)) {
        for (const id of attempt.members) used.add(id);
      }
      const isCurrent = existingAssignmentId && Number(assignment.id) === Number(existingAssignmentId);
      if (!isCurrent && ["planned", "attempted"].includes(validStatus(assignment.status))) {
        for (const id of asArray(assignment.attacker_members).map(normalizeBaseId).filter(Boolean)) used.add(id);
      }
      if (!isCurrent && Number(assignment.defense_squad_id) === Number(defenseId)) continue;
    }
    const overlap = [...requested].filter((id) => used.has(id));
    if (overlap.length) {
      const error = new Error(`Those attackers are already reserved or consumed in this round: ${overlap.join(", ")}.`);
      error.status = 409;
      throw error;
    }
  }

  async function saveAssignment(userId, input = {}) {
    const resolved = await resolvedRound(userId, input);
    const defense = await assertDefense(resolved, input.defenseId);
    const size = asArray(defense.members).length === 3 ? 3 : 5;
    const members = normalizedMembers(input.members, size);
    const leaderBaseId = normalizeBaseId(input.leaderBaseId);
    if (!leaderBaseId || !members.includes(leaderBaseId)) {
      const error = new Error("The planned counter leader must be one of the selected attackers.");
      error.status = 400;
      throw error;
    }
    const existing = await selectOne("gac_attack_plan_assignments", {
      select: "id,round_id,defense_squad_id,status,attempt_count,attempt_log,planned_at",
      round_id: `eq.${resolved.roundRow.id}`,
      defense_squad_id: `eq.${defense.id}`,
    });
    const existingStatus = validStatus(existing?.status);
    if (existingStatus === "attempted") {
      const error = new Error("This defense already has an attempt in progress. Record the win or loss before replanning it.");
      error.status = 409;
      throw error;
    }
    if (existingStatus === "win") {
      const error = new Error("This defense is already cleared in the current War Room and cannot be replanned.");
      error.status = 409;
      throw error;
    }
    await assertNoUsedOverlap(resolved, defense.id, members, existing?.id || null);

    const timestamp = now().toISOString();
    const row = {
      round_id: resolved.roundRow.id,
      defense_squad_id: defense.id,
      attacker_leader_base_id: leaderBaseId,
      attacker_members: members,
      datacron: sanitizeDatacron(input.datacron),
      status: "planned",
      attempt_count: Number(existing?.attempt_count || 0),
      attempt_log: sanitizeAttemptLog(existing?.attempt_log),
      banners: null,
      source: "verified-owner-war-room",
      source_ref: clean(input.sourceRef || "gac-command-center-war-room"),
      planned_at: clean(existing?.planned_at) || timestamp,
      updated_at: timestamp,
      completed_at: null,
      metadata: {
        allyCode: resolved.allyCode,
        opponentAllyCode: resolved.opponentAllyCode,
        eventInstanceId: resolved.eventInstanceId,
        round: resolved.round,
        size,
        verificationMethod: "verified-owner-saved-board-plan",
      },
    };
    const saved = asArray(await store.upsert("gac_attack_plan_assignments", [row], {
      onConflict: "round_id,defense_squad_id",
    }));
    return Object.freeze({
      source: "verified-owner-war-room",
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
      const error = new Error("A valid war-room assignment ID is required.");
      error.status = 400;
      throw error;
    }
    const status = validStatus(input.status);
    if (!status) {
      const error = new Error("War-room status must be planned, attempted, win, loss, or abandoned.");
      error.status = 400;
      throw error;
    }
    const assignment = await selectOne("gac_attack_plan_assignments", {
      select: "id,round_id,defense_squad_id,attacker_leader_base_id,attacker_members,datacron,status,attempt_count,attempt_log,banners,planned_at,completed_at",
      id: `eq.${assignmentId}`,
      round_id: `eq.${resolved.roundRow.id}`,
    });
    if (!assignment?.id) {
      const error = new Error("That war-room assignment does not belong to the verified current round.");
      error.status = 404;
      throw error;
    }
    const previousStatus = validStatus(assignment.status) || "planned";
    if (!transitionAllowed(previousStatus, status)) {
      const error = new Error(`Invalid War Room transition: ${previousStatus} → ${status}. Replan completed/released defenses through a new counter lock instead.`);
      error.status = 409;
      throw error;
    }

    const timestamp = now().toISOString();
    const startsAttempt = status === "attempted" && previousStatus === "planned";
    const directResult = ["win", "loss"].includes(status) && previousStatus === "planned";
    const nextAttempts = Number(assignment.attempt_count || 0) + (startsAttempt || directResult ? 1 : 0);
    const banners = input.banners === null || input.banners === undefined || input.banners === ""
      ? null
      : Math.max(0, Math.floor(Number(input.banners) || 0));
    const attemptLog = [...sanitizeAttemptLog(assignment.attempt_log)];
    const closesAttempt = ["win", "loss"].includes(status) && !["win", "loss"].includes(previousStatus);
    if (closesAttempt) {
      attemptLog.push(Object.freeze({
        members: Object.freeze(asArray(assignment.attacker_members).map(normalizeBaseId).filter(Boolean)),
        leaderBaseId: normalizeBaseId(assignment.attacker_leader_base_id),
        datacronId: clean(assignment?.datacron?.id),
        status,
        banners,
        at: timestamp,
      }));
    }
    const completedAt = completedStatus(status)
      ? clean(assignment.completed_at) || timestamp
      : null;
    const updated = asArray(await store.update("gac_attack_plan_assignments", {
      status,
      attempt_count: Math.max(nextAttempts, attemptLog.length),
      attempt_log: attemptLog.slice(-20),
      banners,
      updated_at: timestamp,
      completed_at: completedAt,
    }, {
      id: `eq.${assignmentId}`,
      round_id: `eq.${resolved.roundRow.id}`,
    }));
    const defense = await assertDefense(resolved, assignment.defense_squad_id);
    return Object.freeze({
      source: "verified-owner-war-room",
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
    const rows = asArray(await store.select("gac_attack_plan_assignments", {
      select: "id,round_id,defense_squad_id,attacker_leader_base_id,attacker_members,datacron,status,attempt_count,attempt_log,banners,source,source_ref,planned_at,updated_at,completed_at,metadata",
      round_id: `eq.${resolved.roundRow.id}`,
      order: "updated_at.asc",
      limit: 100,
    }));
    const defenseIds = [...new Set(rows.map((row) => Number(row.defense_squad_id)).filter((id) => Number.isInteger(id) && id > 0))];
    const defenses = new Map();
    for (const id of defenseIds) {
      const defense = await assertDefense(resolved, id).catch(() => null);
      if (defense) defenses.set(id, defense);
    }
    return Object.freeze({
      source: "verified-owner-war-room",
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      opponent: Object.freeze({ allyCode: resolved.opponentAllyCode, name: clean(resolved.confirmed?.opponent?.name) }),
      assignments: Object.freeze(rows.map((row) => normalizeAssignment(row, defenses.get(Number(row.defense_squad_id)))).filter(Boolean)),
    });
  }

  function normalizeAssignment(row, defense = null) {
    if (!row) return null;
    return Object.freeze({
      id: row.id ?? null,
      defenseId: Number(row.defense_squad_id),
      defense: defense ? Object.freeze({
        leaderBaseId: normalizeBaseId(defense.leader_base_id),
        members: Object.freeze(asArray(defense.members).map(normalizeBaseId).filter(Boolean)),
        zone: clean(defense.zone),
        slot: defense.squad_slot == null ? null : Number(defense.squad_slot),
      }) : null,
      leaderBaseId: normalizeBaseId(row.attacker_leader_base_id),
      members: Object.freeze(asArray(row.attacker_members).map(normalizeBaseId).filter(Boolean)),
      datacron: sanitizeDatacron(row.datacron),
      status: validStatus(row.status) || "planned",
      attemptCount: Number(row.attempt_count || 0),
      attemptLog: sanitizeAttemptLog(row.attempt_log),
      banners: row.banners == null ? null : Number(row.banners),
      plannedAt: clean(row.planned_at),
      updatedAt: clean(row.updated_at),
      completedAt: clean(row.completed_at),
      source: clean(row.source || "verified-owner-war-room"),
    });
  }

  return Object.freeze({
    assertDefense,
    assertNoUsedOverlap,
    getAssignments,
    saveAssignment,
    updateStatus,
  });
}

export const gacAttackPlanService = createGacAttackPlanService();

export {
  completedStatus,
  normalizeBaseId,
  normalizedMembers,
  sanitizeAttempt,
  sanitizeAttemptLog,
  sanitizeDatacron,
  transitionAllowed,
  validStatus,
};
