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
import {
  formatDiscordGuildActivityCommand,
  getDiscordGuildActivityCommand,
} from "./discord-guild-activity-service.mjs";
import { autocompleteSwgohUnits } from "./discord-unit-autocomplete.mjs";

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

function safeError(error) {
  const message = String(error?.message || "Guild Activity Command failed.")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `**SWGOH Command Center · Guild Activity failed**\n${message}\nNo guild state was changed and no DMs were sent.`;
}

function autocompleteContext(interaction = {}) {
  if (Number(interaction?.type) !== APPLICATION_COMMAND_AUTOCOMPLETE_TYPE) return null;
  if (String(interaction?.data?.name || "").toLowerCase() !== "tb") return null;
  const options = Array.isArray(interaction?.data?.options) ? interaction.data.options : [];
  const subcommand = options.find((row) => Number(row?.type) === 1 || Number(row?.type) === 2);
  if (String(subcommand?.name || "").toLowerCase() !== "preference") return null;
  const parameters = Array.isArray(subcommand?.options) ? subcommand.options : [];
  const focused = parameters.find((row) => row?.focused === true);
  if (String(focused?.name || "").toLowerCase() !== "unit") return null;
  return Object.freeze({ value: String(focused?.value || "") });
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
    .catch((error) => safeError(error))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error("Discord Guild Activity response failed:", error?.message || error);
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
  const isActivity = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && String(interaction?.data?.name || "").toLowerCase() === "tb"
    && discordTbSubcommand(interaction) === "activity";
  if (!autocomplete && !isActivity) {
    return handleCoreDiscordInteractionRequest(replayRequest(request, rawBody), response, env, services);
  }

  const config = discordTbConfig(env);
  if (!config.interactionsEnabled) {
    jsonResponse(response, 503, { error: "Discord TB interactions are disabled." });
    return true;
  }
  if (!config.configured) {
    jsonResponse(response, 503, { error: "Discord TB interactions are not configured." });
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
    jsonResponse(response, 200, autocomplete ? autocompleteResult([]) : ephemeral("This TB command is currently restricted to the configured pilot Discord server."));
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
  let officerAuthorized = discordTbMemberHasOfficerPermission(interaction);
  if (!officerAuthorized) {
    officerAuthorized = await discordTbMemberHasConfiguredOfficerRole(interaction, stateStore);
  }
  if (!officerAuthorized) {
    jsonResponse(response, 200, ephemeral("Officer permission required. `/tb activity` requires Manage Server (Manage Guild), Administrator, or a durably configured officer role."));
    return true;
  }

  jsonResponse(response, 200, deferredEphemeral());
  scheduleActivityResponse(interaction, config, { ...services, stateStore });
  return true;
}
