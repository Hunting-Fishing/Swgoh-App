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

  async function assertNoActiveOverlap(resolved, defenseId, members, excludeAssignmentId = null) {
    const active = asArray(await store.select("gac_attack_plan_assignments", {
      select: "id,defense_squad_id,attacker_members,status",
      round_id: `eq.${resolved.roundRow.id}`,
      status: "in.(planned,attempted)",
      limit: 100,
    }));
    const requested = new Set(members);
    const conflict = active.find((assignment) => {
      if (excludeAssignmentId && Number(assignment.id) === Number(excludeAssignmentId)) return false;
      if (Number(assignment.defense_squad_id) === Number(defenseId)) return false;
      return asArray(assignment.attacker_members).some((id) => requested.has(normalizeBaseId(id)));
    });
    if (conflict) {
      const overlap = asArray(conflict.attacker_members).map(normalizeBaseId).filter((id) => requested.has(id));
      const error = new Error(`Those attackers are already reserved in another active war-room plan: ${overlap.join(", ")}.`);
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
      select: "id,round_id,defense_squad_id,status",
      round_id: `eq.${resolved.roundRow.id}`,
      defense_squad_id: `eq.${defense.id}`,
    });
    await assertNoActiveOverlap(resolved, defense.id, members, existing?.id || null);

    const timestamp = now().toISOString();
    const row = {
      round_id: resolved.roundRow.id,
      defense_squad_id: defense.id,
      attacker_leader_base_id: leaderBaseId,
      attacker_members: members,
      datacron: sanitizeDatacron(input.datacron),
      status: "planned",
      attempt_count: 0,
      banners: null,
      source: "verified-owner-war-room",
      source_ref: clean(input.sourceRef || "gac-command-center-war-room"),
      planned_at: existing?.id ? undefined : timestamp,
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
    Object.keys(row).forEach((key) => row[key] === undefined && delete row[key]);
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
      select: "id,round_id,defense_squad_id,attacker_members,status,attempt_count",
      id: `eq.${assignmentId}`,
      round_id: `eq.${resolved.roundRow.id}`,
    });
    if (!assignment?.id) {
      const error = new Error("That war-room assignment does not belong to the verified current round.");
      error.status = 404;
      throw error;
    }
    const timestamp = now().toISOString();
    const nextAttempts = status === "attempted" || status === "win" || status === "loss"
      ? Math.max(Number(assignment.attempt_count || 0) + (assignment.status === "planned" || assignment.status === "attempted" ? 1 : 0), 1)
      : Number(assignment.attempt_count || 0);
    const banners = input.banners === null || input.banners === undefined || input.banners === ""
      ? null
      : Math.max(0, Math.floor(Number(input.banners) || 0));
    const updated = asArray(await store.update("gac_attack_plan_assignments", {
      status,
      attempt_count: nextAttempts,
      banners,
      updated_at: timestamp,
      completed_at: completedStatus(status) ? timestamp : null,
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
      assignment: normalizeAssignment(updated[0] || { ...assignment, status, attempt_count: nextAttempts, banners, updated_at: timestamp }, defense),
    });
  }

  async function getAssignments(userId, input = {}) {
    const resolved = await resolvedRound(userId, input);
    const rows = asArray(await store.select("gac_attack_plan_assignments", {
      select: "id,round_id,defense_squad_id,attacker_leader_base_id,attacker_members,datacron,status,attempt_count,banners,source,source_ref,planned_at,updated_at,completed_at,metadata",
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
      banners: row.banners == null ? null : Number(row.banners),
      plannedAt: clean(row.planned_at),
      updatedAt: clean(row.updated_at),
      completedAt: clean(row.completed_at),
      source: clean(row.source || "verified-owner-war-room"),
    });
  }

  return Object.freeze({
    assertDefense,
    assertNoActiveOverlap,
    getAssignments,
    saveAssignment,
    updateStatus,
  });
}

export const gacAttackPlanService = createGacAttackPlanService();

export { completedStatus, normalizeBaseId, normalizedMembers, sanitizeDatacron, validStatus };
