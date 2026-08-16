import { discordStateStore } from "./discord-state-store.mjs";
import { guildRosterService } from "./guild-roster-service.mjs";
import { verifyDiscordGuildPlayerClaim } from "./discord-player-link.mjs";

function snowflake(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{16,22}$/.test(text)) {
    const error = new Error(`${label} must be a valid Discord snowflake.`);
    error.code = "INVALID_DISCORD_SNOWFLAKE";
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
    const error = new Error(`Durable Discord state is not ready (${String(status?.reason || "storage unavailable")}).`);
    error.code = "DISCORD_STATE_NOT_DURABLE";
    throw error;
  }
  return status;
}

async function requireDurableGuildBinding(stateStore, discordGuildId) {
  if (typeof stateStore?.readGuild !== "function") {
    const error = new Error("Durable Discord guild binding reader is unavailable.");
    error.code = "DISCORD_GUILD_BINDING_UNAVAILABLE";
    throw error;
  }
  const guild = await stateStore.readGuild(discordGuildId);
  const digits = String(guild?.swgohAllyCode || "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) {
    const error = new Error("This Discord server must complete /tb setup before player links can be created.");
    error.code = "DISCORD_GUILD_NOT_BOUND";
    throw error;
  }
  return digits;
}

export async function linkDiscordGuildPlayer({
  discordGuildId,
  discordUserId,
  claimedAllyCode,
  actorDiscordUserId,
  stateStore = discordStateStore,
  rosterService = guildRosterService,
} = {}) {
  requireDurableState(stateStore);
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const userId = snowflake(discordUserId, "Discord user ID");
  const actorId = snowflake(actorDiscordUserId, "Discord actor user ID");
  await requireDurableGuildBinding(stateStore, guildId);
  if (typeof stateStore?.linkPlayer !== "function") {
    const error = new Error("Durable Discord player-link writer is unavailable.");
    error.code = "PLAYER_LINK_WRITER_UNAVAILABLE";
    throw error;
  }

  const verification = await verifyDiscordGuildPlayerClaim({
    discordGuildId: guildId,
    claimedAllyCode,
    stateStore,
    rosterService,
  });

  if (verification.guildBindingSource !== "durable-guild-binding") {
    const error = new Error("Player links require the Discord server's durable SWGOH guild binding.");
    error.code = "DISCORD_GUILD_NOT_BOUND";
    throw error;
  }

  const link = await stateStore.linkPlayer({
    discordGuildId: guildId,
    discordUserId: userId,
    swgohAllyCode: verification.claimedAllyCode,
    playerId: verification.playerId,
    actorDiscordUserId: actorId,
  });

  return Object.freeze({
    verifiedGuildMembership: true,
    link,
    verification,
  });
}

export async function unlinkDiscordGuildPlayer({
  discordGuildId,
  discordUserId,
  actorDiscordUserId,
  stateStore = discordStateStore,
} = {}) {
  requireDurableState(stateStore);
  const guildId = snowflake(discordGuildId, "Discord guild ID");
  const userId = snowflake(discordUserId, "Discord user ID");
  const actorId = snowflake(actorDiscordUserId, "Discord actor user ID");
  if (typeof stateStore?.unlinkPlayer !== "function") {
    const error = new Error("Durable Discord player-unlink writer is unavailable.");
    error.code = "PLAYER_UNLINK_WRITER_UNAVAILABLE";
    throw error;
  }

  const removed = await stateStore.unlinkPlayer({
    discordGuildId: guildId,
    discordUserId: userId,
    actorDiscordUserId: actorId,
  });

  return Object.freeze({
    unlinked: true,
    discordGuildId: guildId,
    discordUserId: userId,
    removed,
  });
}
