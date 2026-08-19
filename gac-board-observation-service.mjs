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
function normalizedMembers(values, size) {
  const members = [...new Set(asArray(values).map(normalizeBaseId).filter(Boolean))];
  if (!size || members.length !== size) {
    const error = new Error(`A complete ${size || 3}/5-character defense is required before saving board evidence.`);
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

export function createGacBoardObservationService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const confirmation = options.confirmation || gacCurrentOpponentConfirmationService;
  const now = options.now || (() => new Date());

  async function selectOne(table, query) {
    const rows = asArray(await store.select(table, { ...query, limit: 1 }));
    return rows[0] || null;
  }

  async function saveDefense(userIdInput, input = {}) {
    const userId = clean(userIdInput);
    const allyCode = normalizeAllyCode(input.allyCode);
    const opponentAllyCode = normalizeAllyCode(input.opponentAllyCode);
    const eventInstanceId = clean(input.eventInstanceId);
    const round = validRound(input.round);
    const size = validSize(input.size);
    if (!userId || !allyCode || !opponentAllyCode || !eventInstanceId || !round || !size) {
      const error = new Error("Verified owner, current event, current round, opponent and 3v3/5v5 size are required.");
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

    const player = await confirmation.assertVerifiedOwnership(userId, allyCode);
    const confirmed = await confirmation.findLatestConfirmed(allyCode, eventInstanceId, round);
    if (!confirmed?.opponent?.allyCode || normalizeAllyCode(confirmed.opponent.allyCode) !== opponentAllyCode) {
      const error = new Error("Confirm this opponent for the current GAC event and round before saving board evidence.");
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

    const zone = clean(input.zone).slice(0, 100) || null;
    const slot = validSlot(input.slot);
    const datacron = sanitizeDatacron(input.datacron);
    const source = "user-confirmed-current-board";
    const deleteQuery = {
      round_id: `eq.${roundRow.id}`,
      owner: "eq.opponent",
      side: "eq.defense",
      source: `eq.${source}`,
      ...(zone ? { zone: `eq.${zone}` } : { leader_base_id: `eq.${leaderBaseId}` }),
      ...(slot !== null ? { squad_slot: `eq.${slot}` } : {}),
    };
    await store.delete("gac_round_squads", deleteQuery);

    const observedAt = now().toISOString();
    const inserted = asArray(await store.insert("gac_round_squads", [{
      round_id: roundRow.id,
      owner: "opponent",
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
        confirmedByUserId: userId,
        allyCode,
        opponentAllyCode,
        eventInstanceId,
        round,
        size,
        datacronConfirmed: Boolean(datacron?.id),
      },
    }]));

    return Object.freeze({
      source,
      saved: true,
      roundId: clean(roundRow.id),
      eventInstanceId,
      round,
      opponentAllyCode,
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

  return Object.freeze({ saveDefense });
}

export const gacBoardObservationService = createGacBoardObservationService();

export { normalizeBaseId, normalizedMembers, sanitizeDatacron, validRound, validSize };
