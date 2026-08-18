import { discordLocalizationStore } from './discord-localization-store.mjs';
import { normalizeDiscordLocale, t, languageName, formatLocaleNumber } from './discord-i18n.mjs';

const text = (value) => String(value ?? '').trim();
const snowflake = (value) => /^\d{16,22}$/.test(text(value)) ? text(value) : '';

function discordInteractionLocale(interaction = {}) {
  return normalizeDiscordLocale(interaction?.locale || interaction?.guild_locale || 'en');
}

async function durableGuildLocale(interaction, store) {
  const guildId = snowflake(interaction?.guild_id);
  if (!guildId || !store?.status?.()?.enabled || typeof store.getGuildLocale !== 'function') return '';
  try { return await store.getGuildLocale(guildId); }
  catch { return ''; }
}

async function durablePlayerLocale(interaction, store) {
  const guildId = snowflake(interaction?.guild_id);
  const userId = snowflake(interaction?.member?.user?.id || interaction?.user?.id);
  if (!guildId || !userId || !store?.status?.()?.enabled || typeof store.getUserLocale !== 'function') return '';
  try { return await store.getUserLocale(guildId, userId); }
  catch { return ''; }
}

export async function resolveDiscordLocale(interaction = {}, options = {}) {
  const store = options.store || discordLocalizationStore;
  const scope = options.scope === 'guild' ? 'guild' : 'player';
  const fallback = discordInteractionLocale(interaction);
  const guildLocale = await durableGuildLocale(interaction, store);
  if (scope === 'guild') return normalizeDiscordLocale(guildLocale || fallback);
  const playerLocale = await durablePlayerLocale(interaction, store);
  return normalizeDiscordLocale(playerLocale || guildLocale || fallback);
}

export async function discordTranslator(interaction = {}, options = {}) {
  const locale = await resolveDiscordLocale(interaction, options);
  return Object.freeze({
    locale,
    t: (key, params = {}) => t(locale, key, params),
    languageName: (value = locale) => languageName(value),
    number: (value) => formatLocaleNumber(locale, value),
  });
}

export function localizedSafeError(error, translator, title = 'Guild Operations') {
  const tx = translator?.t || ((key) => key);
  const message = text(error?.message || title).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const headline = tx('common.failed', { title });
  const disposition = error?.partialStateChanged
    ? tx('common.partialStateChanged', { disposition: text(error?.safeDisposition || 'safe retry required') })
    : tx('common.noStateChanged');
  return `**${tx('common.commandCenter')} · ${headline}**\n${message}\n${disposition}`.slice(0, 1900);
}
