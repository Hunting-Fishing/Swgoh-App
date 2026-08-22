const text = (value) => String(value ?? '').trim();
const allyCode = (value) => {
  const digits = text(value).replace(/\D/g, '');
  return /^\d{9}$/.test(digits) ? digits : '';
};
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';

function contextError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function createTbImmutableWebContextResolver(options = {}) {
  const service = options.service;
  const delivery = options.delivery;
  if (!service?.requireOfficer) throw new TypeError('TB immutable web context requires an officer service.');
  if (!delivery?.resolveBinding) throw new TypeError('TB immutable web context requires the Guild Discord binding resolver.');

  async function planning(userIdInput, allyCodeInput) {
    const userId = text(userIdInput);
    const lookupAllyCode = allyCode(allyCodeInput);
    if (!userId) throw contextError('A signed-in officer user is required.', 401, 'OFFICER_CONTEXT_REQUIRED');
    if (!lookupAllyCode) throw contextError('A valid 9-digit Guild lookup Ally Code is required.', 400, 'INVALID_ALLY_CODE');

    // requireOfficer is the website authorization boundary. The browser-provided Ally Code
    // is never sufficient by itself; this call proves the signed-in user may operate on the
    // Guild resolved from that player.
    const officer = await service.requireOfficer(userId, lookupAllyCode);
    if (!officer?.guild?.id) throw contextError('Officer Guild context is unavailable.', 409, 'GUILD_CONTEXT_REQUIRED');

    // Discord is optional for planning. resolveBinding returns null when the Guild has no
    // verified Discord integration. If it returns a real binding, Stage 9 will include its
    // durable controls and retain fail-closed semantics for those configured controls.
    const binding = await delivery.resolveBinding(officer.guild.id);
    const discordGuildId = snowflake(binding?.discordGuildId);
    const boundSeedAllyCode = allyCode(binding?.guildState?.swgohAllyCode);
    if (discordGuildId && !boundSeedAllyCode) {
      throw contextError(
        'The verified Discord Guild binding is incomplete and cannot be used safely for immutable planning.',
        409,
        'TB_IMMUTABLE_DISCORD_BINDING_INCOMPLETE',
      );
    }

    return Object.freeze({
      guild: officer.guild,
      userId,
      seedAllyCode: boundSeedAllyCode || lookupAllyCode,
      discordGuildId,
      discordBound: Boolean(discordGuildId),
    });
  }

  async function deliveryContext(userId, code) {
    const context = await planning(userId, code);
    if (!context.discordBound) {
      throw contextError(
        'Discord publication requires a verified Discord Guild binding. The immutable plan remains valid and can still be reviewed or approved on the website.',
        409,
        'TB_STAGE10_VERIFIED_BINDING_REQUIRED',
      );
    }
    return context;
  }

  return Object.freeze({ planning, deliveryContext });
}
