import { Readable } from "node:stream";
import {
  DISCORD_INTERACTION_TYPES,
  DISCORD_RESPONSE_TYPES,
  discordTbConfig,
  discordTbMemberHasConfiguredOfficerRole,
  discordTbMemberHasOfficerPermission,
  discordTbSubcommand,
  editDiscordOriginalResponse,
  handleDiscordInteractionRequest as handleCoreDiscordInteractionRequest,
  readDiscordInteractionBody,
  verifyDiscordInteraction,
} from "./discord-tb.mjs";
import { discordStateStore } from "./discord-state-store.mjs";
import { discordHardReservationStore } from "./discord-hard-reservation-store.mjs";
import {
  listDiscordHardReservations,
  setDiscordHardReservation,
} from "./discord-hard-reservation-service.mjs";
import {
  formatDiscordGuildActivityCommand,
  getDiscordGuildActivityCommand,
} from "./discord-guild-activity-service.mjs";
import {
  buildDiscordMemberControlsSummary,
  formatDiscordMemberControlsSummary,
} from "./discord-member-controls-summary.mjs";
import { executeDiscordGuildCommand } from "./discord-guild-operations-command.mjs";
import { executeDiscordPlayerLifecycleCommand } from "./discord-player-lifecycle-command.mjs";
import { autocompleteSwgohUnits } from "./discord-unit-autocomplete.mjs";
import {
  executeDiscordTbStage9Command,
  isDiscordTbStage9Subcommand,
} from "./discord-tb-stage9-command.mjs";

const EPHEMERAL_FLAG = 1 << 6;
const APPLICATION_COMMAND_AUTOCOMPLETE_TYPE = 4;
const APPLICATION_COMMAND_AUTOCOMPLETE_RESULT_TYPE = 8;

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
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

function autocompleteResult(choices = []) {
  return {
    type: APPLICATION_COMMAND_AUTOCOMPLETE_RESULT_TYPE,
    data: {
      choices: (Array.isArray(choices) ? choices : []).slice(0, 25),
    },
  };
}

function replayRequest(request, rawBody) {
  const replay = Readable.from([rawBody]);
  replay.headers = request?.headers || {};
  return replay;
}

function safeError(title, error) {
  const message = String(error?.message || `${title} failed.`)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `**SWGOH Command Center · ${title} failed**\n${message}\nNo guild state was changed and no DMs were sent.`;
}

function safeText(value, fallback = "—") {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function activeSubcommand(interaction = {}) {
  const options = Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
  return options.find((row) => Number(row?.type) === 1 || Number(row?.type) === 2) || null;
}

function subcommandOption(interaction = {}, name = "") {
  const optionName = String(name || "").toLowerCase();
  const options = Array.isArray(activeSubcommand(interaction)?.options) ? activeSubcommand(interaction).options : [];
  return options.find((row) => String(row?.name || "").toLowerCase() === optionName)?.value ?? null;
}

function autocompleteContext(interaction = {}) {
  if (Number(interaction?.type) !== APPLICATION_COMMAND_AUTOCOMPLETE_TYPE) return null;
  if (String(interaction?.data?.name || "").toLowerCase() !== "tb") return null;
  const subcommand = activeSubcommand(interaction);
  const name = String(subcommand?.name || "").toLowerCase();
  if (!new Set(["preference", "reserve"]).has(name)) return null;
  const parameters = Array.isArray(subcommand?.options) ? subcommand.options : [];
  const focused = parameters.find((row) => row?.focused === true);
  if (String(focused?.name || "").toLowerCase() !== "unit") return null;
  return Object.freeze({ value: String(focused?.value || ""), subcommand: name });
}

function formatHardReservationResult(result = {}) {
  const reserved = result?.reserved === true;
  const verification = result?.verification || {};
  const lines = [
    "**SWGOH Command Center · ROTE Hard Reserve**",
    `Member: <@${safeText(result.discordUserId)}>`,
    `Phase: **${safeText(result.phase)}**`,
    `Unit: **${safeText(result.unitName || result.baseId)}** (${safeText(result.baseId)})`,
    `State: **${reserved ? "HARD RESERVED" : "CLEARED"}**`,
  ];
  if (reserved) {
    lines.push(`Ownership: **verified against bound Guild roster**${verification.playerName ? ` for **${safeText(verification.playerName)}**` : ""}`);
    lines.push("Planner effect: this member/unit is an absolute Operation donor exclusion for the selected phase until cleared.");
  } else {
    lines.push("Planner effect: the explicit hard reservation was removed; automatic mission protection still applies normally.");
  }
  lines.push("The change is durable and audited. No assignments were published and no DMs were sent.");
  return lines.join("\n").slice(0, 1900);
}

function formatHardReservations(result = {}) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const scope = result?.discordUserId ? `<@${result.discordUserId}>` : "all linked members";
  const phase = result?.phase ? ` · ${result.phase}` : "";
  const lines = [
    "**SWGOH Command Center · ROTE Hard Reserves**",
    `Scope: ${scope}${phase}`,
    `Active hard reserves: **${rows.length}**`,
  ];
  if (!rows.length) {
    lines.push("", "No active hard reservations are stored for this scope.");
  } else {
    lines.push("");
    for (const row of rows.slice(0, 30)) {
      lines.push(`• **${safeText(row.phase)}** · <@${safeText(row.discordUserId)}> · **${safeText(row.unitName || row.baseId)}** (${safeText(row.baseId)})`);
    }
    if (rows.length > 30) lines.push(`• +${rows.length - 30} more hard reserves`);
  }
  lines.push("", "_Hard reserves are absolute donor exclusions. Mentions are suppressed; this read changes no state._");
  return lines.join("\n").slice(0, 1900);
}

function scheduleActivityResponse(interaction, config, services) {
  const stateStore = services?.stateStore || discordStateStore;
  const reader = typeof services?.getDiscordGuildActivityCommand === "function"
    ? services.getDiscordGuildActivityCommand
    : getDiscordGuildActivityCommand;

  Promise.resolve()
    .then(() => reader({
      discordGuildId: interaction?.guild_id,
      fallbackGuildAllyCode: config.pilotAllyCode,
      stateStore,
      ...(services?.historyService ? { historyService: services.historyService } : {}),
    }))
    .then((result) => formatDiscordGuildActivityCommand(result))
    .catch((error) => safeError("Guild Activity", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord Guild Activity response failed:", error?.message || error);
    });
}

function scheduleControlsResponse(interaction, config, services) {
  const stateStore = services?.stateStore || discordStateStore;
  Promise.resolve()
    .then(async () => {
      const status = typeof stateStore?.status === "function" ? stateStore.status() : null;
      if (!status?.enabled || !status?.durable || typeof stateStore?.readGuild !== "function") {
        throw new Error("Durable Discord member-control state is unavailable.");
      }
      const guild = await stateStore.readGuild(String(interaction?.guild_id || ""));
      if (!guild) throw new Error("This Discord server has not completed durable /tb setup yet.");
      return buildDiscordMemberControlsSummary(guild, {
        discordUserId: subcommandOption(interaction, "member"),
      });
    })
    .then((summary) => formatDiscordMemberControlsSummary(summary))
    .catch((error) => safeError("Member TB Controls", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord Member TB Controls response failed:", error?.message || error);
    });
}

function scheduleReserveResponse(interaction, config, services) {
  const stateStore = services?.stateStore || discordStateStore;
  const reservationStore = services?.reservationStore || discordHardReservationStore;
  const setter = typeof services?.setDiscordHardReservation === "function" ? services.setDiscordHardReservation : setDiscordHardReservation;
  const actorDiscordUserId = String(interaction?.member?.user?.id || interaction?.user?.id || "");
  const targetDiscordUserId = String(subcommandOption(interaction, "member") || "");
  const state = String(subcommandOption(interaction, "state") || "reserve").toLowerCase();

  Promise.resolve()
    .then(() => setter({
      discordGuildId: interaction?.guild_id,
      discordUserId: targetDiscordUserId,
      unitBaseId: subcommandOption(interaction, "unit"),
      rotePhase: subcommandOption(interaction, "phase"),
      reserved: state !== "clear",
      actorDiscordUserId,
      fallbackGuildAllyCode: config.pilotAllyCode,
      stateStore,
      reservationStore,
      ...(services?.guildRosterService ? { rosterService: services.guildRosterService } : {}),
    }))
    .then((result) => formatHardReservationResult(result))
    .catch((error) => safeError("ROTE Hard Reserve", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord ROTE Hard Reserve response failed:", error?.message || error);
    });
}

function scheduleReservesResponse(interaction, config, services) {
  const stateStore = services?.stateStore || discordStateStore;
  const reservationStore = services?.reservationStore || discordHardReservationStore;
  const reader = typeof services?.listDiscordHardReservations === "function" ? services.listDiscordHardReservations : listDiscordHardReservations;

  Promise.resolve()
    .then(() => reader({
      discordGuildId: interaction?.guild_id,
      discordUserId: subcommandOption(interaction, "member") || "",
      rotePhase: subcommandOption(interaction, "phase") || "",
      stateStore,
      reservationStore,
    }))
    .then((result) => formatHardReservations(result))
    .catch((error) => safeError("ROTE Hard Reserves", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord ROTE Hard Reserves response failed:", error?.message || error);
    });
}

function scheduleGuildCommandResponse(interaction, config, services) {
  Promise.resolve()
    .then(() => executeDiscordGuildCommand(interaction, config, services))
    .catch((error) => safeError("Guild Operations", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord Guild Operations response failed:", error?.message || error);
    });
}

function schedulePlayerLifecycleResponse(interaction, config, services) {
  Promise.resolve()
    .then(() => executeDiscordPlayerLifecycleCommand(interaction, services))
    .catch((error) => safeError("Player Lifecycle", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord Player Lifecycle response failed:", error?.message || error);
    });
}

function scheduleStage9Response(interaction, config, services) {
  Promise.resolve()
    .then(() => executeDiscordTbStage9Command(interaction, config, { ...services, authorizedAsOfficer: true }))
    .catch((error) => safeError("Immutable ROTE Plan", error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord Stage 9 immutable plan response failed:", error?.message || error);
    });
}

export async function handleDiscordInteractionRequest(request, response, env = process.env, services = {}) {
  let rawBody;
  try {
    rawBody = await readDiscordInteractionBody(request);
  } catch (error) {
    jsonResponse(response, error?.status === 413 ? 413 : 400, { error: error?.message || "Invalid Discord interaction body." });
    return true;
  }

  let interaction = null;
  try {
    interaction = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return handleCoreDiscordInteractionRequest(replayRequest(request, rawBody), response, env, services);
  }

  const autocomplete = autocompleteContext(interaction);
  const subcommand = discordTbSubcommand(interaction);
  const command = String(interaction?.data?.name || "").toLowerCase();
  const isGuildCommand = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND && command === "guild";
  const isPlayerLifecycle = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === "tb"
    && new Set(["ignore", "unregister"]).has(subcommand);
  const isActivity = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === "tb"
    && subcommand === "activity";
  const isControls = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === "tb"
    && subcommand === "controls";
  const isReserve = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === "tb"
    && subcommand === "reserve";
  const isReserves = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === "tb"
    && subcommand === "reserves";
  const isStage9 = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === "tb"
    && isDiscordTbStage9Subcommand(subcommand);
  if (!autocomplete && !isGuildCommand && !isPlayerLifecycle && !isActivity && !isControls && !isReserve && !isReserves && !isStage9) {
    return handleCoreDiscordInteractionRequest(replayRequest(request, rawBody), response, env, services);
  }

  const config = discordTbConfig(env);
  if (!config.interactionsEnabled) {
    jsonResponse(response, 503, { error: "Discord interactions are disabled." });
    return true;
  }
  if (!config.configured) {
    jsonResponse(response, 503, { error: "Discord interactions are not configured." });
    return true;
  }

  const verified = verifyDiscordInteraction({
    publicKey: config.publicKey,
    signature: request.headers["x-signature-ed25519"],
    timestamp: request.headers["x-signature-timestamp"],
    rawBody,
  });
  if (!verified) {
    jsonResponse(response, 401, { error: "Invalid Discord interaction signature." });
    return true;
  }

  if (String(interaction?.application_id || "") !== config.applicationId) {
    jsonResponse(response, 401, { error: "Discord interaction application does not match this deployment." });
    return true;
  }
  if (config.pilotGuildId && String(interaction?.guild_id || "") !== config.pilotGuildId) {
    jsonResponse(response, 200, autocomplete ? autocompleteResult([]) : ephemeral("This command is currently restricted to the configured pilot Discord server."));
    return true;
  }

  if (autocomplete) {
    const lookup = typeof services?.autocompleteSwgohUnits === "function"
      ? services.autocompleteSwgohUnits
      : autocompleteSwgohUnits;
    try {
      const choices = await lookup(autocomplete.value, { limit: 25 });
      jsonResponse(response, 200, autocompleteResult(choices));
    } catch (error) {
      console.error("Discord unit autocomplete failed:", error?.message || error);
      jsonResponse(response, 200, autocompleteResult([]));
    }
    return true;
  }

  const stateStore = services?.stateStore || discordStateStore;

  if (isPlayerLifecycle) {
    jsonResponse(response, 200, deferredEphemeral());
    schedulePlayerLifecycleResponse(interaction, config, { ...services, stateStore, env });
    return true;
  }

  let officerAuthorized = discordTbMemberHasOfficerPermission(interaction);
  if (!officerAuthorized) {
    officerAuthorized = await discordTbMemberHasConfiguredOfficerRole(interaction, stateStore);
  }
  if (!officerAuthorized) {
    const label = isGuildCommand ? `/guild ${subcommand}` : `/tb ${subcommand}`;
    jsonResponse(response, 200, ephemeral(`Officer permission required. \`${label}\` requires Manage Server (Manage Guild), Administrator, or a durably configured officer role.`));
    return true;
  }

  jsonResponse(response, 200, deferredEphemeral());
  if (isGuildCommand) scheduleGuildCommandResponse(interaction, config, { ...services, stateStore, env });
  else if (isControls) scheduleControlsResponse(interaction, config, { ...services, stateStore });
  else if (isReserve) scheduleReserveResponse(interaction, config, { ...services, stateStore });
  else if (isReserves) scheduleReservesResponse(interaction, config, { ...services, stateStore });
  else if (isStage9) scheduleStage9Response(interaction, config, { ...services, stateStore, env });
  else scheduleActivityResponse(interaction, config, { ...services, stateStore });
  return true;
}