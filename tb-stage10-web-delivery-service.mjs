import { createTbStage10DiscordDeliveryService } from './tb-stage10-discord-delivery-service.mjs';

const text = (value) => String(value ?? '').trim();
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';
const phase = (value) => /^P[1-6]$/.test(text(value).toUpperCase()) ? text(value).toUpperCase() : '';

function serviceError(message, status = 400, code = 'TB_STAGE10_WEB_INVALID_REQUEST') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireContext(context = {}) {
  const guildId = text(context?.guild?.id || context?.guildId);
  const userId = text(context?.userId);
  const discordGuildId = snowflake(context?.discordGuildId);
  if (!guildId) throw serviceError('Guild context is required.', 400, 'GUILD_CONTEXT_REQUIRED');
  if (!userId) throw serviceError('Officer user context is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
  if (!discordGuildId) throw serviceError('Verified Discord Guild context is required for Stage 10 delivery.', 409, 'DISCORD_GUILD_REQUIRED');
  return Object.freeze({ ...context, guild: context.guild || { id: guildId }, userId, discordGuildId });
}

function option(name, value) {
  return value === undefined || value === null || value === '' ? null : { name, value };
}

function syntheticInteraction(context, input = {}, mode = 'preview') {
  const rotePhase = phase(input?.phase || input?.rotePhase);
  const version = Number(input?.versionNumber || input?.version || 0);
  if (!rotePhase || !Number.isInteger(version) || version < 1) {
    throw serviceError('A valid ROTE phase and immutable version number are required.', 400, 'STAGE10_VERSION_REQUIRED');
  }
  const mentions = input?.includeMentions === false ? 'off' : 'on';
  const channel = snowflake(input?.channelId);
  const values = [
    option('phase', rotePhase),
    option('version', version),
    option('mentions', mentions),
    option('channel', channel),
  ];
  if (mode === 'publish') {
    values.push(option('action', 'publish'));
    values.push(option('confirm', text(input?.confirm).toUpperCase()));
    values.push(option('hash', text(input?.planHash || input?.hash).toLowerCase()));
  }
  return Object.freeze({
    guild_id: context.discordGuildId,
    data: Object.freeze({
      options: Object.freeze([Object.freeze({
        type: 1,
        name: mode === 'publish' ? 'publish' : mode === 'status' ? 'status' : 'preview',
        options: Object.freeze(values.filter(Boolean).map((row) => Object.freeze(row))),
      })]),
    }),
  });
}

export function createTbStage10WebDeliveryService(options = {}) {
  const stage10Factory = options.stage10Factory || createTbStage10DiscordDeliveryService;
  const stage10Options = options.stage10Options || {};

  function stage10For(contextInput = {}) {
    const context = requireContext(contextInput);
    const contextResolver = Object.freeze({ resolve: async () => context });
    return Object.freeze({
      context,
      service: stage10Factory({ ...stage10Options, contextResolver }),
    });
  }

  async function preview(contextInput = {}, input = {}) {
    const resolved = stage10For(contextInput);
    return resolved.service.preview(syntheticInteraction(resolved.context, input, 'preview'));
  }

  async function publish(contextInput = {}, input = {}) {
    const resolved = stage10For(contextInput);
    if (text(input?.confirm).toUpperCase() !== 'PUBLISH') {
      throw serviceError('Explicit confirm:PUBLISH is required before website Stage 10 delivery.', 400, 'STAGE10_EXPLICIT_CONFIRMATION_REQUIRED');
    }
    const hash = text(input?.planHash || input?.hash).toLowerCase();
    if (!/^[0-9a-f]{12,64}$/.test(hash)) {
      throw serviceError('Stage 10 website delivery requires the approved immutable hash or its 12+ character prefix.', 400, 'STAGE10_HASH_CONFIRMATION_REQUIRED');
    }
    return resolved.service.publish(syntheticInteraction(resolved.context, { ...input, planHash: hash }, 'publish'));
  }

  async function status(contextInput = {}, input = {}) {
    const resolved = stage10For(contextInput);
    return resolved.service.status(syntheticInteraction(resolved.context, input, 'status'));
  }

  return Object.freeze({ preview, publish, status, syntheticInteraction });
}

export const tbStage10WebDeliveryService = createTbStage10WebDeliveryService();
