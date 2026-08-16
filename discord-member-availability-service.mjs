import { discordStateStore } from "./discord-state-store.mjs";
import { getDiscordLinkedPlayerSnapshot } from "./discord-linked-player-service.mjs";
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

function availability(value) {
  const text = clean(value).toLowerCase();
  if (!new Set(["available", "unavailable"]).has(text)) {
    const error = new Error("Member availability must be AVAILABLE or UNAVAILABLE.");
    error.code = "INVALID_MEMBER_AVAILABILITY";
    throw error;
  }
  return text;
}

function requireDurableState(stateStore) {
  if (typeof stateStore?.status !== "function" || typeof stateStore?.readGuild !== "function" || typeof stateStore?.setMemberAvailability !== "function") {
    const error = new Error("Durable Discord availability state service is unavailable.");
    error.code = "DISCORD_STATE_UNAVAILABLE";
    throw error;
  }
  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) {
    const error = new Error(`Durable Discord state is not ready (${clean(status?.reason) || "storage unavailable"}).`);
    error.code = "DISCORD_STATE_NOT_DURABLE";
    throw error;
  }
}

export async function setDiscordMemberAvailability({
  discordGuildId,
  discordUserId,
  memberAvailability,
  actorDiscordUserId,
  stateStore = discordStateStore,
  rosterService = guildRosterService,
  linkedPlayerReader = getDiscordLinkedPlayerSnapshot,
} = {}) {
  requireDurableState(stateStore);
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const userId = snowflake(discordUserId, "Discord user ID");
  const actorId = snowflake(actorDiscordUserId, "Discord actor user ID");
  const normalizedAvailability = availability(memberAvailability);

  const guild = await stateStore.readGuild(guildId);
  const link = guild?.userLinks?.[userId];
  if (!link) {
    const error = new Error("That Discord member must have a durable SWGOH player link before TB availability can be changed.");
    error.code = "PLAYER_LINK_NOT_FOUND";
    throw error;
  }

  let verification = Object.freeze({
    mode: "durable-clear",
    playerName: "",
    guildName: "",
  });

  // AVAILABLE removes an exclusion and should remain recoverable during a gateway outage.
  // UNAVAILABLE changes planner eligibility and therefore requires the linked player to still
  // resolve against the current bound guild roster before the exclusion is persisted.
  if (normalizedAvailability === "unavailable") {
    if (typeof linkedPlayerReader !== "function") {
      const error = new Error("Linked SWGOH player verification service is unavailable.");
      error.code = "LINKED_PLAYER_READER_UNAVAILABLE";
      throw error;
    }
    const snapshot = await linkedPlayerReader({
      discordGuildId: guildId,
      discordUserId: userId,
      stateStore,
      rosterService,
    });
    verification = Object.freeze({
      mode: "live-bound-guild-membership",
      playerName: clean(snapshot?.member?.name),
      guildName: clean(snapshot?.guildName),
      rosterCache: clean(snapshot?.rosterCache || "unknown"),
      rosterAgeMs: Number(snapshot?.rosterAgeMs || 0),
    });
  }

  const stored = await stateStore.setMemberAvailability({
    discordGuildId: guildId,
    discordUserId: userId,
    availability: normalizedAvailability,
    actorDiscordUserId: actorId,
  });

  return Object.freeze({
    discordGuildId: guildId,
    discordUserId: userId,
    availability: normalizedAvailability,
    stored,
    verification,
  });
}
