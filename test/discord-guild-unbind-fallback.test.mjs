import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiscordGuildAllyCode } from '../discord-tb-live.mjs';

const GUILD = '123456789012345678';

function stateStore(value) {
  return {
    status() { return { enabled: true, durable: true }; },
    async readGuild() { return value; },
  };
}

test('durable unbound Guild state blocks configured pilot Ally Code fallback', async () => {
  await assert.rejects(
    resolveDiscordGuildAllyCode({
      allyCode: '732764286',
      interaction: { guild_id: GUILD },
      stateStore: stateStore({ discordGuildId: GUILD, swgohAllyCode: '', userLinks: {}, updatedAt: '2026-08-18T12:00:00Z' }),
    }),
    (error) => error?.code === 'DISCORD_GUILD_EXPLICITLY_UNBOUND',
  );
});

test('absence of any durable Guild record may still use explicitly configured pilot fallback', async () => {
  const result = await resolveDiscordGuildAllyCode({
    allyCode: '732764286',
    interaction: { guild_id: GUILD },
    stateStore: stateStore(null),
  });
  assert.equal(result.allyCode, '732764286');
  assert.equal(result.source, 'explicit-fallback');
});

test('a new durable /tb setup binding overrides any pilot fallback', async () => {
  const result = await resolveDiscordGuildAllyCode({
    allyCode: '111222333',
    interaction: { guild_id: GUILD },
    stateStore: stateStore({ discordGuildId: GUILD, swgohAllyCode: '732764286' }),
  });
  assert.equal(result.allyCode, '732764286');
  assert.equal(result.source, 'durable-guild-binding');
});
