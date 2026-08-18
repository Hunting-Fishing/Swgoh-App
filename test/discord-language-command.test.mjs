import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDiscordLanguageCommand, languageCommandScope } from '../discord-language-command.mjs';

const GUILD = '123456789012345678';
const USER = '223456789012345678';

function interaction(command, language) {
  return {
    guild_id: GUILD,
    locale: 'en-US',
    member: { user: { id: USER } },
    data: {
      name: command,
      options: [{ type: 1, name: 'language', options: [{ type: 3, name: 'language', value: language }] }],
    },
  };
}

function fixture() {
  const calls = [];
  let guildLocale = 'en';
  let userLocale = '';
  const store = {
    status() { return { enabled: true, durable: true }; },
    async setGuildLocale(input) { calls.push(['guild', input]); guildLocale = input.locale; return input; },
    async setUserLocale(input) { calls.push(['user', input]); userLocale = input.locale; return input; },
    async clearUserLocale(input) { calls.push(['clear', input]); userLocale = ''; return { cleared: true }; },
    async getGuildLocale() { return guildLocale; },
    async getUserLocale() { return userLocale; },
  };
  return { store, calls };
}

test('language command scope distinguishes officer Guild language from player self-service language', () => {
  assert.equal(languageCommandScope(interaction('guild', 'es')), 'guild');
  assert.equal(languageCommandScope(interaction('tb', 'es')), 'player');
  assert.equal(languageCommandScope({ data: { name: 'tb', options: [{ type: 1, name: 'status' }] } }), '');
});

test('/guild language responds in the newly selected translated language', async () => {
  const f = fixture();
  const result = await executeDiscordLanguageCommand(interaction('guild', 'es'), { store: f.store });
  assert.equal(f.calls[0][0], 'guild');
  assert.equal(f.calls[0][1].locale, 'es');
  assert.match(result, /Idioma del gremio/);
  assert.match(result, /Español/);
});

test('/tb language responds in the player's newly selected translated language', async () => {
  const f = fixture();
  const result = await executeDiscordLanguageCommand(interaction('tb', 'fil'), { store: f.store });
  assert.equal(f.calls[0][0], 'user');
  assert.equal(f.calls[0][1].locale, 'fil');
  assert.match(result, /Wika ng Player/);
  assert.match(result, /Filipino/);
});

test('/tb language default clears personal override and responds in Guild language', async () => {
  const f = fixture();
  await f.store.setGuildLocale({ locale: 'fr' });
  const result = await executeDiscordLanguageCommand(interaction('tb', 'default'), { store: f.store });
  assert.equal(f.calls.at(-1)[0], 'clear');
  assert.match(result, /Langue du joueur/);
  assert.match(result, /préférence personnelle/);
});
