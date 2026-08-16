import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { discordStateStore } from "./discord-state-store.mjs";
import { createDiscordTbLiveServices } from "./discord-tb-live.mjs";
import { linkDiscordGuildPlayer, unlinkDiscordGuildPlayer } from "./discord-player-link-service.mjs";
import { setDiscordDonationPreference } from "./discord-donation-preference-service.mjs";
import { getDiscordLinkedPlayerSnapshot } from "./discord-linked-player-service.mjs";
import { setDiscordMemberAvailability } from "./discord-member-availability-service.mjs";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_INTERACTION_BYTES = 1024 * 1024;
const EPHEMERAL_FLAG = 1 << 6;
const MAX_DISCORD_CONTENT = 1900;
const ADMINISTRATOR_PERMISSION = 1n << 3n;
const MANAGE_GUILD_PERMISSION = 1n << 5n;
const DEFERRED_SUBCOMMANDS = new Set(["setup", "sync", "phase", "assignments", "farms", "link", "unlink", "links", "me", "preference", "preferences", "availability"]);
const STATE_SUBCOMMANDS = new Set(["link", "unlink", "links", "me", "preference", "preferences", "availability"]);
const MEMBER_SELF_SERVICE_SUBCOMMANDS = new Set(["me", "preference", "preferences", "availability"]);

export const DISCORD_INTERACTION_TYPES = Object.freeze({
  PING: 1,
  APPLICATION_COMMAND: 2,
});

export const DISCORD_RESPONSE_TYPES = Object.freeze({
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
});

function boolEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function clean(value) {
  return String(value || "").trim();
}

function snowflake(value) {
  const text = clean(value);
  return /^\d{16,22}$/.test(text) ? text : "";
}

function allyCode(value) {
  const digits = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : "";
}

function unitBaseId(value) {
  const text = clean(value).toUpperCase();
  return /^[A-Z0-9_:-]{2,80}$/.test(text) ? text : "";
}

function donationPreference(value) {
  const text = clean(value).toLowerCase();
  return new Set(["give", "default", "keep"]).has(text) ? text : "";
}

function memberAvailability(value) {
  const text = clean(value).toLowerCase();
  return new Set(["available", "unavailable"]).has(text) ? text : "";
}

function displayAllyCode(value) {
  const digits = allyCode(value);
  return digits ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : "unknown";
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function permissionBitset(value) {
  const text = clean(value);
  if (!/^\d+$/.test(text)) return null;
  try {
    return BigInt(text);
  } catch {
    return null;
  }
}

export function discordTbMemberHasOfficerPermission(interaction = {}) {
  const permissions = permissionBitset(interaction?.member?.permissions);
  if (permissions == null) return false;
  return Boolean((permissions & MANAGE_GUILD_PERMISSION) !== 0n || (permissions & ADMINISTRATOR_PERMISSION) !== 0n);
}

function memberRoleIds(interaction = {}) {
  return (Array.isArray(interaction?.member?.roles) ? interaction.member.roles : [])
    .map((value) => snowflake(value))
    .filter(Boolean);
}

export async function discordTbMemberHasConfiguredOfficerRole(interaction = {}, stateStore = discordStateStore) {
  const guildId = snowflake(interaction?.guild_id);
  const roles = memberRoleIds(interaction);
  if (!guildId || !roles.length || typeof stateStore?.status !== "function" || typeof stateStore?.readGuild !== "function") return false;

  try {
    if (!stateStore.status()?.enabled) return false;
    const guild = await stateStore.readGuild(guildId);
    const configured = new Set((Array.isArray(guild?.officerRoleIds) ? guild.officerRoleIds : []).map((value) => snowflake(value)).filter(Boolean));
    return roles.some((roleId) => configured.has(roleId));
  } catch (error) {
    console.error("Discord configured officer-role authorization failed:", error?.message || error);
    return false;
  }
}

export function discordTbSelfServiceTargetAllowed(interaction = {}) {
  const subcommand = discordTbSubcommand(interaction);
  if (!MEMBER_SELF_SERVICE_SUBCOMMANDS.has(subcommand)) return false;
  const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
  if (!actorDiscordUserId) return false;
  if (subcommand === "me") return true;
  const requestedDiscordUserId = snowflake(discordTbOption(interaction, "member"));
  return !requestedDiscordUserId || requestedDiscordUserId === actorDiscordUserId;
}

export function discordTbConfig(env = process.env) {
  const applicationId = snowflake(env.DISCORD_APPLICATION_ID);
  const publicKey = clean(env.DISCORD_PUBLIC_KEY).toLowerCase();
  const botToken = clean(env.DISCORD_BOT_TOKEN);
  const pilotGuildId = snowflake(env.DISCORD_DEFAULT_GUILD_ID);
  const pilotAllyCode = allyCode(env.DISCORD_DEFAULT_ALLY_CODE);
  const redundancyTarget = boundedInteger(env.DISCORD_TB_REDUNDANCY_TARGET, 2, 1, 5);
  const interactionsEnabled = boolEnv(env.DISCORD_TB_INTERACTIONS_ENABLED, false);
  const deliveryEnabled = boolEnv(env.DISCORD_TB_DELIVERY_ENABLED, false);
  const validPublicKey = /^[0-9a-f]{64}$/.test(publicKey);

  return Object.freeze({
    applicationId,
    publicKey: validPublicKey ? publicKey : "",
    botToken,
    pilotGuildId,
    pilotAllyCode,
    redundancyTarget,
    interactionsEnabled,
    deliveryEnabled,
    configured: Boolean(applicationId && validPublicKey),
    commandRegistrationConfigured: Boolean(applicationId && botToken && pilotGuildId),
    pilotGuildLiveConfigured: Boolean(pilotGuildId && pilotAllyCode),
  });
}

export function discordTbPublicStatus(env = process.env) {
  const config = discordTbConfig(env);
  return Object.freeze({
    enabled: config.interactionsEnabled,
    configured: config.configured,
    applicationIdConfigured: Boolean(config.applicationId),
    publicKeyConfigured: Boolean(config.publicKey),
    botTokenConfigured: Boolean(config.botToken),
    pilotGuildConfigured: Boolean(config.pilotGuildId),
    pilotGuildLiveConfigured: config.pilotGuildLiveConfigured,
    commandRegistrationConfigured: config.commandRegistrationConfigured,
    deliveryEnabled: config.deliveryEnabled,
    redundancyTarget: config.redundancyTarget,
    officerAuthorization: "manage-guild-administrator-or-configured-role",
    setupAuthorization: "manage-guild-or-administrator",
    playerLinkAuthorization: "officer-only-live-guild-membership-verified",
    donationPreferenceAuthorization: "linked-member-self-or-officer-live-unit-verified",
    memberAvailabilityAuthorization: "linked-member-self-or-officer-live-membership-verified",
    memberSelfService: "linked-player-only",
    interactionsPath: "/api/discord/interactions",
    mode: "http-interactions",
  });
}

export function discordEd25519PublicKey(publicKeyHex) {
  const raw = Buffer.from(String(publicKeyHex || ""), "hex");
  if (raw.length !== 32) throw new Error("Discord public key must be a 32-byte Ed25519 key.");
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export function verifyDiscordInteraction({ publicKey, signature, timestamp, rawBody }) {
  const signatureBytes = Buffer.from(String(signature || ""), "hex");
  if (signatureBytes.length !== 64) return false;
  if (!String(timestamp || "")) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  try {
    const key = discordEd25519PublicKey(publicKey);
    return cryptoVerify(
      null,
      Buffer.concat([Buffer.from(String(timestamp), "utf8"), body]),
      key,
      signatureBytes,
    );
  } catch {
    return false;
  }
}

export async function readDiscordInteractionBody(request, maxBytes = MAX_INTERACTION_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) {
      const error = new Error("Discord interaction body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function commandOptions(interaction = {}) {
  return Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
}

function activeSubcommand(interaction = {}) {
  return commandOptions(interaction).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2) || null;
}

export function discordTbSubcommand(interaction = {}) {
  return String(activeSubcommand(interaction)?.name || "status").toLowerCase();
}

export function discordTbOption(interaction = {}, name) {
  const optionName = String(name || "").toLowerCase();
  const subcommand = activeSubcommand(interaction);
  const options = Array.isArray(subcommand?.options) ? subcommand.options : [];
  return options.find((row) => String(row?.name || "").toLowerCase() === optionName)?.value ?? null;
}

export function discordTbPhase(interaction = {}) {
  const phase = String(discordTbOption(interaction, "phase") || "").toUpperCase();
  return /^P[1-6]$/.test(phase) ? phase : "";
}

function ephemeral(content) {
  return {
    type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: String(content || ""),
      flags: EPHEMERAL_FLAG,
      allowed_mentions: { parse: [] },
    },
  };
}

function deferredEphemeral() {
  return {
    type: DISCORD_RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL_FLAG },
  };
}

function truncateContent(value, maxLength = MAX_DISCORD_CONTENT) {
  const source = String(value || "");
  const limit = Math.max(80, Math.min(2000, Number(maxLength || MAX_DISCORD_CONTENT)));
  if (source.length <= limit) return source;
  const suffix = "\n…more details are available in the SWGOH Command Center web app.";
  const available = Math.max(1, limit - suffix.length);
  const sliced = source.slice(0, available);
  const boundary = sliced.lastIndexOf("\n");
  return `${boundary > available * 0.55 ? sliced.slice(0, boundary) : sliced}${suffix}`.slice(0, limit);
}

function safeText(value, fallback = "unknown") {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function previewText(value, maxLength = 140) {
  const text = safeText(value, "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function guildName(guild = {}) {
  return safeText(guild?.guild?.name || guild?.name || "Guild");
}

function hydratedMembers(guild = {}) {
  return (Array.isArray(guild?.members) ? guild.members : []).filter((member) => member?.rosterAvailable).length;
}

function guildGp(guild = {}) {
  const members = Array.isArray(guild?.members) ? guild.members : [];
  const sum = members.reduce((total, member) => total + Number(member?.galacticPower || 0), 0);
  return Number(guild?.guild?.galacticPower || guild?.galacticPower || sum || 0);
}

function statusMessage(interaction, config) {
  const guild = String(interaction?.guild_id || "Direct message / unknown guild");
  const lines = [
    "**SWGOH Command Center · TB**",
    `HTTP interactions: ${config.interactionsEnabled ? "enabled" : "disabled"}`,
    `Guild: ${guild}`,
    `Pilot Discord server: ${config.pilotGuildId || "not configured"}`,
    `Pilot SWGOH guild seed: ${config.pilotAllyCode ? "configured" : "not configured"}`,
    `Mission redundancy target: ${config.redundancyTarget}`,
    "Officer authorization: Manage Guild / Administrator, or a durably configured officer role",
    "Setup authorization: Manage Guild or Administrator only",
    "Player identity: officer-managed, guild-membership verified, durably audited",
    "Member self-service: linked members can read their own profile and manage only their own preferences/availability",
    "Donation preferences: durable GIVE/KEEP overrides feed the live mission-safe planner",
    "Availability: durable UNAVAILABLE removes that linked member from planner candidate assignments",
    `Proactive outbound delivery: ${config.deliveryEnabled ? "enabled" : "disabled"}`,
    "Publishing and DMs remain disabled.",
  ];
  return lines.join("\n");
}

export function handleDiscordTbCommand(interaction, config = discordTbConfig()) {
  if (String(interaction?.data?.name || "").toLowerCase() !== "tb") {
    return ephemeral("Unknown command. This application currently exposes `/tb` only.");
  }

  if (config.pilotGuildId && String(interaction?.guild_id || "") !== config.pilotGuildId) {
    return ephemeral("This TB command is currently restricted to the configured pilot Discord server.");
  }

  const subcommand = discordTbSubcommand(interaction);
  if (subcommand === "status") return ephemeral(statusMessage(interaction, config));
  if (subcommand === "phase" && !discordTbPhase(interaction)) {
    return ephemeral("Choose a ROTE phase from P1 through P6 for `/tb phase`.");
  }

  if (DEFERRED_SUBCOMMANDS.has(subcommand)) {
    if (subcommand === "setup" && !config.pilotAllyCode) {
      return ephemeral("Initial `/tb setup` requires `DISCORD_DEFAULT_ALLY_CODE` to contain a 9-digit Ally Code from the guild. After setup persists the Discord→SWGOH guild binding, live read commands no longer require that fallback.");
    }
    return deferredEphemeral();
  }

  return ephemeral(`Unknown /tb subcommand: ${subcommand}`);
}

function phaseScope(value) {
  return value ? String(value).toUpperCase() : "All phases";
}

function assignmentLabel(row = {}) {
  const unit = safeText(row.name || row.baseId, "unit");
  const member = safeText(row.member?.name, "unassigned");
  const status = safeText(row.safety?.status || "SAFE", "SAFE");
  return `• ${safeText(row.phase, "?")} · ${unit} → **${member}**${status === "SAFE" ? "" : ` · ${status}`}`;
}

function formatSetupResult(guild = {}, roleWasProvided = false) {
  const roleIds = Array.isArray(guild?.officerRoleIds) ? guild.officerRoleIds : [];
  const lines = [
    "**SWGOH Command Center · Durable Setup Saved**",
    `Discord server: **${safeText(guild.discordGuildId)}**`,
    `SWGOH guild seed: **configured**`,
    `Command channel: ${guild.commandChannelId ? `<#${guild.commandChannelId}>` : "not configured"}`,
  ];
  if (roleWasProvided) {
    lines.push(`Officer role: ${roleIds.length ? roleIds.map((id) => `<@&${id}>`).join(", ") : "cleared"}`);
  } else {
    lines.push(`Officer roles: **${roleIds.length} configured** (existing role configuration preserved)`);
  }
  lines.push("Setup was written atomically with an audit event. Publishing and DMs are still disabled.");
  return truncateContent(lines.join("\n"));
}

function formatPlayerLinkResult(result = {}, discordUserId = "") {
  const link = result.link || {};
  const verification = result.verification || {};
  const lines = [
    "**SWGOH Command Center · Player Link Saved**",
    `Discord member: <@${safeText(discordUserId)}>`,
    `SWGOH player: **${safeText(verification.playerName, "verified guild member")}** · **${displayAllyCode(link.swgohAllyCode || verification.claimedAllyCode)}**`,
    `Guild: **${safeText(verification.guildName, "bound guild")}**`,
    `Guild membership check: **verified against bound guild roster** · binding: **${safeText(verification.guildBindingSource)}**`,
    "The link is durable and audited. This does not enable DMs or assignment publishing yet.",
  ];
  return truncateContent(lines.join("\n"));
}

function formatPlayerUnlinkResult(result = {}) {
  const removed = result.removed || {};
  const lines = [
    "**SWGOH Command Center · Player Link Removed**",
    `Discord member: <@${safeText(result.discordUserId)}>`,
    `Removed Ally Code: **${displayAllyCode(removed.swgohAllyCode)}**`,
    "The unlink is durable and audited. Stored unit preferences and availability for this Discord member were cleared. No TB plan or delivery state was changed.",
  ];
  return truncateContent(lines.join("\n"));
}

function formatPlayerLinksResult(guild = {}) {
  const links = Object.values(guild?.userLinks && typeof guild.userLinks === "object" ? guild.userLinks : {})
    .filter((row) => snowflake(row?.discordUserId) && allyCode(row?.swgohAllyCode))
    .sort((a, b) => String(a.discordUserId).localeCompare(String(b.discordUserId)));
  const lines = [
    "**SWGOH Command Center · Discord ↔ SWGOH Links**",
    `Discord server: **${safeText(guild?.discordGuildId)}**`,
    `Linked members: **${links.length}**`,
  ];
  if (!links.length) {
    lines.push("", "No player links are configured yet. Officers can use `/tb link member:<user> ally_code:<code>`.");
  } else {
    lines.push("");
    for (const row of links.slice(0, 24)) {
      lines.push(`• <@${row.discordUserId}> ↔ **${displayAllyCode(row.swgohAllyCode)}**${row.playerId ? ` · player ID ${safeText(row.playerId)}` : ""}`);
    }
    if (links.length > 24) lines.push(`• +${links.length - 24} more durable links`);
  }
  lines.push("", "_Mentions are suppressed; this command does not ping linked members._");
  return truncateContent(lines.join("\n"));
}

function formatLinkedPlayerSnapshot(result = {}) {
  const member = result.member || {};
  const units = Array.isArray(member.units) ? member.units : [];
  const lines = [
    "**SWGOH Command Center · My Linked Player**",
    `Discord member: <@${safeText(result.discordUserId)}>`,
    `SWGOH player: **${safeText(member.name, "linked guild member")}** · **${displayAllyCode(result?.link?.swgohAllyCode)}**`,
    `Guild: **${safeText(result.guildName, "bound guild")}**`,
    `Galactic Power: **${number(member.galacticPower)}**`,
    `Hydrated roster units: **${units.length}**`,
    `Roster cache: **${safeText(result.rosterCache)}**`,
    "This is your own durable Discord ↔ SWGOH link. No guild state was changed.",
  ];
  return truncateContent(lines.join("\n"));
}

function formatDonationPreferenceResult(result = {}) {
  const pref = safeText(result.preference, "default").toUpperCase();
  const verification = result.verification || {};
  const lines = [
    `**SWGOH Command Center · Donation Preference ${pref === "DEFAULT" ? "Cleared" : "Saved"}**`,
    `Discord member: <@${safeText(result.discordUserId)}>`,
    `Unit: **${safeText(verification.unitName || result.baseId)}** · Base ID: **${safeText(result.baseId)}**`,
    `Preference: **${pref}**`,
  ];
  if (pref === "GIVE" || pref === "KEEP") {
    lines.push(`Ownership check: **verified against the bound guild roster**${verification.playerName ? ` for **${safeText(verification.playerName)}**` : ""}`);
    lines.push(pref === "GIVE"
      ? "Planner effect: this member is favored as a donor for this unit when legal."
      : "Planner effect: this member is pushed to the end of the donor order and used only when safer owners are exhausted.");
  } else {
    lines.push("Planner effect: the explicit override was removed; normal mission-safety ranking applies.");
  }
  lines.push("The change is durable and audited. No assignments were published and no DMs were sent.");
  return truncateContent(lines.join("\n"));
}

function formatDonationPreferencesResult(guild = {}, discordUserId = "") {
  const all = Object.values(guild?.memberPreferences && typeof guild.memberPreferences === "object" ? guild.memberPreferences : {})
    .filter((row) => snowflake(row?.discordUserId) && unitBaseId(row?.baseId) && donationPreference(row?.preference))
    .filter((row) => !discordUserId || row.discordUserId === discordUserId)
    .sort((a, b) => String(a.discordUserId).localeCompare(String(b.discordUserId)) || String(a.baseId).localeCompare(String(b.baseId)));
  const lines = [
    "**SWGOH Command Center · Donation Preferences**",
    `Scope: ${discordUserId ? `<@${discordUserId}>` : "all linked members"}`,
    `Active GIVE/KEEP overrides: **${all.length}**`,
  ];
  if (!all.length) {
    lines.push("", "No active GIVE/KEEP overrides are stored for this scope.");
  } else {
    lines.push("");
    for (const row of all.slice(0, 30)) {
      lines.push(`• <@${row.discordUserId}> · **${safeText(row.baseId)}** → **${safeText(row.preference).toUpperCase()}**`);
    }
    if (all.length > 30) lines.push(`• +${all.length - 30} more overrides`);
  }
  lines.push("", "_These controls feed the Discord mission-safe ROTE planner. Mentions are suppressed._");
  return truncateContent(lines.join("\n"));
}

function formatMemberAvailabilityResult(result = {}) {
  const state = safeText(result.availability, "available").toUpperCase();
  const verification = result.verification || {};
  const lines = [
    "**SWGOH Command Center · TB Availability**",
    `Discord member: <@${safeText(result.discordUserId)}>`,
    `State: **${state}**`,
  ];
  if (state === "UNAVAILABLE") {
    lines.push(`Guild check: **verified against bound guild roster**${verification.playerName ? ` for **${safeText(verification.playerName)}**` : ""}`);
    lines.push("Planner effect: this member is removed from ROTE Operation donor candidates until marked AVAILABLE again.");
  } else {
    lines.push("Planner effect: any explicit availability exclusion was cleared; the member can be considered normally again.");
  }
  lines.push("The change is durable and audited. No assignments were published and no DMs were sent.");
  return truncateContent(lines.join("\n"));
}

function formatMemberAvailabilityStatus(guild = {}, discordUserId = "") {
  const row = guild?.memberAvailability?.[discordUserId];
  const state = row?.availability === "unavailable" ? "UNAVAILABLE" : "AVAILABLE";
  const lines = [
    "**SWGOH Command Center · TB Availability**",
    `Discord member: <@${safeText(discordUserId)}>`,
    `State: **${state}**`,
    state === "UNAVAILABLE"
      ? "Planner effect: this linked member is currently excluded from ROTE Operation donor candidates."
      : "Planner effect: this linked member has no explicit availability exclusion.",
    "No guild state was changed by this status read.",
  ];
  return truncateContent(lines.join("\n"));
}

function formatSyncResult(result = {}) {
  const guild = result.guild || result;
  const members = Array.isArray(guild?.members) ? guild.members : [];
  const lines = [
    "**SWGOH Command Center · Guild Sync**",
    `Guild: **${guildName(guild)}**`,
    "Live roster refresh: **complete**",
    `Hydrated rosters: **${hydratedMembers(guild)}/${members.length}**`,
    `Guild GP: **${number(guildGp(guild))}**`,
    `Cache state: **${safeText(result.cache || "refreshed")}**`,
    "No TB assignments or officer state were changed.",
  ];
  return truncateContent(lines.join("\n"));
}

function formatAssignmentsResult(result = {}, phase = "") {
  const plan = result.plan || {};
  const safety = result.safety || {};
  const assignments = (Array.isArray(plan.assignments) ? plan.assignments : []).filter((row) => !phase || String(row.phase) === phase);
  const unfilled = (Array.isArray(plan.unfilled) ? plan.unfilled : []).filter((row) => !phase || String(row.phase) === phase);
  const total = assignments.length + unfilled.length;
  const coverage = total ? Math.round((assignments.length / total) * 1000) / 10 : 0;
  const help = assignments.filter((row) => row?.safety?.help).length;
  const criticalProtections = Number(safety?.summary?.criticalProtections || 0);
  const preferenceCount = Number(result?.planningControls?.preferenceCount || 0);
  const unavailableMemberCount = Number(result?.planningControls?.unavailableMemberCount || 0);
  const lines = [
    `**ROTE Mission-Safe Assignments · ${phaseScope(phase)}**`,
    `Guild: **${guildName(result.guild)}**`,
    `Assigned: **${assignments.length}/${total} (${coverage}%)** · Unfilled: **${unfilled.length}**`,
    `Mission protections: **${Number(safety?.summary?.protectedUnits || 0)}** · Critical: **${criticalProtections}** · GIVE/KEEP: **${preferenceCount}** · Unavailable: **${unavailableMemberCount}** · HELP/risk: **${help}**`,
  ];

  if (assignments.length) {
    lines.push("", "**Assignment preview**");
    for (const row of assignments.slice(0, 12)) lines.push(assignmentLabel(row));
    if (assignments.length > 12) lines.push(`• +${assignments.length - 12} more assignments in the web planner`);
  }

  if (unfilled.length) {
    lines.push("", "**Needs officer attention**");
    for (const row of unfilled.slice(0, 5)) {
      lines.push(`• ${safeText(row.phase, "?")} · ${safeText(row.name || row.baseId, "unit")} — ${Number(row.safeOwners || 0)} safe / ${Number(row.availableOwners || 0)} available owners`);
    }
    if (unfilled.length > 5) lines.push(`• +${unfilled.length - 5} more unfilled slots`);
  }

  lines.push("", "_Read-only draft: this command consumes stored preferences/availability but does not publish assignments, change locks, or send DMs._");
  return truncateContent(lines.join("\n"));
}

function formatFarmsResult(result = {}, phase = "") {
  const farms = Array.isArray(result?.safety?.coverage?.farms) ? result.safety.coverage.farms : [];
  const filtered = farms.filter((row) => {
    if (!phase) return true;
    return (Array.isArray(row?.missionRefs) ? row.missionRefs : []).some((mission) => String(mission?.phase || "") === phase);
  });
  const lines = [
    `**ROTE Highest-Impact Farms · ${phaseScope(phase)}**`,
    `Guild: **${guildName(result.guild)}**`,
    `Mission redundancy target: **${Number(result?.safety?.redundancyTarget || 2)} ready owners**`,
  ];

  if (!filtered.length) {
    lines.push("", "No mission-impact farm targets were found for this scope from the currently hydrated roster data.");
  } else {
    lines.push("");
    for (const row of filtered.slice(0, 10)) {
      lines.push(`• **${safeText(row.member?.name, "member")}** — ${safeText(row.unitName || row.baseId, "unit")} → ${safeText(row.gapLabel, "upgrade needed")} · ${Number(row.missionImpact || 0)} mission impact`);
    }
    if (filtered.length > 10) lines.push(`• +${filtered.length - 10} more farm targets in the web planner`);
  }

  lines.push("", "_Farm priorities come from verified mission-entry coverage; partial fleet evidence stays fail-closed._");
  return truncateContent(lines.join("\n"));
}

function formatPhaseCommandResult(result = {}) {
  const command = result.phaseCommand || {};
  const summary = command.summary || {};
  const preferenceCount = Number(result?.planningControls?.preferenceCount || 0);
  const unavailableMemberCount = Number(result?.planningControls?.unavailableMemberCount || 0);
  const lines = [
    `**ROTE Phase Command · ${safeText(command.phase, "P1")}**`,
    `Guild: **${guildName(result.guild)}** · Hydrated: **${Number(summary.hydratedMembers || 0)}/${Number(summary.totalMembers || 0)}**`,
    `Mission entry: **${Number(summary.exactCoveragePercent || 0)}% exact coverage** · Zero: **${Number(summary.zeroCoverageMissions || 0)}** · Single-owner: **${Number(summary.singleOwnerMissions || 0)}**`,
    `Redundancy (${Number(command.redundancyTarget || 2)} owners): **${Number(summary.redundancyCoveragePercent || 0)}%** · Partial-evidence missions: **${Number(summary.partialEvidenceMissions || 0)}**`,
    `Operations: **${Number(summary.assignedOperationSlots || 0)}/${Number(summary.operationSlots || 0)} (${Number(summary.operationCoveragePercent || 0)}%)** · Unfilled: **${Number(summary.unfilledOperationSlots || 0)}** · Risky donors: **${Number(summary.riskyAssignments || 0)}**`,
    `Protected units: **${Number(summary.protectedUnits || 0)}** · GIVE/KEEP: **${preferenceCount}** · Unavailable: **${unavailableMemberCount}** · Farm priorities: **${Number(summary.farmPriorities || 0)}**`,
  ];

  const alerts = Array.isArray(command.alerts) ? command.alerts : [];
  if (alerts.length) {
    lines.push("", "**Officer priority queue**");
    for (const alert of alerts.slice(0, 6)) {
      const severity = safeText(alert.severity, "info").toUpperCase();
      lines.push(`• **${severity}** · ${previewText(alert.title, 95)} — ${previewText(alert.detail, 145)}`);
    }
    if (alerts.length > 6) lines.push(`• +${alerts.length - 6} more alerts on the web Phase Command Board`);
  }

  const members = Array.isArray(command.members) ? command.members : [];
  if (members.length) {
    lines.push("", "**Highest officer burden**");
    for (const member of members.slice(0, 4)) {
      lines.push(`• **${safeText(member.name, "member")}** · burden ${Number(member.burden || 0)} · sole missions ${Number(member.soleOwnerMissions || 0)} · Ops ${Number(member.operationAssignments || 0)} · risky ${Number(member.riskyAssignments || 0)}`);
    }
  }

  lines.push("", "_Same phase model as the web Command Board. Read-only output; stored preferences/availability are consumed but publishing and DMs remain disabled._");
  return truncateContent(lines.join("\n"));
}

function deferredErrorMessage(error) {
  const message = safeText(error?.name === "AbortError" ? "The live SWGOH request timed out." : error?.message, "The TB command failed.");
  return truncateContent(`**SWGOH Command Center · TB command failed**\n${message}\nNo assignment publishing or DM delivery was performed.`);
}

function requireDurableIdentityState(stateStore) {
  if (typeof stateStore?.status !== "function") throw new Error("Durable Discord state service is unavailable.");
  const status = stateStore.status();
  if (!status?.enabled || !status?.durable) {
    throw new Error(`Durable Discord state is not ready (${safeText(status?.reason, "storage unavailable")}). Attach a persistent Railway Volume before managing shared Discord state.`);
  }
  return status;
}

export async function executeDiscordTbDeferredCommand(interaction, config = discordTbConfig(), services = {}) {
  const subcommand = discordTbSubcommand(interaction);
  const phase = discordTbPhase(interaction);

  if (subcommand === "setup") {
    if (!config.pilotAllyCode) {
      throw new Error("Initial /tb setup requires DISCORD_DEFAULT_ALLY_CODE. After durable setup, live read commands resolve the persisted Discord guild binding first.");
    }
    const stateStore = services?.stateStore;
    if (typeof stateStore?.status !== "function" || typeof stateStore?.bootstrapGuild !== "function") {
      throw new Error("Durable Discord state service is unavailable.");
    }
    const stateStatus = stateStore.status();
    if (!stateStatus?.enabled || !stateStatus?.durable) {
      throw new Error(`Durable Discord state is not ready (${safeText(stateStatus?.reason, "storage unavailable")}). Attach a persistent Railway Volume before running /tb setup.`);
    }

    const discordGuildId = snowflake(interaction?.guild_id);
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    const requestedChannelId = snowflake(discordTbOption(interaction, "channel"));
    const commandChannelId = requestedChannelId || snowflake(interaction?.channel_id);
    const officerRoleId = snowflake(discordTbOption(interaction, "officer_role"));
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb setup.");
    if (!actorDiscordUserId) throw new Error("A valid Discord administrator identity is required for /tb setup.");
    if (!commandChannelId) throw new Error("Choose a command channel or run /tb setup inside a guild channel.");

    const guild = await stateStore.bootstrapGuild({
      discordGuildId,
      swgohAllyCode: config.pilotAllyCode,
      commandChannelId,
      ...(officerRoleId ? { officerRoleIds: [officerRoleId] } : {}),
      actorDiscordUserId,
    });
    return formatSetupResult(guild, Boolean(officerRoleId));
  }

  if (subcommand === "link") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    const discordGuildId = snowflake(interaction?.guild_id);
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    const discordUserId = snowflake(discordTbOption(interaction, "member"));
    const claimedAllyCode = allyCode(discordTbOption(interaction, "ally_code"));
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb link.");
    if (!actorDiscordUserId) throw new Error("A valid Discord officer identity is required for /tb link.");
    if (!discordUserId) throw new Error("Choose a Discord member to link.");
    if (!claimedAllyCode) throw new Error("Enter a valid 9-digit SWGOH Ally Code for /tb link.");
    const transaction = typeof services?.linkDiscordGuildPlayer === "function" ? services.linkDiscordGuildPlayer : linkDiscordGuildPlayer;
    const result = await transaction({
      discordGuildId,
      discordUserId,
      claimedAllyCode,
      actorDiscordUserId,
      fallbackGuildAllyCode: config.pilotAllyCode,
      stateStore,
      ...(services?.rosterService ? { rosterService: services.rosterService } : {}),
    });
    return formatPlayerLinkResult(result, discordUserId);
  }

  if (subcommand === "unlink") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    const discordGuildId = snowflake(interaction?.guild_id);
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    const discordUserId = snowflake(discordTbOption(interaction, "member"));
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb unlink.");
    if (!actorDiscordUserId) throw new Error("A valid Discord officer identity is required for /tb unlink.");
    if (!discordUserId) throw new Error("Choose a Discord member to unlink.");
    const transaction = typeof services?.unlinkDiscordGuildPlayer === "function" ? services.unlinkDiscordGuildPlayer : unlinkDiscordGuildPlayer;
    const result = await transaction({
      discordGuildId,
      discordUserId,
      actorDiscordUserId,
      stateStore,
    });
    return formatPlayerUnlinkResult(result);
  }

  if (subcommand === "links") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    if (typeof stateStore?.readGuild !== "function") throw new Error("Durable Discord guild reader is unavailable.");
    const discordGuildId = snowflake(interaction?.guild_id);
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb links.");
    const guild = await stateStore.readGuild(discordGuildId);
    if (!guild) throw new Error("This Discord server has not completed durable /tb setup yet.");
    return formatPlayerLinksResult(guild);
  }

  if (subcommand === "me") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    const discordGuildId = snowflake(interaction?.guild_id);
    const discordUserId = snowflake(interaction?.member?.user?.id);
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb me.");
    if (!discordUserId) throw new Error("A valid Discord member identity is required for /tb me.");
    const reader = typeof services?.getDiscordLinkedPlayerSnapshot === "function" ? services.getDiscordLinkedPlayerSnapshot : getDiscordLinkedPlayerSnapshot;
    const result = await reader({
      discordGuildId,
      discordUserId,
      stateStore,
      ...(services?.rosterService ? { rosterService: services.rosterService } : {}),
    });
    return formatLinkedPlayerSnapshot(result);
  }

  if (subcommand === "preference") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    const discordGuildId = snowflake(interaction?.guild_id);
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    const requestedDiscordUserId = snowflake(discordTbOption(interaction, "member"));
    const discordUserId = requestedDiscordUserId || actorDiscordUserId;
    const baseId = unitBaseId(discordTbOption(interaction, "unit"));
    const preference = donationPreference(discordTbOption(interaction, "preference"));
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb preference.");
    if (!actorDiscordUserId) throw new Error("A valid Discord member identity is required for /tb preference.");
    if (!discordUserId) throw new Error("No valid linked Discord member was resolved for /tb preference.");
    if (!baseId) throw new Error("Enter a valid SWGOH unit Base ID for /tb preference.");
    if (!preference) throw new Error("Choose GIVE, DEFAULT, or KEEP for /tb preference.");
    if (services.authorizedAsOfficer === false && discordUserId !== actorDiscordUserId) {
      throw new Error("Normal members may change donation preferences only for their own linked SWGOH player.");
    }
    const transaction = typeof services?.setDiscordDonationPreference === "function" ? services.setDiscordDonationPreference : setDiscordDonationPreference;
    const result = await transaction({
      discordGuildId,
      discordUserId,
      unitBaseId: baseId,
      donationPreference: preference,
      actorDiscordUserId,
      fallbackGuildAllyCode: config.pilotAllyCode,
      stateStore,
      ...(services?.rosterService ? { rosterService: services.rosterService } : {}),
    });
    return formatDonationPreferenceResult(result);
  }

  if (subcommand === "preferences") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    if (typeof stateStore?.readGuild !== "function") throw new Error("Durable Discord guild reader is unavailable.");
    const discordGuildId = snowflake(interaction?.guild_id);
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    const requestedDiscordUserId = snowflake(discordTbOption(interaction, "member"));
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb preferences.");
    if (services.authorizedAsOfficer === false && requestedDiscordUserId && requestedDiscordUserId !== actorDiscordUserId) {
      throw new Error("Normal members may view donation preferences only for their own linked SWGOH player.");
    }
    const scopeDiscordUserId = requestedDiscordUserId || (services.authorizedAsOfficer === false ? actorDiscordUserId : "");
    const guild = await stateStore.readGuild(discordGuildId);
    if (!guild) throw new Error("This Discord server has not completed durable /tb setup yet.");
    if (services.authorizedAsOfficer === false && !guild?.userLinks?.[actorDiscordUserId]) {
      throw new Error("Your Discord account does not have a SWGOH player link in this server yet.");
    }
    return formatDonationPreferencesResult(guild, scopeDiscordUserId);
  }

  if (subcommand === "availability") {
    const stateStore = services?.stateStore || discordStateStore;
    requireDurableIdentityState(stateStore);
    if (typeof stateStore?.readGuild !== "function") throw new Error("Durable Discord guild reader is unavailable.");
    const discordGuildId = snowflake(interaction?.guild_id);
    const actorDiscordUserId = snowflake(interaction?.member?.user?.id);
    const requestedDiscordUserId = snowflake(discordTbOption(interaction, "member"));
    const discordUserId = requestedDiscordUserId || actorDiscordUserId;
    const requestedStateRaw = clean(discordTbOption(interaction, "state"));
    const requestedState = memberAvailability(requestedStateRaw);
    if (!discordGuildId) throw new Error("A valid Discord guild is required for /tb availability.");
    if (!actorDiscordUserId) throw new Error("A valid Discord member identity is required for /tb availability.");
    if (!discordUserId) throw new Error("No valid linked Discord member was resolved for /tb availability.");
    if (requestedStateRaw && !requestedState) throw new Error("Choose AVAILABLE or UNAVAILABLE for /tb availability.");
    if (services.authorizedAsOfficer === false && discordUserId !== actorDiscordUserId) {
      throw new Error("Normal members may change or view TB availability only for their own linked SWGOH player.");
    }

    const guild = await stateStore.readGuild(discordGuildId);
    if (!guild) throw new Error("This Discord server has not completed durable /tb setup yet.");
    if (!guild?.userLinks?.[discordUserId]) throw new Error("That Discord member does not have a SWGOH player link in this server yet.");
    if (!requestedState) return formatMemberAvailabilityStatus(guild, discordUserId);

    const transaction = typeof services?.setDiscordMemberAvailability === "function" ? services.setDiscordMemberAvailability : setDiscordMemberAvailability;
    const result = await transaction({
      discordGuildId,
      discordUserId,
      memberAvailability: requestedState,
      actorDiscordUserId,
      stateStore,
      ...(services?.rosterService ? { rosterService: services.rosterService } : {}),
      ...(services?.linkedPlayerReader ? { linkedPlayerReader: services.linkedPlayerReader } : {}),
    });
    return formatMemberAvailabilityResult(result);
  }

  if (subcommand === "sync") {
    if (typeof services.syncGuild !== "function") throw new Error("Discord guild sync service is unavailable.");
    const result = await services.syncGuild({ allyCode: config.pilotAllyCode, interaction });
    return formatSyncResult(result);
  }

  if (subcommand === "phase") {
    if (!phase) throw new Error("A valid ROTE phase is required.");
    if (typeof services.buildPhaseCommand !== "function") throw new Error("Discord TB phase command service is unavailable.");
    const result = await services.buildPhaseCommand({
      allyCode: config.pilotAllyCode,
      redundancyTarget: config.redundancyTarget,
      phase,
      interaction,
    });
    return formatPhaseCommandResult(result);
  }

  if (subcommand === "assignments" || subcommand === "farms") {
    if (typeof services.buildPlan !== "function") throw new Error("Discord TB planning service is unavailable.");
    const result = await services.buildPlan({
      allyCode: config.pilotAllyCode,
      redundancyTarget: config.redundancyTarget,
      phase,
      interaction,
    });
    return subcommand === "farms" ? formatFarmsResult(result, phase) : formatAssignmentsResult(result, phase);
  }

  throw new Error(`Unsupported deferred /tb subcommand: ${subcommand}`);
}

export async function editDiscordOriginalResponse(interaction, config, content, fetchImpl = fetch) {
  const applicationId = snowflake(config?.applicationId);
  const token = clean(interaction?.token);
  if (!applicationId || !token) throw new Error("Discord interaction follow-up identifiers are missing.");

  const endpoint = `https://discord.com/api/v10/webhooks/${applicationId}/${encodeURIComponent(token)}/messages/@original`;
  const response = await fetchImpl(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "SWGOH-Command-Center (discord-tb-interactions)",
    },
    body: JSON.stringify({
      content: truncateContent(content),
      allowed_mentions: { parse: [] },
    }),
  });

  if (!response?.ok) {
    const text = typeof response?.text === "function" ? await response.text() : "";
    throw new Error(`Discord interaction response edit failed with HTTP ${response?.status || "unknown"}${text ? `: ${text.slice(0, 200)}` : ""}.`);
  }
  return true;
}

function scheduleDeferredDiscordCommand(interaction, config, services) {
  Promise.resolve()
    .then(() => executeDiscordTbDeferredCommand(interaction, config, services))
    .catch((error) => deferredErrorMessage(error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord deferred TB response failed:", error?.message || error);
    });
}

export async function handleDiscordInteractionRequest(request, response, env = process.env, services = {}) {
  const config = discordTbConfig(env);
  if (!config.interactionsEnabled) {
    jsonResponse(response, 503, { error: "Discord TB interactions are disabled." });
    return true;
  }
  if (!config.configured) {
    jsonResponse(response, 503, { error: "Discord TB interactions are not configured." });
    return true;
  }

  let rawBody;
  try {
    rawBody = await readDiscordInteractionBody(request);
  } catch (error) {
    jsonResponse(response, error?.status === 413 ? 413 : 400, { error: error?.message || "Invalid Discord interaction body." });
    return true;
  }

  const signature = request.headers["x-signature-ed25519"];
  const timestamp = request.headers["x-signature-timestamp"];
  const verified = verifyDiscordInteraction({
    publicKey: config.publicKey,
    signature,
    timestamp,
    rawBody,
  });
  if (!verified) {
    jsonResponse(response, 401, { error: "Invalid Discord interaction signature." });
    return true;
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    jsonResponse(response, 400, { error: "Discord interaction body is not valid JSON." });
    return true;
  }

  if (Number(interaction?.type) === DISCORD_INTERACTION_TYPES.PING) {
    jsonResponse(response, 200, { type: DISCORD_RESPONSE_TYPES.PONG });
    return true;
  }

  if (Number(interaction?.type) !== DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND) {
    jsonResponse(response, 200, ephemeral("Unsupported Discord interaction type."));
    return true;
  }

  if (String(interaction?.application_id || "") !== config.applicationId) {
    jsonResponse(response, 401, { error: "Discord interaction application does not match this deployment." });
    return true;
  }

  const subcommand = discordTbSubcommand(interaction);
  const bootstrapAuthorized = discordTbMemberHasOfficerPermission(interaction);
  const stateStore = services?.stateStore || discordStateStore;
  let officerAuthorized = bootstrapAuthorized;
  if (!officerAuthorized && subcommand !== "setup") {
    officerAuthorized = await discordTbMemberHasConfiguredOfficerRole(interaction, stateStore);
  }
  const selfServiceAuthorized = !officerAuthorized && discordTbSelfServiceTargetAllowed(interaction);
  const authorized = officerAuthorized || selfServiceAuthorized;

  if (!authorized) {
    let content;
    if (subcommand === "setup") {
      content = "Bootstrap permission required. `/tb setup` requires Manage Server (Manage Guild) or Administrator permission even when an officer role is configured.";
    } else if (MEMBER_SELF_SERVICE_SUBCOMMANDS.has(subcommand)) {
      content = "Member self-service is limited to your own linked SWGOH player. Officers may target other linked guild members.";
    } else {
      content = "Officer permission required. `/tb` requires Manage Server (Manage Guild), Administrator, or a durably configured officer role.";
    }
    jsonResponse(response, 200, ephemeral(content));
    return true;
  }

  const commandResponse = handleDiscordTbCommand(interaction, config);
  jsonResponse(response, 200, commandResponse);
  if (commandResponse.type === DISCORD_RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) {
    if (subcommand === "setup") {
      scheduleDeferredDiscordCommand(interaction, config, { ...services, stateStore, authorizedAsOfficer: officerAuthorized });
      return true;
    }

    if (STATE_SUBCOMMANDS.has(subcommand)) {
      scheduleDeferredDiscordCommand(interaction, config, { ...services, stateStore, authorizedAsOfficer: officerAuthorized });
      return true;
    }

    const hasInjectedLiveServices = typeof services?.syncGuild === "function"
      || typeof services?.buildPlan === "function"
      || typeof services?.buildPhaseCommand === "function";
    const liveServices = hasInjectedLiveServices
      ? services
      : createDiscordTbLiveServices(env, {
        ...(typeof services?.fetch === "function" ? { fetch: services.fetch } : {}),
        stateStore,
      });
    scheduleDeferredDiscordCommand(interaction, config, { ...liveServices, stateStore, authorizedAsOfficer: officerAuthorized });
  }
  return true;
}
