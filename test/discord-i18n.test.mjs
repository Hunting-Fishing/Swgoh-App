import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCORD_SUPPORTED_LOCALES, discordLocaleChoices, formatLocaleNumber, languageName, normalizeDiscordLocale, t } from '../discord-i18n.mjs';

test('Discord localization exposes only real translated catalogs', () => {
  assert.deepEqual(DISCORD_SUPPORTED_LOCALES, ['en','es','fr','de','fil']);
  const choices = discordLocaleChoices();
  assert.equal(choices.length, 5);
  assert.deepEqual(choices.map((row) => row.locale), DISCORD_SUPPORTED_LOCALES);
  assert.equal(languageName('es'), 'Español');
  assert.equal(languageName('fr'), 'Français');
  assert.equal(languageName('de'), 'Deutsch');
  assert.equal(languageName('fil'), 'Filipino');
});

test('Discord locale normalization handles Discord regional locales and falls back safely', () => {
  assert.equal(normalizeDiscordLocale('en-US'), 'en');
  assert.equal(normalizeDiscordLocale('es-419'), 'es');
  assert.equal(normalizeDiscordLocale('fr-CA'), 'fr');
  assert.equal(normalizeDiscordLocale('de-DE'), 'de');
  assert.equal(normalizeDiscordLocale('fil-PH'), 'fil');
  assert.equal(normalizeDiscordLocale('ja'), 'en');
});

test('translated messages interpolate data without translating SWGOH identity values', () => {
  const Spanish = t('es', 'guild.excludedDays', { player: 'Warm Bacon', allyCode: '732-764-286', days: 3, reason: ' · vacaciones' });
  assert.match(Spanish, /Warm Bacon/);
  assert.match(Spanish, /732-764-286/);
  assert.match(Spanish, /3/);
  assert.match(Spanish, /asignaciones de Operaciones/);
  assert.equal(t('de', 'guild.gp'), 'Gilden-GM');
  assert.equal(t('fil', 'guild.members'), 'Mga Miyembro');
});

test('missing translated keys fail safely to English then key', () => {
  assert.equal(t('es', 'guild.source'), 'Fuente');
  assert.equal(t('es', 'not.a.real.key'), 'not.a.real.key');
});

test('localized number formatting remains numeric data', () => {
  assert.match(formatLocaleNumber('en', 1234567), /1,234,567/);
  assert.ok(formatLocaleNumber('de', 1234567).replace(/\D/g, '') === '1234567');
});
