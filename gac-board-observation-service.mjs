import { gacCurrentOpponentConfirmationService } from "./gac-current-opponent-confirmation-service.mjs";
import { supabaseCoreStore } from "./supabase-core-store.mjs";

function clean(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function normalizeAllyCode(value) {
  const code = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(code) ? code : "";
}
function normalizeBaseId(value) {
  const id = clean(value).split(":")[0].toUpperCase();
  return /^[A-Z0-9_:-]{1,100}$/.test(id) ? id : "";
}
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function validSize(value) {
  const size = Number(value);
  return size === 3 || size === 5 ? size : null;
}
function validSlot(value) {
  if (value === null || value === undefined || value === "") return null;
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 0 && slot <= 99 ? slot : null;
}
function validOwner(value) {
  const owner = clean(value).toLowerCase();
  return owner === "player" || owner === "opponent" ? owner : "";
}
function validPlanStatus(value) {
  const status = clean(value).toLowerCase();
  return new Set(["planned", "attempted", "win", "loss", "abandoned"]).has(status) ? status : "";
}
function normalizedMembers(values, size) {
  const members = [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))];
  if (!size || members.length !== size) {
    const error = new Error(`A complete ${size || 3}-character defense is required before saving board evidence.`);
    error.status = 400;
    throw error;
  }
  return members;
}
function sanitizeAffix(value = {}) {
  return Object.freeze({
    tier: Number.isInteger(Number(value?.tier)) ? Number(value.tier) : null,
    kind: clean(value?.kind),
    tags: Object.freeze(asArray(value?.tags || value?.tag).map(clean).filter(Boolean).slice(0, 20)),
    targetRule: clean(value?.targetRule || value?.target_rule),
    abilityId: clean(value?.abilityId || value?.ability_id),
    abilityName: clean(value?.abilityName || value?.ability_name).slice(0, 200),
    abilityDescription: clean(value?.abilityDescription || value?.ability_description).slice(0, 4000),
    abilityTextResolved: value?.abilityTextResolved === true,
    statType: Number.isFinite(Number(value?.statType)) ? Number(value.statType) : null,
    statValue: Number.isFinite(Number(value?.statValue)) ? Number(value.statValue) : null,
    requiredRelicTier: Number.isFinite(Number(value?.requiredRelicTier)) ? Number(value.requiredRelicTier) : null,
  });
}
function sanitizeDatacron(value) {
  if (!value || typeof value !== "object") return null;
  const id = clean(value?.id);
  if (!id) return null;
  return Object.freeze({
    id,
    setId: value?.setId ?? null,
    templateId: clean(value?.templateId),
    level: Number.isFinite(Number(value?.level)) ? Number(value.level) : asArray(value?.affixes).length,
    locked: value?.locked === true ? true : value?.locked === false ? false : null,
    rerollIndex: Number.isFinite(Number(value?.rerollIndex)) ? Number(value.rerollIndex) : null,
    rerollCount: Number.isFinite(Number(value?.rerollCount)) ? Number(value.rerollCount) : null,
    affixes: Object.freeze(asArray(value?.affixes).slice(0, 12).map(sanitizeAffix)),
  });
}
function boardMutationPolicy(plan) {
  if (!plan?.id) return Object.freeze({ allowed: true, code: "no-plan", status: "", attempts: 0 });
  const status = validPlanStatus(plan.status);
  const loggedAttempts = asArray(plan.attempt_log).length;
  const attemptCount = Math.max(0, Math.floor(Number(plan.attempt_count || 0)));
  const attempts = Math.max(loggedAttempts, attemptCount);
  if (attempts > 0 || ["attempted", "win", "loss"].includes(status)) {
    return Object.freeze({ allowed: false, code: "history", status, attempts });
  }
  if (status === "planned") {
    return Object.freeze({ allowed: false, code: "locked", status, attempts });
  }
  if (status === "abandoned") {
    return Object.freeze({ allowed: true, code: "released", status, attempts });
  }
  return Object.freeze({ allowed: false, code: "unknown", status, attempts });
}

export function createGacBoardObservationService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function resolveRound(userIdInput, input = {}) {
    const userId = clean(userIdInput);
    const allyCode = normalizeAllyCode(input.allyCode);
    const opponentAllyCode = normalizeAllyCode(input.opponentAllyCode);
    const eventInstanceId = clean(input.eventInstanceId);
    const round = validRound(input.round);
    if (!userId || !allyCode || !eventInstanceId || !round) {
      const error = new Error("Verified owner, current event and current round are required.");
      error.status = 400;
      throw error;
    }

    const player = await confirmation.assertVerifiedOwnership(userId, allyCode);
    const confirmed = await confirmation.findLatestConfirmed(allyCode, eventInstanceId, round);
    const confirmedOpponent = normalizeAllyCode(confirmed?.opponent?.allyCode);
    if (!confirmedOpponent) {
      const error = new Error("Confirm the current opponent for this GAC event and round first.");
      error.status = 409;
      throw error;
    }
    if (opponentAllyCode && opponentAllyCode !== confirmedOpponent) {
      const error = new Error("The submitted opponent does not match the verified current-round opponent.");
      error.status = 409;
      throw error;
    }

    const event = await selectOne("gac_events", {
      select: "id,event_instance_id",
      event_instance_id: `eq.${eventInstanceId}`,
    });
    if (!event?.id) {
      const error = new Error("The current GAC event is not indexed yet.");
      error.status = 409;
      throw error;
    }

    const roundRow = await selectOne("gac_rounds", {
      select: "id,event_id,round_number,player_id,opponent_ally_code,verified,source",
      event_id: `eq.${event.id}`,
      player_id: `eq.${player.id}`,
      round_number: `eq.${round}`,
      source: "eq.user-confirmed-current-bracket",
      verified: "eq.true",
    });
    if (!roundRow?.id) {
      const error = new Error("The verified current-round matchup record is unavailable.");
      error.status = 409;
      throw error;
    }

    return Object.freeze({
      userId,
      allyCode,
      opponentAllyCode: confirmedOpponent,
      eventInstanceId,
      round,
      player,
      event,
      roundRow,
      confirmed,
    });
  }

  async function assertBoardMutationSafe(defenseIdInput, ownerInput, operation = "modify") {
    const owner = validOwner(ownerInput);
    const defenseId = Number(defenseIdInput);
    if (owner !== "opponent" || !Number.isInteger(defenseId) || defenseId <= 0) return null;
    const plan = await selectOne("gac_attack_plan_assignments", {
      select: "id,defense_squad_id,status,attempt_count,attempt_log",
      defense_squad_id: `eq.${defenseId}`,
    });
    const policy = boardMutationPolicy(plan);
    if (policy.allowed) return policy;
    const verb = operation === "replace" ? "replaced" : "deleted";
    const error = new Error(
      policy.code === "locked"
        ? `Release the locked War Room plan before this saved defense can be ${verb}.`
        : policy.code === "history"
          ? `This saved defense has War Room attempt history and cannot be ${verb}; preserve the recorded battle evidence.`
          : `This saved defense has War Room state that is not safe to modify. Resolve or release the plan first.`
    );
    error.status = 409;
    throw error;
  }

  async function saveBoardDefense(userIdInput, input = {}, ownerInput = "opponent") {
    const owner = validOwner(ownerInput);
    if (!owner) throw new TypeError("Board owner must be player or opponent.");
    const size = validSize(input.size);
    if (!size) {
      const error = new Error("GAC defense size must be 3 or 5.");
      error.status = 400;
      throw error;
    }
    const members = normalizedMembers(input.members, size);
    const leaderBaseId = normalizeBaseId(input.leaderBaseId);
    if (!leaderBaseId || !members.includes(leaderBaseId)) {
      const error = new Error("The confirmed defense leader must be one of the selected defenders.");
      error.status = 400;
      throw error;
    }

    const resolved = await resolveRound(userIdInput, input);
    const zone = clean(input.zone).slice(0, 100) || null;
    const slot = validSlot(input.slot);
    const datacron = sanitizeDatacron(input.datacron);
    const source = "user-confirmed-current-board";
    const identityQuery = zone && slot !== null
      ? { zone: `eq.${zone}`, squad_slot: `eq.${slot}` }
      : {
          leader_base_id: `eq.${leaderBaseId}`,
          ...(zone ? { zone: `eq.${zone}` } : {}),
          ...(slot !== null ? { squad_slot: `eq.${slot}` } : {}),
        };
    const replacementQuery = {
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      source: `eq.${source}`,
      ...identityQuery,
    };
    if (owner === "opponent") {
      const existingRows = asArray(await store.select("gac_round_squads", {
        select: "id",
        ...replacementQuery,
        limit: 10,
      }));
      for (const existing of existingRows) {
        await assertBoardMutationSafe(existing.id, owner, "replace");
      }
    }
    await store.delete("gac_round_squads", replacementQuery);

    const observedAt = now().toISOString();
    const inserted = asArray(await store.insert("gac_round_squads", [{
      round_id: resolved.roundRow.id,
      owner,
      side: "defense",
      zone,
      squad_slot: slot,
      leader_base_id: leaderBaseId,
      members,
      datacron,
      banners: null,
      successful: null,
      battle_attempt: null,
      source,
      source_ref: clean(input.sourceRef || "gac-command-center-current-board"),
      confidence: 1,
      observed_at: observedAt,
      metadata: {
        confirmationMethod: "verified-owner-current-board-observation",
        confirmedByUserId: resolved.userId,
        allyCode: resolved.allyCode,
        opponentAllyCode: resolved.opponentAllyCode,
        eventInstanceId: resolved.eventInstanceId,
        round: resolved.round,
        size,
        boardOwner: owner,
        datacronConfirmed: Boolean(datacron?.id),
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
      defense: Object.freeze({
        leaderBaseId,
        members: Object.freeze(members),
        zone: zone || "",
        slot,
        datacron,
      }),
      observedAt,
      id: inserted[0]?.id ?? null,
    });
  }

  async function getBoardDefenses(userIdInput, input = {}, ownerInput = "opponent") {
    const owner = validOwner(ownerInput);
    if (!owner) throw new TypeError("Board owner must be player or opponent.");
    const resolved = await resolveRound(userIdInput, input);
    const rows = asArray(await store.select("gac_round_squads", {
      select: "id,round_id,owner,side,zone,squad_slot,leader_base_id,members,datacron,source,source_ref,confidence,observed_at,metadata",
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      source: "eq.user-confirmed-current-board",
      order: "squad_slot.asc.nullslast,observed_at.asc",
      limit: 50,
    }));

    return Object.freeze({
      source: "user-confirmed-current-board",
      owner,
      eventInstanceId: resolved.eventInstanceId,
      round: resolved.round,
      opponent: Object.freeze({
        allyCode: resolved.opponentAllyCode,
        name: clean(resolved.confirmed?.opponent?.name),
        playerId: clean(resolved.confirmed?.opponent?.playerId),
      }),
      defenses: Object.freeze(rows.map((row) => Object.freeze({
        id: row.id ?? null,
        leaderBaseId: normalizeBaseId(row.leader_base_id),
        members: Object.freeze(asArray(row.members).map(normalizeBaseId).filter(Boolean)),
        zone: clean(row.zone),
        slot: validSlot(row.squad_slot),
        datacron: sanitizeDatacron(row.datacron),
        confidence: Number(row.confidence || 0),
        observedAt: clean(row.observed_at),
        source: clean(row.source),
      }))),
    });
  }

  async function deleteBoardDefense(userIdInput, input = {}, ownerInput = "opponent") {
    const owner = validOwner(ownerInput);
    if (!owner) throw new TypeError("Board owner must be player or opponent.");
    const resolved = await resolveRound(userIdInput, input);
    const id = Number(input.id);
    if (!Number.isInteger(id) || id <= 0) {
      const error = new Error("A valid saved defense ID is required.");
      error.status = 400;
      throw error;
    }
    const existing = await selectOne("gac_round_squads", {
      select: "id,round_id,owner,side,source",
      id: `eq.${id}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      source: "eq.user-confirmed-current-board",
    });
    if (!existing?.id) {
      const error = new Error("That saved defense does not belong to the verified current board.");
      error.status = 404;
      throw error;
    }
    await assertBoardMutationSafe(existing.id, owner, "delete");
    await store.delete("gac_round_squads", {
      id: `eq.${id}`,
      round_id: `eq.${resolved.roundRow.id}`,
      owner: `eq.${owner}`,
      side: "eq.defense",
      source: "eq.user-confirmed-current-board",
    });
    return Object.freeze({ source: "user-confirmed-current-board", deleted: true, owner, id, round: resolved.round });
  }

  const saveDefense = (userId, input) => saveBoardDefense(userId, input, "opponent");
  const savePlayerDefense = (userId, input) => saveBoardDefense(userId, input, "player");
  const getDefenses = (userId, input) => getBoardDefenses(userId, input, "opponent");
  const getPlayerDefenses = (userId, input) => getBoardDefenses(userId, input, "player");
  const deleteDefense = (userId, input) => deleteBoardDefense(userId, input, "opponent");
  const deletePlayerDefense = (userId, input) => deleteBoardDefense(userId, input, "player");

  return Object.freeze({
    resolveRound,
    assertBoardMutationSafe,
    saveBoardDefense,
    getBoardDefenses,
    deleteBoardDefense,
    saveDefense,
    savePlayerDefense,
    getDefenses,
    getPlayerDefenses,
    deleteDefense,
    deletePlayerDefense,
  });
}

export const gacBoardObservationService = createGacBoardObservationService();

export { boardMutationPolicy, normalizeBaseId, normalizedMembers, sanitizeDatacron, validOwner, validPlanStatus, validRound, validSize };
