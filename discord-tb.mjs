import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { createDiscordTbLiveServices } from "./discord-tb-live.mjs";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MAX_INTERACTION_BYTES = 1024 * 1024;
const EPHEMERAL_FLAG = 1 << 6;
const MAX_DISCORD_CONTENT = 1900;
const DEFERRED_SUBCOMMANDS = new Set(["sync", "phase", "assignments", "farms"]);

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

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
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
    `Proactive outbound delivery: ${config.deliveryEnabled ? "enabled" : "disabled"}`,
    "Live slash-command reads are isolated from publishing, DMs, and officer mutations.",
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
    if (!config.pilotAllyCode) {
      return ephemeral("Live guild commands are not configured yet. Set `DISCORD_DEFAULT_ALLY_CODE` on the SWGOH App Railway service to a 9-digit Ally Code from the pilot guild.");
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
  const lines = [
    `**ROTE Mission-Safe Assignments · ${phaseScope(phase)}**`,
    `Guild: **${guildName(result.guild)}**`,
    `Assigned: **${assignments.length}/${total} (${coverage}%)** · Unfilled: **${unfilled.length}**`,
    `Mission protections: **${Number(safety?.summary?.protectedUnits || 0)}** · Critical: **${criticalProtections}** · HELP/risk assignments: **${help}**`,
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

  lines.push("", "_Read-only draft: publishing, locks, ignores, preferences, and DMs are not changed by this command._");
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
  const lines = [
    `**ROTE Phase Command · ${safeText(command.phase, "P1")}**`,
    `Guild: **${guildName(result.guild)}** · Hydrated: **${Number(summary.hydratedMembers || 0)}/${Number(summary.totalMembers || 0)}**`,
    `Mission entry: **${Number(summary.exactCoveragePercent || 0)}% exact coverage** · Zero: **${Number(summary.zeroCoverageMissions || 0)}** · Single-owner: **${Number(summary.singleOwnerMissions || 0)}**`,
    `Redundancy (${Number(command.redundancyTarget || 2)} owners): **${Number(summary.redundancyCoveragePercent || 0)}%** · Partial-evidence missions: **${Number(summary.partialEvidenceMissions || 0)}**`,
    `Operations: **${Number(summary.assignedOperationSlots || 0)}/${Number(summary.operationSlots || 0)} (${Number(summary.operationCoveragePercent || 0)}%)** · Unfilled: **${Number(summary.unfilledOperationSlots || 0)}** · Risky donors: **${Number(summary.riskyAssignments || 0)}**`,
    `Protected units: **${Number(summary.protectedUnits || 0)}** · Farm priorities: **${Number(summary.farmPriorities || 0)}**`,
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

  lines.push("", "_Same phase model as the web Command Board. Read-only; no locks, preferences, assignments, publishing, or DMs are mutated._");
  return truncateContent(lines.join("\n"));
}

function deferredErrorMessage(error) {
  const message = safeText(error?.name === "AbortError" ? "The live SWGOH request timed out." : error?.message, "The live TB command failed.");
  return truncateContent(`**SWGOH Command Center · TB command failed**\n${message}\nNo guild settings or assignments were changed.`);
}

export async function executeDiscordTbDeferredCommand(interaction, config = discordTbConfig(), services = {}) {
  const subcommand = discordTbSubcommand(interaction);
  const phase = discordTbPhase(interaction);
  if (!config.pilotAllyCode) throw new Error("DISCORD_DEFAULT_ALLY_CODE is not configured.");

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

  const commandResponse = handleDiscordTbCommand(interaction, config);
  jsonResponse(response, 200, commandResponse);
  if (commandResponse.type === DISCORD_RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) {
    const liveServices = typeof services?.syncGuild === "function"
      || typeof services?.buildPlan === "function"
      || typeof services?.buildPhaseCommand === "function"
      ? services
      : createDiscordTbLiveServices(env);
    scheduleDeferredDiscordCommand(interaction, config, liveServices);
  }
  return true;
}
