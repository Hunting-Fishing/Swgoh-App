import { discordStateStore } from "./discord-state-store.mjs";
import { guildRosterService } from "./guild-roster-service.mjs";
import { resolveDiscordGuildAllyCode } from "./discord-tb-live.mjs";

function normalizeSnowflake(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{16,22}$/.test(text)) {
    const error = new Error(`${label} must be a valid Discord snowflake.`);
    error.code = "INVALID_DISCORD_SNOWFLAKE";
    throw error;
  }
  return text;
}

function normalizeAllyCode(value, label = "Ally Code") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error(`${label} must contain exactly 9 digits.`);
    error.code = "INVALID_ALLY_CODE";
    throw error;
  }
  return digits;
}

function optionalAllyCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function memberAllyCode(member = {}) {
  return optionalAllyCode(member?.allyCode || member?.ally_code);
}

function safeText(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function verifyDiscordGuildPlayerClaim({
  discordGuildId,
  claimedAllyCode,
  fallbackGuildAllyCode = "",
  stateStore = discordStateStore,
  rosterService = guildRosterService,
} = {}) {
  const guildId = normalizeSnowflake(discordGuildId, "Discord guild ID");
  const claim = normalizeAllyCode(claimedAllyCode, "Claimed SWGOH Ally Code");

  const binding = await resolveDiscordGuildAllyCode({
    allyCode: fallbackGuildAllyCode,
    interaction: { guild_id: guildId },
    stateStore,
  });

  if (typeof rosterService?.getGuildRoster !== "function") {
    const error = new Error("Live guild roster verification service is unavailable.");
    error.code = "GUILD_ROSTER_SERVICE_UNAVAILABLE";
    throw error;
  }

  const rosterResult = await rosterService.getGuildRoster(binding.allyCode, {
    staleWhileRevalidate: false,
  });
  const guildSnapshot = rosterResult?.value;
  const members = Array.isArray(guildSnapshot?.members) ? guildSnapshot.members : null;
  if (!members) {
    const error = new Error("The bound SWGOH guild roster could not be verified.");
    error.code = "INVALID_GUILD_ROSTER_SNAPSHOT";
    throw error;
  }

  const member = members.find((row) => memberAllyCode(row) === claim);
  if (!member) {
    const error = new Error("That Ally Code is not present in the Discord server's bound SWGOH guild roster.");
    error.code = "PLAYER_NOT_IN_BOUND_GUILD";
    throw error;
  }

  return Object.freeze({
    verified: true,
    discordGuildId: guildId,
    claimedAllyCode: claim,
    guildBindingAllyCode: binding.allyCode,
    guildBindingSource: binding.source,
    guildId: safeText(guildSnapshot?.guild?.id || guildSnapshot?.id),
    guildName: safeText(guildSnapshot?.guild?.name || guildSnapshot?.name),
    playerId: safeText(member?.playerId || member?.player_id),
    playerName: safeText(member?.name),
    rosterAvailable: Boolean(member?.rosterAvailable),
    rosterCache: safeText(rosterResult?.cache || "unknown"),
    rosterAgeMs: Number(rosterResult?.ageMs || 0),
  });
}
