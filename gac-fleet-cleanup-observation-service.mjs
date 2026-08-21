import { gacFleetBoardService } from "./gac-fleet-board-service.mjs";
import { sanitizeAttemptLog } from "./gac-fleet-attack-plan-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) {
  const id = clean(value).split(":")[0].toUpperCase();
  return /^[A-Z0-9_:-]{1,100}$/.test(id) ? id : "";
}
function normalizeIds(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }
function validAttemptIndex(value, length) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < length ? index : null;
}
function validObservedStatus(value) {
  const status = clean(value).toLowerCase();
  return ["unknown", "alive", "destroyed"].includes(status) ? status : "unknown";
}
function optionalPercent(value, label = "Observed percentage") {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    const error = new Error(`${label} must be a number from 0 to 100 when explicitly entered.`);
    error.status = 400;
    throw error;
  }
  return Math.round(parsed * 10) / 10;
}
function boundedText(value, max = 500) { return clean(value).slice(0, max); }
function roleFor(baseId, defense = {}) {
  const id = normalizeBaseId(baseId);
  const capital = normalizeBaseId(defense.capital_ship_base_id);
  if (id && id === capital) return "capital";
  if (normalizeIds(defense.starters).includes(id)) return "starter";
  if (normalizeIds(defense.reinforcements).includes(id)) return "reinforcement";
  return "unknown";
}
function normalizeObservedUnit(value = {}, defense = {}) {
  const baseId = normalizeBaseId(value.baseId || value.base_id);
  const allowed = new Set(normalizeIds(defense.members?.length
    ? defense.members
    : [defense.capital_ship_base_id, ...asArray(defense.starters), ...asArray(defense.reinforcements)]));
  if (!baseId || !allowed.has(baseId)) {
    const error = new Error("Cleanup observations may only reference ships from the verified saved enemy fleet.");
    error.status = 400;
    throw error;
  }
  const status = validObservedStatus(value.status);
  const healthPct = optionalPercent(value.healthPct ?? value.health_pct, "Observed health");
  const protectionPct = optionalPercent(value.protectionPct ?? value.protection_pct, "Observed protection");
  const turnMeterPct = optionalPercent(value.turnMeterPct ?? value.turn_meter_pct, "Observed turn meter");
  const cooldownNotes = boundedText(value.cooldownNotes ?? value.cooldown_notes, 500);
  const statusNotes = boundedText(value.statusNotes ?? value.status_notes, 500);
  if (status !== "alive" && [healthPct, protectionPct, turnMeterPct].some((entry) => entry !== null)) {
    const error = new Error("Health, protection, and turn meter may only be entered for a ship explicitly observed alive after the loss.");
    error.status = 400;
    throw error;
  }
  if (status !== "alive" && cooldownNotes) {
    const error = new Error("Cooldown notes may only be entered for a ship explicitly observed alive after the loss.");
    error.status = 400;
    throw error;
  }
  return Object.freeze({
    baseId,
    role: roleFor(baseId, defense),
    status,
    healthPct,
    protectionPct,
    turnMeterPct,
    cooldownNotes,
    statusNotes,
    telemetryObserved: Object.freeze({
      health: healthPct !== null,
      protection: protectionPct !== null,
      turnMeter: turnMeterPct !== null,
      cooldowns: Boolean(cooldownNotes),
    }),
  });
}
function normalizeObservationUnits(values, defense = {}) {
  const originalMembers = normalizeIds(defense.members?.length
    ? defense.members
    : [defense.capital_ship_base_id, ...asArray(defense.starters), ...asArray(defense.reinforcements)]);
  const submitted = new Map();
  for (const value of asArray(values)) {
    const row = normalizeObservedUnit(value, defense);
    if (submitted.has(row.baseId)) {
      const error = new Error(`Cleanup state for ${row.baseId} was submitted more than once.`);
      error.status = 400;
      throw error;
    }
    submitted.set(row.baseId, row);
  }
  const rows = originalMembers.map((baseId) => submitted.get(baseId) || Object.freeze({
    baseId,
    role: roleFor(baseId, defense),
    status: "unknown",
    healthPct: null,
    protectionPct: null,
    turnMeterPct: null,
    cooldownNotes: "",
    statusNotes: "",
    telemetryObserved: Object.freeze({ health: false, protection: false, turnMeter: false, cooldowns: false }),
  }));
  if (!rows.some((row) => row.status === "alive" || row.status === "destroyed")) {
    const error = new Error("Confirm at least one enemy ship as Alive or Destroyed before saving a post-loss cleanup observation.");
    error.status = 400;
    throw error;
  }
  return Object.freeze(rows);
}
function normalizeStoredObservation(row = {}) {
  return Object.freeze({
    id: row.id ?? null,
    assignmentId: Number(row.assignment_id),
    defenseFleetId: Number(row.defense_fleet_id),
    attemptIndex: Number(row.attempt_index),
    revision: Number(row.revision),
    units: Object.freeze(asArray(row.observed_units).map((unit) => Object.freeze({ ...unit }))),
    notes: clean(row.notes),
    source: clean(row.source),
    sourceRef: clean(row.source_ref),
    observedAt: clean(row.observed_at),
    metadata: row.metadata && typeof row.metadata === "object" ? Object.freeze({ ...row.metadata }) : Object.freeze({}),
  });
}
function latestObservations(rows = []) {
  const latest = new Map();
  for (const row of asArray(rows)) {
    const normalized = normalizeStoredObservation(row);
    const key = `${normalized.assignmentId}:${normalized.attemptIndex}`;
    const current = latest.get(key);
    if (!current || normalized.revision > current.revision) latest.set(key, normalized);
  }
  return Object.freeze([...latest.values()].sort((a, b) => a.assignmentId - b.assignmentId || a.attemptIndex - b.attemptIndex));
}

export function createGacFleetCleanupObservationService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const boards = options.boards || gacFleetBoardService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function resolveLossAttempt(userId, input = {}) {
    const resolved = await boards.resolveRound(userId, input);
    const assignmentId = Number(input.assignmentId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      const error = new Error("A valid Fleet War Room assignment ID is required for cleanup-state capture.");
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
      const error = new Error("That fleet assignment does not belong to the verified current round.");
      error.status = 404;
      throw error;
    }
    const attempts = sanitizeAttemptLog(assignment.attempt_log);
    const attemptIndex = validAttemptIndex(input.attemptIndex, attempts.length);
    if (attemptIndex === null) {
      const error = new Error("Select the recorded failed fleet attempt whose surviving enemy state you observed.");
      error.status = 400;
      throw error;
    }
    const attempt = attempts[attemptIndex];
    if (clean(attempt?.status).toLowerCase() !== "loss") {
      const error = new Error("Post-battle cleanup state may only be attached to a recorded Fleet War Room loss.");
      error.status = 409;
      throw error;
    }
    const defense = await selectOne("gac_round_fleets", {
      select: "id,round_id,capital_ship_base_id,starters,reinforcements,members,zone,fleet_slot,owner,side,source",
      id: `eq.${Number(assignment.defense_fleet_id)}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: "eq.opponent",
      side: "eq.defense",
      source: "eq.user-confirmed-current-fleet-board",
    });
    if (!defense?.id) {
      const error = new Error("The verified enemy fleet snapshot for this failed attempt is unavailable.");
      error.status = 409;
      throw error;
    }
    return Object.freeze({ resolved, assignment, attempt, attemptIndex, defense });
  }

  async function saveObservation(userId, input = {}) {
    const context = await resolveLossAttempt(userId, input);
    const units = normalizeObservationUnits(input.units, context.defense);
    const previous = await selectOne("gac_fleet_cleanup_observations", {
      select: "id,revision",
      assignment_id: `eq.${context.assignment.id}`,
      attempt_index: `eq.${context.attemptIndex}`,
      order: "revision.desc",
    });
    const revision = Math.max(0, Number(previous?.revision || 0)) + 1;
    const observedAt = now().toISOString();
    const explicitAlive = units.filter((row) => row.status === "alive").map((row) => row.baseId);
    const explicitDestroyed = units.filter((row) => row.status === "destroyed").map((row) => row.baseId);
    const unknown = units.filter((row) => row.status === "unknown").map((row) => row.baseId);
    const row = {
      round_id: context.resolved.roundRow.id,
      defense_fleet_id: context.defense.id,
      assignment_id: context.assignment.id,
      attempt_index: context.attemptIndex,
      revision,
      observed_units: units,
      notes: boundedText(input.notes, 2000) || null,
      source: "verified-owner-post-loss-fleet-observation",
      source_ref: clean(input.sourceRef || "gac-command-center-fleet-cleanup-control"),
      observed_at: observedAt,
      metadata: {
        allyCode: context.resolved.allyCode,
        opponentAllyCode: context.resolved.opponentAllyCode,
        eventInstanceId: context.resolved.eventInstanceId,
        round: context.resolved.round,
        explicitOwnerObservation: true,
        verificationMethod: "verified-owner-manual-post-loss-observation",
        telemetrySemantics: "manual-visible-approximation-only",
        unknownMeansUnknown: true,
        explicitAlive,
        explicitDestroyed,
        unknown,
        originalDefenseMembers: normalizeIds(context.defense.members),
      },
    };
    const inserted = asArray(await store.insert("gac_fleet_cleanup_observations", [row]));
    const saved = normalizeStoredObservation(inserted[0] || { ...row, id: null });
    return Object.freeze({
      source: row.source,
      saved: true,
      eventInstanceId: context.resolved.eventInstanceId,
      round: context.resolved.round,
      opponent: Object.freeze({ allyCode: context.resolved.opponentAllyCode, name: clean(context.resolved.confirmed?.opponent?.name) }),
      observation: saved,
      truth: Object.freeze({
        alive: Object.freeze(explicitAlive),
        destroyed: Object.freeze(explicitDestroyed),
        unknown: Object.freeze(unknown),
        inferredUnits: Object.freeze([]),
        predictedWinProbability: null,
      }),
    });
  }

  async function getObservations(userId, input = {}) {
    const resolved = await boards.resolveRound(userId, input);
    const rows = asArray(await store.select("gac_fleet_cleanup_observations", {
      select: "id,round_id,defense_fleet_id,assignment_id,attempt_index,revision,observed_units,notes,source,source_ref,observed_at,metadata",
      round_id: `eq.${resolved.roundRow.id}`,
      order: "assignment_id.asc,attempt_index.asc,revision.asc",
      limit: 200,
    }));
    const observations = Object.freeze(rows.map(normalizeStoredObservation));
    return Object.freeze({
      source: "verified-owner-post-loss-fleet-observation",
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      opponent: Object.freeze({ allyCode: resolved.opponentAllyCode, name: clean(resolved.confirmed?.opponent?.name) }),
      observations,
      latest: latestObservations(rows),
      count: observations.length,
      scope: Object.freeze({
        postLossOnly: true,
        telemetry: "manual-visible-approximation-only",
        hiddenStateInference: false,
        predictedWinProbability: false,
      }),
    });
  }

  return Object.freeze({ getObservations, resolveLossAttempt, saveObservation });
}

export const gacFleetCleanupObservationService = createGacFleetCleanupObservationService();

export {
  latestObservations,
  normalizeBaseId,
  normalizeIds,
  normalizeObservationUnits,
  normalizeObservedUnit,
  normalizeStoredObservation,
  optionalPercent,
  roleFor,
  validAttemptIndex,
  validObservedStatus,
};
