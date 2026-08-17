import { discordStateStore } from "./discord-state-store.mjs";
import { guildRosterService } from "./guild-roster-service.mjs";

function snowflake(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{16,22}$/.test(text)) {
    const error = new Error(`${label} must be a valid Discord snowflake.`);
    error.code = "INVALID_DISCORD_SNOWFLAKE";
    throw error;
  }
  return text;
}

function allyCode(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function cacheDisplay(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "miss") return "live refresh (fresh fetch)";
  if (state === "fresh") return "fresh live cache";
  if (state === "refreshed") return "live refresh (cache renewed)";
  if (state === "stale") return "cached live snapshot (refreshing)";
  return "live roster data";
}

function requireDurableState(stateStore) {
  if (typeof stateStore?.status !== "function" || typeof stateStore?.readGuild !== "function") {
    const error = new Error("Durable Discord state reader is unavailable.");
    error.code = "DISCORD_STATE_UNAVAILABLE";
    throw error;
  }
  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) {
    const error = new Error(`Durable Discord state is not ready (${String(status?.reason || "storage unavailable")}).`);
    error.code = "DISCORD_STATE_NOT_DURABLE";
    throw error;
  }
}

export async function getDiscordLinkedPlayerSnapshot({
  discordGuildId,
  discordUserId,
  stateStore = discordStateStore,
  rosterService = guildRosterService,
} = {}) {
  requireDurableState(stateStore);
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const userId = snowflake(discordUserId, "Discord user ID");
  const guildState = await stateStore.readGuild(guildId);
  const guildBindingAllyCode = allyCode(guildState?.swgohAllyCode);
  if (!guildBindingAllyCode) {
    const error = new Error("This Discord server has not completed durable /tb setup yet.");
    error.code = "DISCORD_GUILD_NOT_BOUND";
    throw error;
  }

  const link = guildState?.userLinks?.[userId];
  const linkedAllyCode = allyCode(link?.swgohAllyCode);
  if (!linkedAllyCode) {
    const error = new Error("Your Discord account does not have a SWGOH player link in this server yet.");
    error.code = "DISCORD_PLAYER_NOT_LINKED";
    throw error;
  }
  if (typeof rosterService?.getGuildRoster !== "function") {
    const error = new Error("Live guild roster service is unavailable.");
    error.code = "GUILD_ROSTER_SERVICE_UNAVAILABLE";
    throw error;
  }

  // Linked-player reads need calculated GP. The gateway exposes that on the rich
  // guild snapshot, which remains a separate cache key from the compact planner roster.
  const rosterResult = await rosterService.getGuildRoster(guildBindingAllyCode, {
    staleWhileRevalidate: false,
    includeActivity: true,
  });
  const snapshot = rosterResult?.value;
  const members = Array.isArray(snapshot?.members) ? snapshot.members : null;
  if (!members) {
    const error = new Error("The bound guild roster could not be read.");
    error.code = "INVALID_GUILD_ROSTER_SNAPSHOT";
    throw error;
  }

  const member = members.find((row) => allyCode(row?.allyCode || row?.ally_code) === linkedAllyCode);
  if (!member) {
    const error = new Error("Your linked Ally Code is no longer present in this Discord server's bound SWGOH guild roster.");
    error.code = "LINKED_PLAYER_NOT_IN_BOUND_GUILD";
    throw error;
  }

  const rosterCacheState = String(rosterResult?.cache || "unknown");
  return Object.freeze({
    discordGuildId: guildId,
    discordUserId: userId,
    guildBindingAllyCode,
    guildId: String(snapshot?.guild?.id || snapshot?.id || "").trim(),
    guildName: String(snapshot?.guild?.name || snapshot?.name || "").trim(),
    link: structuredClone(link),
    member: structuredClone(member),
    rosterCache: cacheDisplay(rosterCacheState),
    rosterCacheState,
    rosterAgeMs: Number(rosterResult?.ageMs || 0),
  });
}

export { cacheDisplay };
