import { discordStateStore } from "./discord-state-store.mjs";
import { guildRosterService } from "./guild-roster-service.mjs";

function clean(value) {
  return String(value || "").trim();
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

function preference(value) {
  const text = clean(value).toLowerCase();
  if (!new Set(["give", "default", "keep"]).has(text)) {
    const error = new Error("Donation preference must be GIVE, DEFAULT, or KEEP.");
    error.code = "INVALID_DONATION_PREFERENCE";
    throw error;
  }
  return text;
}

function requireDurableState(stateStore) {
  if (typeof stateStore?.status !== "function") {
    const error = new Error("Durable Discord state service is unavailable.");
    error.code = "DISCORD_STATE_UNAVAILABLE";
    throw error;
  }
  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) {
    const error = new Error(`Durable Discord state is not ready (${clean(status?.reason) || "storage unavailable"}).`);
    error.code = "DISCORD_STATE_NOT_DURABLE";
    throw error;
  }
  return status;
}

function rosterMemberAllyCode(member = {}) {
  return allyCode(member?.allyCode || member?.ally_code);
}

function unitBaseId(unit = {}) {
  return clean(unit?.baseId || unit?.base_id).toUpperCase();
}

export async function setDiscordDonationPreference({
  discordGuildId,
  discordUserId,
  unitBaseId: requestedUnitBaseId,
  donationPreference,
  actorDiscordUserId,
  fallbackGuildAllyCode = "",
  stateStore = discordStateStore,
  rosterService = guildRosterService,
} = {}) {
  requireDurableState(stateStore);
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const userId = snowflake(discordUserId, "Discord user ID");
  const actorId = snowflake(actorDiscordUserId, "Discord actor user ID");
  const normalizedBaseId = baseId(requestedUnitBaseId);
  const normalizedPreference = preference(donationPreference);

  if (typeof stateStore?.readGuild !== "function" || typeof stateStore?.setDonationPreference !== "function") {
    const error = new Error("Durable Discord donation-preference state service is unavailable.");
    error.code = "DONATION_PREFERENCE_STATE_UNAVAILABLE";
    throw error;
  }

  const guild = await stateStore.readGuild(guildId);
  if (!guild) {
    const error = new Error("This Discord server has not completed durable /tb setup yet.");
    error.code = "DISCORD_GUILD_NOT_CONFIGURED";
    throw error;
  }
  const link = guild?.userLinks?.[userId];
  if (!link) {
    const error = new Error("That Discord member must be linked to a SWGOH guild member before setting donation preferences.");
    error.code = "PLAYER_LINK_NOT_FOUND";
    throw error;
  }

  let verification = Object.freeze({
    mode: "durable-clear",
    playerName: "",
    unitName: normalizedBaseId,
    guildName: "",
  });

  // DEFAULT means removing an override. Allow it to clear durably even when the live
  // gateway is unavailable, while GIVE/KEEP require current bound-guild ownership evidence.
  if (normalizedPreference !== "default") {
    if (typeof rosterService?.getGuildRoster !== "function") {
      const error = new Error("Live guild roster verification service is unavailable.");
      error.code = "GUILD_ROSTER_SERVICE_UNAVAILABLE";
      throw error;
    }

    const boundAllyCode = allyCode(guild.swgohAllyCode) || allyCode(fallbackGuildAllyCode);
    if (!boundAllyCode) {
      const error = new Error("This Discord server has no valid bound SWGOH guild Ally Code.");
      error.code = "DISCORD_GUILD_BINDING_MISSING";
      throw error;
    }

    const rosterResult = await rosterService.getGuildRoster(boundAllyCode, { staleWhileRevalidate: false });
    const snapshot = rosterResult?.value;
    const members = Array.isArray(snapshot?.members) ? snapshot.members : null;
    if (!members) {
      const error = new Error("The bound SWGOH guild roster could not be verified.");
      error.code = "INVALID_GUILD_ROSTER_SNAPSHOT";
      throw error;
    }

    const linkedAllyCode = allyCode(link.swgohAllyCode);
    const member = members.find((row) => rosterMemberAllyCode(row) === linkedAllyCode);
    if (!member) {
      const error = new Error("The linked SWGOH player is no longer present in the Discord server's bound guild roster.");
      error.code = "LINKED_PLAYER_NOT_IN_BOUND_GUILD";
      throw error;
    }

    const units = Array.isArray(member?.units) ? member.units : [];
    const unit = units.find((row) => unitBaseId(row) === normalizedBaseId);
    if (!unit) {
      const error = new Error("The linked SWGOH player does not currently own that unit, so a GIVE/KEEP preference was not saved.");
      error.code = "LINKED_PLAYER_DOES_NOT_OWN_UNIT";
      throw error;
    }

    verification = Object.freeze({
      mode: "live-bound-guild-ownership",
      playerName: clean(member?.name),
      unitName: clean(unit?.name || unit?.definitionName || normalizedBaseId),
      guildName: clean(snapshot?.guild?.name || snapshot?.name),
      rosterCache: clean(rosterResult?.cache || "unknown"),
      rosterAgeMs: Number(rosterResult?.ageMs || 0),
    });
  }

  const stored = await stateStore.setDonationPreference({
    discordGuildId: guildId,
    discordUserId: userId,
    unitBaseId: normalizedBaseId,
    preference: normalizedPreference,
    actorDiscordUserId: actorId,
  });

  return Object.freeze({
    discordGuildId: guildId,
    discordUserId: userId,
    baseId: normalizedBaseId,
    preference: normalizedPreference,
    stored,
    verification,
  });
}
