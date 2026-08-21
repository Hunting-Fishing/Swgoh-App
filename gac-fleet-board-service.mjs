import { gacBoardObservationService } from "./gac-board-observation-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeBaseId(value) {
  const id = clean(value).split(":")[0].toUpperCase();
  return /^[A-Z0-9_:-]{1,100}$/.test(id) ? id : "";
}
function normalizeIds(values) { return [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))]; }
function validOwner(value) {
  const owner = clean(value).toLowerCase();
  return owner === "player" || owner === "opponent" ? owner : "";
}
function validSlot(value) {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot <= 9 ? slot : null;
}
function validPlanStatus(value) {
  const status = clean(value).toLowerCase();
  return new Set(["planned", "attempted", "win", "loss", "abandoned"]).has(status) ? status : "";
}
function normalizeFleet(value = {}) {
  const capitalShipBaseId = normalizeBaseId(value.capitalShipBaseId);
  const starters = normalizeIds(value.starters).filter((id) => id !== capitalShipBaseId);
  const reinforcements = normalizeIds(value.reinforcements)
    .filter((id) => id !== capitalShipBaseId && !starters.includes(id));
  if (!capitalShipBaseId) {
    const error = new Error("A capital ship is required for a saved GAC fleet.");
    error.status = 400;
    throw error;
  }
  if (starters.length !== 3) {
    const error = new Error("A saved GAC fleet requires exactly three starting ships.");
    error.status = 400;
    throw error;
  }
  if (reinforcements.length > 4) {
    const error = new Error("A saved GAC fleet can contain at most four reinforcements.");
    error.status = 400;
    throw error;
  }
  const members = normalizeIds([capitalShipBaseId, ...starters, ...reinforcements]);
  if (members.length !== 4 + reinforcements.length) {
    const error = new Error("Capital ship, starters and reinforcements must be unique fleet units.");
    error.status = 400;
    throw error;
  }
  return Object.freeze({
    capitalShipBaseId,
    starters: Object.freeze(starters),
    reinforcements: Object.freeze(reinforcements),
    members: Object.freeze(members),
  });
}
function mutationPolicy(plan = null) {
  if (!plan?.id) return Object.freeze({ allowed: true, code: "no-plan", status: "", attempts: 0 });
  const status = validPlanStatus(plan.status);
  const attempts = Math.max(asArray(plan.attempt_log).length, Math.max(0, Number(plan.attempt_count || 0)));
  if (attempts > 0 || ["attempted", "win", "loss"].includes(status)) {
    return Object.freeze({ allowed: false, code: "history", status, attempts });
  }
  if (status === "planned") return Object.freeze({ allowed: false, code: "locked", status, attempts });
  if (status === "abandoned") return Object.freeze({ allowed: true, code: "released", status, attempts });
  return Object.freeze({ allowed: false, code: "unknown", status, attempts });
}
function normalizeRow(row = {}) {
  const fleet = normalizeFleet({
    capitalShipBaseId: row.capital_ship_base_id,
    starters: row.starters,
    reinforcements: row.reinforcements,
  });
  return Object.freeze({
    id: row.id ?? null,
    zone: clean(row.zone),
    slot: validSlot(row.fleet_slot),
    ...fleet,
    source: clean(row.source),
    sourceRef: clean(row.source_ref),
    confidence: Number(row.confidence || 0),
    observedAt: clean(row.observed_at),
    metadata: row.metadata && typeof row.metadata === "object" ? Object.freeze({ ...row.metadata }) : Object.freeze({}),
  });
}

export function createGacFleetBoardService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const rounds = options.rounds || gacBoardObservationService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }
  async function resolveRound(userId, input = {}) { return rounds.resolveRound(userId, input); }

  async function assertFleetMutationSafe(defenseIdInput, ownerInput, operation = "modify") {
    const owner = validOwner(ownerInput);
    const defenseId = Number(defenseIdInput);
    if (owner !== "opponent" || !Number.isInteger(defenseId) || defenseId <= 0) return null;
    const plan = await selectOne("gac_fleet_attack_plan_assignments", {
      select: "id,defense_fleet_id,status,attempt_count,attempt_log",
      defense_fleet_id: `eq.${defenseId}`,
    });
    const policy = mutationPolicy(plan);
    if (policy.allowed) return policy;
    const verb = operation === "replace" ? "replaced" : "deleted";
    const error = new Error(
      policy.code === "locked"
        ? `Release the locked Fleet War Room plan before this saved fleet can be ${verb}.`
        : policy.code === "history"
          ? `This saved fleet has Fleet War Room attempt history and cannot be ${verb}; preserve the recorded battle evidence.`
          : `This saved fleet has Fleet War Room state that is not safe to modify.`
    );
    error.status = 409;
    throw error;
  }

  async function saveFleetDefense(userIdInput, input = {}, ownerInput = "opponent") {
    const owner = validOwner(ownerInput);
    if (!owner) throw new TypeError("Fleet board owner must be player or opponent.");
    const fleet = normalizeFleet(input);
    const slot = validSlot(input.slot);
    if (slot === null) {
      const error = new Error("A valid Fleet Territory slot is required.");
      error.status = 400;
      throw error;
    }
    const zone = clean(input.zone || "BACK-TOP").toUpperCase();
    if (zone !== "BACK-TOP") {
      const error = new Error("GAC fleet defenses belong to the Back Top Fleet Territory.");
      error.status = 400;
      throw error;
    }
    const resolved = await resolveRound(userIdInput, input);
    const source = "user-confirmed-current-fleet-board";
    const identity = {
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      zone: `eq.${zone}`,
      fleet_slot: `eq.${slot}`,
      source: `eq.${source}`,
    };
    if (owner === "opponent") {
      const existing = asArray(await store.select("gac_round_fleets", { select: "id", ...identity, limit: 10 }));
      for (const row of existing) await assertFleetMutationSafe(row.id, owner, "replace");
    }
    await store.delete("gac_round_fleets", identity);
    const observedAt = now().toISOString();
    const inserted = asArray(await store.insert("gac_round_fleets", [{
      round_id: resolved.roundRow.id,
      owner,
      side: "defense",
      zone,
      fleet_slot: slot,
      capital_ship_base_id: fleet.capitalShipBaseId,
      starters: fleet.starters,
      reinforcements: fleet.reinforcements,
      members: fleet.members,
      banners: null,
      successful: null,
      battle_attempt: null,
      source,
      source_ref: clean(input.sourceRef || (owner === "player" ? "gac-command-center-my-fleet-defense" : "gac-command-center-current-fleet-board")),
      confidence: 1,
      observed_at: observedAt,
      metadata: {
        confirmationMethod: "verified-owner-current-fleet-observation",
        confirmedByUserId: resolved.userId,
        allyCode: resolved.allyCode,
        opponentAllyCode: resolved.opponentAllyCode,
        eventInstanceId: resolved.eventInstanceId,
        round: resolved.round,
        boardOwner: owner,
        rolesConfirmed: true,
        starterCount: 3,
        reinforcementCount: fleet.reinforcements.length,
        datacronApplicable: false,
      },
    }]));
    return Object.freeze({
      source,
      saved: true,
      owner,
      roundId: clean(resolved.roundRow.id),
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      opponentAllyCode: resolved.opponentAllyCode,
      fleet: Object.freeze({ id: inserted[0]?.id ?? null, zone, slot, ...fleet }),
      observedAt,
    });
  }

  async function getFleetDefenses(userIdInput, input = {}, ownerInput = "opponent") {
    const owner = validOwner(ownerInput);
    if (!owner) throw new TypeError("Fleet board owner must be player or opponent.");
    const resolved = await resolveRound(userIdInput, input);
    const rows = asArray(await store.select("gac_round_fleets", {
      select: "id,round_id,owner,side,zone,fleet_slot,capital_ship_base_id,starters,reinforcements,members,source,source_ref,confidence,observed_at,metadata",
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      source: "eq.user-confirmed-current-fleet-board",
      order: "fleet_slot.asc,observed_at.asc",
      limit: 10,
    }));
    return Object.freeze({
      source: "user-confirmed-current-fleet-board",
      owner,
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      opponent: Object.freeze({
        allyCode: resolved.opponentAllyCode,
        name: clean(resolved.confirmed?.opponent?.name),
        playerId: clean(resolved.confirmed?.opponent?.playerId),
      }),
      fleets: Object.freeze(rows.map(normalizeRow)),
    });
  }

  async function deleteFleetDefense(userIdInput, input = {}, ownerInput = "opponent") {
    const owner = validOwner(ownerInput);
    if (!owner) throw new TypeError("Fleet board owner must be player or opponent.");
    const resolved = await resolveRound(userIdInput, input);
    const id = Number(input.id);
    if (!Number.isInteger(id) || id <= 0) {
      const error = new Error("A valid saved fleet defense ID is required.");
      error.status = 400;
      throw error;
    }
    const existing = await selectOne("gac_round_fleets", {
      select: "id,round_id,owner,side,source",
      id: `eq.${id}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      source: "eq.user-confirmed-current-fleet-board",
    });
    if (!existing?.id) {
      const error = new Error("That saved fleet defense does not belong to the verified current round.");
      error.status = 404;
      throw error;
    }
    await assertFleetMutationSafe(existing.id, owner, "delete");
    await store.delete("gac_round_fleets", { id: `eq.${id}`, round_id: `eq.${resolved.roundRow.id}` });
    return Object.freeze({ source: "user-confirmed-current-fleet-board", deleted: true, id, owner, eventInstanceId: resolved.eventInstanceId, round: resolved.round });
  }

  return Object.freeze({
    assertFleetMutationSafe,
    deleteDefense: (userId, input) => deleteFleetDefense(userId, input, "opponent"),
    deleteFleetDefense,
    deletePlayerDefense: (userId, input) => deleteFleetDefense(userId, input, "player"),
    getDefenses: (userId, input) => getFleetDefenses(userId, input, "opponent"),
    getFleetDefenses,
    getPlayerDefenses: (userId, input) => getFleetDefenses(userId, input, "player"),
    resolveRound,
    saveDefense: (userId, input) => saveFleetDefense(userId, input, "opponent"),
    saveFleetDefense,
    savePlayerDefense: (userId, input) => saveFleetDefense(userId, input, "player"),
  });
}

export const gacFleetBoardService = createGacFleetBoardService();

export {
  mutationPolicy,
  normalizeBaseId,
  normalizeFleet,
  normalizeIds,
  normalizeRow,
  validOwner,
  validPlanStatus,
  validSlot,
};
