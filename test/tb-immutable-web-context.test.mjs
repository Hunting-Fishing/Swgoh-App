import test from 'node:test';
import assert from 'node:assert/strict';

import { createTbImmutableWebContextResolver } from '../tb-immutable-web-context.mjs';

function fixture(binding = null) {
  const calls = [];
  const service = {
    async requireOfficer(userId, code) {
      calls.push(['officer', userId, code]);
      return { guild: { id: 'guild-1', name: 'Test Guild' }, userId, role: 'officer' };
    },
  };
  const delivery = {
    async resolveBinding(guildId) {
      calls.push(['binding', guildId]);
      return binding;
    },
  };
  return { resolver: createTbImmutableWebContextResolver({ service, delivery }), calls };
}

test('website immutable planning works without Discord and uses the authorized lookup Ally Code', async () => {
  const { resolver, calls } = fixture(null);
  const context = await resolver.planning('user-1', '732-764-286');

  assert.deepEqual(calls, [
    ['officer', 'user-1', '732764286'],
    ['binding', 'guild-1'],
  ]);
  assert.equal(context.guild.id, 'guild-1');
  assert.equal(context.userId, 'user-1');
  assert.equal(context.seedAllyCode, '732764286');
  assert.equal(context.discordBound, false);
  assert.equal(context.discordGuildId, '');
});

test('verified Discord binding augments website planning with its trusted Guild seed', async () => {
  const { resolver } = fixture({
    discordGuildId: '123456789012345678',
    guildState: { swgohAllyCode: '111222333' },
  });
  const context = await resolver.planning('user-1', '732764286');

  assert.equal(context.seedAllyCode, '111222333');
  assert.equal(context.discordGuildId, '123456789012345678');
  assert.equal(context.discordBound, true);
});

test('Stage 10 delivery requires Discord without invalidating website planning', async () => {
  const { resolver } = fixture(null);
  const planning = await resolver.planning('user-1', '732764286');
  assert.equal(planning.discordBound, false);

  await assert.rejects(
    () => resolver.deliveryContext('user-1', '732764286'),
    (error) => error?.status === 409 && error?.code === 'TB_STAGE10_VERIFIED_BINDING_REQUIRED' && /plan remains valid/i.test(error.message),
  );
});

test('configured Discord identity is rejected if its SWGOH seed is incomplete', async () => {
  const { resolver } = fixture({
    discordGuildId: '123456789012345678',
    guildState: { swgohAllyCode: '' },
  });

  await assert.rejects(
    () => resolver.planning('user-1', '732764286'),
    (error) => error?.status === 409 && error?.code === 'TB_IMMUTABLE_DISCORD_BINDING_INCOMPLETE',
  );
});

test('authorization is evaluated before any Discord binding lookup', async () => {
  const calls = [];
  const resolver = createTbImmutableWebContextResolver({
    service: {
      async requireOfficer() {
        calls.push('officer');
        const error = new Error('Officer access required');
        error.status = 403;
        error.code = 'GUILD_OFFICER_REQUIRED';
        throw error;
      },
    },
    delivery: {
      async resolveBinding() {
        calls.push('binding');
        return null;
      },
    },
  });

  await assert.rejects(() => resolver.planning('user-1', '732764286'), /Officer access required/);
  assert.deepEqual(calls, ['officer']);
});
