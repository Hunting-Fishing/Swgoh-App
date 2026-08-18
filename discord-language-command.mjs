import { discordLocalizationStore } from './discord-localization-store.mjs';
import { languageName, normalizeDiscordLocale, t } from './discord-i18n.mjs';
import { resolveDiscordLocale } from './discord-localization.mjs';

const text = (value) => String(value ?? '').trim();
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';
const array = (value) => Array.isArray(value) ? value : [];

function activeSubcommand(interaction = {}) {
  return array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2) || null;
}
function option(interaction, name) {
  return array(activeSubcommand(interaction)?.options).find((row) => text(row?.name).toLowerCase() === text(name).toLowerCase())?.value ?? null;
}

export function languageCommandScope(interaction = {}) {
  const command = text(interaction?.data?.name).toLowerCase();
  const subcommand = text(activeSubcommand(interaction)?.name).toLowerCase();
  if (subcommand !== 'language') return '';
  if (command === 'guild') return 'guild';
  if (command === 'tb') return 'player';
  return '';
}

function requireDurable(store) {
  const status = store?.status?.();
  if (status?.enabled && status?.durable) return;
  const error = new Error('Durable Discord language preferences are unavailable on this deployment.');
  error.code = 'DISCORD_LOCALIZATION_STATE_DISABLED';
  throw error;
}

export async function executeDiscordLanguageCommand(interaction, options = {}) {
  const store = options.store || discordLocalizationStore;
  const scope = languageCommandScope(interaction);
  if (!scope) throw new Error('Unsupported Discord language command.');
  requireDurable(store);

  const guildId = snowflake(interaction?.guild_id);
  const userId = snowflake(interaction?.member?.user?.id || interaction?.user?.id);
  if (!guildId) throw new Error('Language preferences must be changed inside a Discord server.');
  if (scope === 'player' && !userId) throw new Error('A Discord user identity is required for a player language preference.');

  const requested = text(option(interaction, 'language')).toLowerCase();
  if (scope === 'guild') {
    const locale = normalizeDiscordLocale(requested);
    await store.setGuildLocale({ discordGuildId: guildId, locale, actorDiscordUserId: userId });
    return `**${t(locale, 'common.commandCenter')} · ${t(locale, 'language.guildTitle')}**\n${t(locale, 'language.guildSet', { language: languageName(locale) })}`;
  }

  if (requested === 'default') {
    await store.clearUserLocale({ discordGuildId: guildId, discordUserId: userId, actorDiscordUserId: userId });
    const locale = await resolveDiscordLocale(interaction, { store, scope: 'player' });
    return `**${t(locale, 'common.commandCenter')} · ${t(locale, 'language.playerTitle')}**\n${t(locale, 'language.playerReset')}`;
  }

  const locale = normalizeDiscordLocale(requested);
  await store.setUserLocale({ discordGuildId: guildId, discordUserId: userId, locale, actorDiscordUserId: userId });
  return `**${t(locale, 'common.commandCenter')} · ${t(locale, 'language.playerTitle')}**\n${t(locale, 'language.playerSet', { language: languageName(locale) })}`;
}
