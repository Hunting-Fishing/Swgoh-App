import { Readable } from 'node:stream';
import {
  DISCORD_INTERACTION_TYPES,
  DISCORD_RESPONSE_TYPES,
  discordTbConfig,
  discordTbMemberHasConfiguredOfficerRole,
  discordTbMemberHasOfficerPermission,
  discordTbSubcommand,
  editDiscordOriginalResponse,
  readDiscordInteractionBody,
  verifyDiscordInteraction,
} from './discord-tb.mjs';
import { handleDiscordInteractionRequest as handleCoreDiscordInteractionRequest } from './discord-interaction-router-core.mjs';
import { discordStateStore } from './discord-state-store.mjs';
import { discordTbStage9Command } from './discord-tb-stage9-command.mjs';
import { discordTbStage10Command } from './discord-tb-stage10-command.mjs';

const EPHEMERAL_FLAG = 1 << 6;
const STAGE9_SUBCOMMANDS = new Set(['plan-preview', 'plan-status', 'plan-diff', 'plan-approve', 'plan-cancel']);
const STAGE10_SUBCOMMANDS = new Set(['plan-delivery', 'delivery-status']);

function replayRequest(request, rawBody) {
  const replay = Readable.from([rawBody]);
  replay.headers = request?.headers || {};
  replay.method = request?.method;
  replay.url = request?.url;
  return replay;
}

function jsonResponse(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function ephemeral(content) {
  return {
    type: DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: String(content || ''),
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

function safeError(error, stage = 9) {
  const fallback = stage === 10 ? 'Controlled ROTE delivery command failed.' : 'Immutable ROTE plan command failed.';
  const message = String(error?.message || fallback)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stage === 10) {
    return `**SWGOH Command Center · Stage 10 ROTE Delivery failed**\n${message}\nDelivery stopped fail-closed. Check /tb delivery-status before retrying. No member DMs were sent.`;
  }
  return `**SWGOH Command Center · Immutable ROTE Plan failed**\n${message}\nNo assignments were published and no DMs were sent.`;
}

function scheduleStage9Response(interaction, config, services) {
  const command = services?.stage9Command || discordTbStage9Command;
  Promise.resolve()
    .then(() => command.execute(interaction))
    .catch((error) => safeError(error, 9))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error('Discord Stage 9 immutable plan response failed:', error?.message || error);
    });
}

function scheduleStage10Response(interaction, config, services) {
  const command = services?.stage10Command || discordTbStage10Command;
  Promise.resolve()
    .then(() => command.execute(interaction))
    .catch((error) => safeError(error, 10))
    .then((content) => editDiscordOriginalResponse(interaction, config, content, services?.fetch || fetch))
    .catch((error) => {
      console.error('Discord Stage 10 controlled delivery response failed:', error?.message || error);
    });
}

export async function handleDiscordInteractionRequest(request, response, env = process.env, services = {}) {
  let rawBody;
  try {
    rawBody = await readDiscordInteractionBody(request);
  } catch (error) {
    jsonResponse(response, error?.status === 413 ? 413 : 400, { error: error?.message || 'Invalid Discord interaction body.' });
    return true;
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return handleCoreDiscordInteractionRequest(replayRequest(request, rawBody), response, env, services);
  }

  const command = String(interaction?.data?.name || '').toLowerCase();
  const subcommand = discordTbSubcommand(interaction);
  const isStage9 = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === 'tb'
    && STAGE9_SUBCOMMANDS.has(subcommand);
  const isStage10 = Number(interaction?.type) === DISCORD_INTERACTION_TYPES.APPLICATION_COMMAND
    && command === 'tb'
    && STAGE10_SUBCOMMANDS.has(subcommand);

  if (!isStage9 && !isStage10) {
    return handleCoreDiscordInteractionRequest(replayRequest(request, rawBody), response, env, services);
  }

  const config = discordTbConfig(env);
  if (!config.interactionsEnabled) {
    jsonResponse(response, 503, { error: 'Discord interactions are disabled.' });
    return true;
  }
  if (!config.configured) {
    jsonResponse(response, 503, { error: 'Discord interactions are not configured.' });
    return true;
  }

  const verified = verifyDiscordInteraction({
    publicKey: config.publicKey,
    signature: request.headers['x-signature-ed25519'],
    timestamp: request.headers['x-signature-timestamp'],
    rawBody,
  });
  if (!verified) {
    jsonResponse(response, 401, { error: 'Invalid Discord interaction signature.' });
    return true;
  }
  if (String(interaction?.application_id || '') !== config.applicationId) {
    jsonResponse(response, 401, { error: 'Discord interaction application does not match this deployment.' });
    return true;
  }
  if (config.pilotGuildId && String(interaction?.guild_id || '') !== config.pilotGuildId) {
    jsonResponse(response, 200, ephemeral('This command is currently restricted to the configured pilot Discord server.'));
    return true;
  }

  const stateStore = services?.stateStore || discordStateStore;
  let officerAuthorized = discordTbMemberHasOfficerPermission(interaction);
  if (!officerAuthorized) officerAuthorized = await discordTbMemberHasConfiguredOfficerRole(interaction, stateStore);
  if (!officerAuthorized) {
    jsonResponse(response, 200, ephemeral(`/tb ${subcommand} is restricted to Guild officers.`));
    return true;
  }

  jsonResponse(response, 200, deferredEphemeral());
  if (isStage10) scheduleStage10Response(interaction, config, { ...services, stateStore });
  else scheduleStage9Response(interaction, config, { ...services, stateStore });
  return true;
}
