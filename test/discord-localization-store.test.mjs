import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDiscordLocalizationStore } from '../discord-localization-store.mjs';
import { resolveDiscordLocale } from '../discord-localization.mjs';

const GUILD = '123456789012345678';
const USER = '223456789012345678';
const ACTOR = '323456789012345678';

async function withStore(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'swgoh-localization-'));
  let counter = 0;
  const store = createDiscordLocalizationStore({ SWGOH_STATE_DIR: dir, SWGOH_STATE_STORAGE_CONFIRMED_DURABLE: 'true' }, {
    randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`,
    now: () => new Date('2026-08-18T12:00:00Z'),
  });
  try { await run(store); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

function interaction(locale = 'fr') {
  return { guild_id: GUILD, locale, guild_locale: locale, member: { user: { id: USER } } };
}

test('player locale overrides Guild locale, which overrides Discord locale', async () => {
  await withStore(async (store) => {
    assert.equal(await resolveDiscordLocale(interaction('fr'), { store, scope: 'player' }), 'fr');
    await store.setGuildLocale({ discordGuildId: GUILD, locale: 'de', actorDiscordUserId: ACTOR });
    assert.equal(await resolveDiscordLocale(interaction('fr'), { store, scope: 'guild' }), 'de');
    assert.equal(await resolveDiscordLocale(interaction('fr'), { store, scope: 'player' }), 'de');
    await store.setUserLocale({ discordGuildId: GUILD, discordUserId: USER, locale: 'es', actorDiscordUserId: USER });
    assert.equal(await resolveDiscordLocale(interaction('fr'), { store, scope: 'player' }), 'es');
    assert.equal(await resolveDiscordLocale(interaction('fr'), { store, scope: 'guild' }), 'de');
  });
});

test('clearing player locale falls back to durable Guild language', async () => {
  await withStore(async (store) => {
    await store.setGuildLocale({ discordGuildId: GUILD, locale: 'fil', actorDiscordUserId: ACTOR });
    await store.setUserLocale({ discordGuildId: GUILD, discordUserId: USER, locale: 'es', actorDiscordUserId: USER });
    await store.clearUserLocale({ discordGuildId: GUILD, discordUserId: USER, actorDiscordUserId: USER });
    assert.equal(await resolveDiscordLocale(interaction('fr'), { store, scope: 'player' }), 'fil');
  });
});

test('Guild localization clear resets Guild to English and removes user overrides while preserving audit', async () => {
  await withStore(async (store) => {
    await store.setGuildLocale({ discordGuildId: GUILD, locale: 'de', actorDiscordUserId: ACTOR });
    await store.setUserLocale({ discordGuildId: GUILD, discordUserId: USER, locale: 'es', actorDiscordUserId: USER });
    const previous = await store.clearGuild({ discordGuildId: GUILD, actorDiscordUserId: ACTOR });
    assert.equal(previous.locale, 'de');
    assert.equal(previous.userLocales, 1);
    assert.equal(await store.getGuildLocale(GUILD), 'en');
    assert.equal(await store.getUserLocale(GUILD, USER), '');
    const state = await store.readState();
    assert.equal(state.audit.at(-1).action, 'guild-localization-cleared');
  });
});
