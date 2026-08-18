import { discordStateStore } from "./discord-state-store.mjs";
import { discordHardReservationStore } from "./discord-hard-reservation-store.mjs";
import { guildRosterService } from "./guild-roster-service.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function snowflake(value, label) {
  const text = clean(value);
  if (!/^\d{16,22}$/.test(text)) {
    const error = new Error(`${label} must be a valid Discord snowflake.`);
    error.code = "INVALID_DISCORD_SNOWFLAKE";
    throw error;
  }
  return text;
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function baseId(value) {
  const text = clean(value).toUpperCase();
  if (!/^[A-Z0-9_:-]{2,80}$/.test(text)) {
    const error = new Error("SWGOH unit Base ID is invalid.");
    error.code = "INVALID_UNIT_BASE_ID";
    throw error;
  }
  return text;
}

function phase(value) {
  const text = clean(value).toUpperCase();
  if (!/^P[1-6]$/.test(text)) {
    const error = new Error("ROTE phase must be P1 through P6.");
    error.code = "INVALID_ROTE_PHASE";
    throw error;
  }
  return text;
}

function requireDurable(store, label) {
  if (typeof store?.status !== "function") throw new Error(`${label} is unavailable.`);
  const status = store.status();
  if (!status?.enabled || !status?.durable) throw new Error(`${label} is not ready (${clean(status?.reason) || "storage unavailable"}).`);
  return status;
}

function rosterMemberAllyCode(member = {}) {
  return allyCode(member?.allyCode || member?.ally_code);
}

function unitBaseId(unit = {}) {
  return clean(unit?.baseId || unit?.base_id).toUpperCase();
}

export async function setDiscordHardReservation({
  discordGuildId,
  discordUserId,
  unitBaseId: requestedBaseId,
  rotePhase,
  reserved = true,
  actorDiscordUserId,
  fallbackGuildAllyCode = "",
  stateStore = discordStateStore,
  reservationStore = discordHardReservationStore,
  rosterService = guildRosterService,
} = {}) {
  requireDurable(stateStore, "Durable Discord identity state");
  requireDurable(reservationStore, "Durable Discord hard-reservation state");
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const userId = snowflake(discordUserId, "Discord user ID");
  const actorId = snowflake(actorDiscordUserId, "Discord actor user ID");
  const normalizedBaseId = baseId(requestedBaseId);
  const normalizedPhase = phase(rotePhase);

  if (typeof stateStore?.readGuild !== "function") throw new Error("Durable Discord Guild reader is unavailable.");
  if (typeof reservationStore?.setReservation !== "function") throw new Error("Durable Discord hard-reservation writer is unavailable.");

  const guild = await stateStore.readGuild(guildId);
  if (!guild) throw new Error("This Discord server has not completed durable /tb setup yet.");
  const link = guild?.userLinks?.[userId];
  if (!link) throw new Error("That Discord member must be linked to a SWGOH Guild member before hard reservations can be changed.");

  let verifiedPlayerId = clean(link.playerId);
  let verifiedAllyCode = allyCode(link.swgohAllyCode);
  let unitName = normalizedBaseId;
  let verification = Object.freeze({ mode: "durable-clear", playerName: "", unitName, guildName: "" });

  // Clearing a reserve is intentionally available even during a live-gateway outage.
  // Setting a hard reserve requires current bound-Guild membership + ownership evidence.
  if (reserved) {
    if (typeof rosterService?.getGuildRoster !== "function") throw new Error("Live Guild roster verification service is unavailable.");
    const boundAllyCode = allyCode(guild.swgohAllyCode) || allyCode(fallbackGuildAllyCode);
    if (!boundAllyCode) throw new Error("This Discord server has no valid bound SWGOH Guild Ally Code.");
    const rosterResult = await rosterService.getGuildRoster(boundAllyCode, { staleWhileRevalidate: false });
    const snapshot = rosterResult?.value;
    const members = Array.isArray(snapshot?.members) ? snapshot.members : null;
    if (!members) throw new Error("The bound SWGOH Guild roster could not be verified.");
    const member = members.find((row) => rosterMemberAllyCode(row) === verifiedAllyCode);
    if (!member) throw new Error("The linked SWGOH player is no longer present in the Discord server's bound Guild roster.");
    const units = Array.isArray(member?.units) ? member.units : [];
    const unit = units.find((row) => unitBaseId(row) === normalizedBaseId);
    if (!unit) throw new Error("The linked SWGOH player does not currently own that unit, so the hard reservation was not saved.");
    verifiedPlayerId = clean(member?.playerId || member?.id || verifiedPlayerId);
    verifiedAllyCode = rosterMemberAllyCode(member) || verifiedAllyCode;
    unitName = clean(unit?.name || unit?.definitionName || normalizedBaseId);
    verification = Object.freeze({
      mode: "live-bound-guild-ownership",
      playerName: clean(member?.name),
      unitName,
      guildName: clean(snapshot?.guild?.name || snapshot?.name),
      rosterCache: clean(rosterResult?.cache || "unknown"),
      rosterAgeMs: Number(rosterResult?.ageMs || 0),
    });
  }

  const stored = await reservationStore.setReservation({
    discordGuildId: guildId,
    discordUserId: userId,
    swgohAllyCode: verifiedAllyCode,
    playerId: verifiedPlayerId,
    unitBaseId: normalizedBaseId,
    unitName,
    rotePhase: normalizedPhase,
    reserved: Boolean(reserved),
    actorDiscordUserId: actorId,
  });

  return Object.freeze({
    discordGuildId: guildId,
    discordUserId: userId,
    phase: normalizedPhase,
    baseId: normalizedBaseId,
    unitName,
    reserved: Boolean(reserved),
    stored,
    verification,
  });
}

export async function listDiscordHardReservations({
  discordGuildId,
  discordUserId = "",
  rotePhase = "",
  stateStore = discordStateStore,
  reservationStore = discordHardReservationStore,
} = {}) {
  requireDurable(stateStore, "Durable Discord identity state");
  requireDurable(reservationStore, "Durable Discord hard-reservation state");
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const scopeUserId = discordUserId ? snowflake(discordUserId, "Discord user ID") : "";
  const scopePhase = rotePhase ? phase(rotePhase) : "";
  const [guild, hardState] = await Promise.all([
    stateStore.readGuild(guildId),
    reservationStore.readGuild(guildId),
  ]);
  if (!guild) throw new Error("This Discord server has not completed durable /tb setup yet.");
  const links = guild.userLinks && typeof guild.userLinks === "object" ? guild.userLinks : {};
  const rows = Object.values(hardState?.reservations && typeof hardState.reservations === "object" ? hardState.reservations : {})
    .filter((row) => row?.reserved === true)
    .filter((row) => !scopeUserId || row.discordUserId === scopeUserId)
    .filter((row) => !scopePhase || row.phase === scopePhase)
    .filter((row) => {
      const link = links[row.discordUserId];
      if (!link) return false;
      const linkedMemberId = clean(link.playerId) || allyCode(link.swgohAllyCode);
      return linkedMemberId && linkedMemberId === clean(row.memberId);
    })
    .sort((a, b) => String(a.phase).localeCompare(String(b.phase)) || String(a.discordUserId).localeCompare(String(b.discordUserId)) || String(a.baseId).localeCompare(String(b.baseId)));
  return Object.freeze({ discordGuildId: guildId, discordUserId: scopeUserId, phase: scopePhase, rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))) });
}
