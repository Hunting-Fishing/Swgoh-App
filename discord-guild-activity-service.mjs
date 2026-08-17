import { commandCenterHistoryService } from "./command-center-history-service.mjs";
import { discordStateStore } from "./discord-state-store.mjs";

const DEFAULT_EVENT_LIMIT = 200;
const DEFAULT_SNAPSHOT_LIMIT = 2;
const MAX_DISCORD_CONTENT = 1900;

function clean(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function number(value) {
  const parsed = Number(value);
  return new Intl.NumberFormat("en-US").format(Number.isFinite(parsed) ? parsed : 0);
}

function signed(value) {
  const parsed = Number(value);
  const numeric = Number.isFinite(parsed) ? parsed : 0;
  return `${numeric > 0 ? "+" : ""}${number(numeric)}`;
}

function compactTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().replace("T", " ").replace(/:\d{2}\.\d{3}Z$/, " UTC");
}

function truncate(value, maxLength = MAX_DISCORD_CONTENT) {
  const source = String(value || "");
  if (source.length <= maxLength) return source;
  const suffix = "\n…open the SWGOH Command Center Guild page for the full Activity Command.";
  const available = Math.max(1, maxLength - suffix.length);
  const sliced = source.slice(0, available);
  const boundary = sliced.lastIndexOf("\n");
  return `${boundary > available * 0.55 ? sliced.slice(0, boundary) : sliced}${suffix}`.slice(0, maxLength);
}

function momentumLabel(row = {}) {
  const parts = [];
  if (Number(row.omicronsAdded || 0) > 0) parts.push(`+${number(row.omicronsAdded)} Omi`);
  if (Number(row.ultimatesAdded || 0) > 0) parts.push(`+${number(row.ultimatesAdded)} Ult`);
  if (Number(row.relicLevelsGained || 0) > 0) parts.push(`+${number(row.relicLevelsGained)} relic`);
  if (Number(row.zetasAdded || 0) > 0) parts.push(`+${number(row.zetasAdded)} Zeta`);
  if (Number(row.gpGained || 0) > 0) parts.push(`${signed(row.gpGained)} GP`);
  return parts.join(" · ") || `${number(row.eventCount || 0)} tracked changes`;
}

function investmentLabel(row = {}) {
  const parts = [];
  if (Number(row.omicronsAdded || 0) > 0) parts.push(`Omi +${number(row.omicronsAdded)}`);
  if (Number(row.zetasAdded || 0) > 0) parts.push(`Zeta +${number(row.zetasAdded)}`);
  if (Number(row.ultimatesAdded || 0) > 0) parts.push("Ultimate");
  return parts.join(" · ") || "ability investment";
}

function durableMemberControls(binding = {}, history = {}) {
  const links = Object.values(binding?.userLinks || {}).filter((row) => row && typeof row === "object");
  const preferences = Object.values(binding?.memberPreferences || {}).filter((row) => row && typeof row === "object");
  const unavailable = Object.values(binding?.memberAvailability || {})
    .filter((row) => clean(row?.availability).toLowerCase() === "unavailable");
  const currentMembers = Array.isArray(history?.currentMembers) ? history.currentMembers : [];
  const byAllyCode = new Map(currentMembers.map((row) => [allyCode(row?.allyCode), row]).filter(([code]) => code));
  const byPlayerId = new Map(currentMembers.map((row) => [clean(row?.playerId), row]).filter(([id]) => id));

  const unavailableMembers = unavailable.map((row) => {
    const match = byAllyCode.get(allyCode(row?.swgohAllyCode)) || byPlayerId.get(clean(row?.playerId || row?.memberId)) || null;
    return Object.freeze({
      discordUserId: clean(row?.discordUserId),
      allyCode: allyCode(row?.swgohAllyCode || match?.allyCode),
      name: clean(match?.name || row?.swgohAllyCode || row?.playerId || row?.memberId || row?.discordUserId || "member"),
      updatedAt: clean(row?.updatedAt),
    });
  });

  return Object.freeze({
    linkedPlayers: links.length,
    unavailableMembers: Object.freeze(unavailableMembers),
    giveOverrides: preferences.filter((row) => clean(row?.preference).toLowerCase() === "give").length,
    keepOverrides: preferences.filter((row) => clean(row?.preference).toLowerCase() === "keep").length,
    membersWithPreferences: new Set(preferences.map((row) => clean(row?.discordUserId)).filter(Boolean)).size,
  });
}

export async function getDiscordGuildActivityCommand({
  discordGuildId,
  fallbackGuildAllyCode = "",
  stateStore = discordStateStore,
  historyService = commandCenterHistoryService,
  eventLimit = DEFAULT_EVENT_LIMIT,
  snapshotLimit = DEFAULT_SNAPSHOT_LIMIT,
} = {}) {
  const guildId = clean(discordGuildId);
  if (!guildId) throw new Error("A valid Discord guild is required for /tb activity.");
  if (typeof stateStore?.readGuild !== "function") throw new Error("Durable Discord guild reader is unavailable.");
  if (typeof historyService?.getGuildHistoryByPlayer !== "function") throw new Error("Persisted Guild history service is unavailable.");

  const binding = await stateStore.readGuild(guildId);
  if (!binding) throw new Error("This Discord server has not completed durable /tb setup yet.");
  const seedAllyCode = allyCode(binding.swgohAllyCode || fallbackGuildAllyCode);
  if (!seedAllyCode) throw new Error("The Discord server does not have a valid persisted SWGOH guild binding.");

  const history = await historyService.getGuildHistoryByPlayer(seedAllyCode, {
    eventLimit,
    snapshotLimit,
  });
  if (!history?.activityCommand) throw new Error("Persisted Guild Activity Command data is unavailable for this guild.");

  return Object.freeze({
    guild: history.guild || {},
    activityCommand: history.activityCommand,
    memberControls: durableMemberControls(binding, history),
    source: history.source || "canonical-history",
    seedAllyCode,
  });
}

export function formatDiscordGuildActivityCommand(result = {}) {
  const guild = result.guild || {};
  const command = result.activityCommand || {};
  const summary = command.summary || {};
  const window = command.window || {};
  const leaders = Array.isArray(command.momentumLeaders) ? command.momentumLeaders : [];
  const review = Array.isArray(command.noCapturedProgression) ? command.noCapturedProgression : [];
  const investments = Array.isArray(command.recentAbilityInvestments) ? command.recentAbilityInvestments : [];
  const controls = result.memberControls || {};
  const unavailable = Array.isArray(controls.unavailableMembers) ? controls.unavailableMembers : [];

  const lines = [
    "**SWGOH Command Center · Guild Activity**",
    `Guild: **${clean(guild.name) || "bound guild"}**`,
    `Progressing: **${number(summary.membersWithCapturedProgression)}/${number(summary.currentMembers)}** · Review queue: **${number(summary.membersWithoutCapturedProgression)}** · Membership changes: **${number(summary.membershipChanges)}**`,
    `Investments: **${number(summary.abilityInvestments)}** · GP: **${signed(summary.gpGained)}** · Relics: **${signed(summary.relicLevelsGained)}** · Zetas: **${signed(summary.zetasAdded)}** · Omicrons: **${signed(summary.omicronsAdded)}**`,
    `TB controls: linked **${number(controls.linkedPlayers)}** · unavailable **${number(unavailable.length)}** · GIVE **${number(controls.giveOverrides)}** · KEEP **${number(controls.keepOverrides)}**`,
  ];

  if (unavailable.length) {
    const names = unavailable.slice(0, 5).map((row) => clean(row.name) || row.allyCode || "member");
    lines.push(`Unavailable: **${names.join("**, **")}**${unavailable.length > names.length ? ` · +${unavailable.length - names.length} more` : ""}`);
  }

  if (window.from || window.to) {
    lines.push(`Evidence: **${compactTime(window.from)} → ${compactTime(window.to)}**${window.truncated ? " · capped event window" : ""}`);
  }

  if (leaders.length) {
    lines.push("", "**Momentum leaders**");
    for (const row of leaders.slice(0, 5)) {
      lines.push(`• **${clean(row.name || row.allyCode || row.playerId) || "member"}** · ${momentumLabel(row)}`);
    }
    if (leaders.length > 5) lines.push(`• +${leaders.length - 5} more progressing members`);
  }

  if (review.length) {
    lines.push("", "**Officer review queue**");
    for (const row of review.slice(0, 5)) {
      lines.push(`• **${clean(row.name || row.allyCode || row.playerId) || "member"}** · no tracked roster progression in this window`);
    }
    if (review.length > 5) lines.push(`• +${review.length - 5} more review candidates`);
  }

  if (investments.length) {
    lines.push("", "**Recent ability investments**");
    for (const row of investments.slice(0, 5)) {
      lines.push(`• **${clean(row.playerName || row.allyCode || row.playerId) || "member"}** · ${clean(row.unitName || row.baseId) || "unit"} · ${investmentLabel(row)}`);
    }
    if (investments.length > 5) lines.push(`• +${investments.length - 5} more classified investments`);
  }

  lines.push("", "_Read-only persisted history. “No tracked progression” describes this evidence window; it is not an inactivity verdict._");
  return truncate(lines.join("\n"));
}
