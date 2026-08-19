import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscordStage9OfficerContextResolver } from '../discord-stage9-officer-context.mjs';

const interaction = {
  guild_id: '123456789012345678',
  member: { user: { id: '234567890123456789' } },
};

function makeStore(options = {}) {
  return {
    async select(table, query) {
      if (table === 'user_social_identities') {
        if (options.noIdentity) return [];
        assert.equal(query.provider, 'eq.discord');
        assert.equal(query.provider_user_id, 'eq.234567890123456789');
        return [{ user_id: '11111111-1111-4111-8111-111111111111', provider: 'discord', provider_user_id: '234567890123456789', display_name: 'Officer One' }];
      }
      if (table === 'players') {
        return [{ id: 'player-seed', ally_code: '123456789', current_guild_id: options.noGuild ? null : '22222222-2222-4222-8222-222222222222' }];
      }
      if (table === 'guilds') {
        return [{ id: '22222222-2222-4222-8222-222222222222', swgoh_guild_id: 'swgoh-guild-1', name: 'Test Guild', member_count: 50, galactic_power: 600000000 }];
      }
      if (table === 'guild_user_memberships') {
        if (options.noMembership) return [];
        return [{ guild_id: '22222222-2222-4222-8222-222222222222', user_id: '11111111-1111-4111-8111-111111111111', player_id: 'player-1', role: options.role || 'officer', status: options.membershipStatus || 'active' }];
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function makeStateStore(options = {}) {
  return {
    status() { return { enabled: options.enabled !== false, durable: options.durable !== false }; },
    async readGuild(guildId) {
      assert.equal(guildId, '123456789012345678');
      return options.unbound ? {} : { swgohAllyCode: '123-456-789' };
    },
  };
}

test('resolves signed Discord actor to real Command Center UUID and active officer membership', async () => {
  const resolver = createDiscordStage9OfficerContextResolver({ store: makeStore(), stateStore: makeStateStore() });
  const result = await resolver.resolve(interaction);

  assert.equal(result.userId, '11111111-1111-4111-8111-111111111111');
  assert.equal(result.guild.id, '22222222-2222-4222-8222-222222222222');
  assert.equal(result.guild.name, 'Test Guild');
  assert.equal(result.role, 'officer');
  assert.equal(result.discordUserId, '234567890123456789');
  assert.equal(result.seedAllyCode, '123456789');
});

test('fails closed when Discord OAuth identity is not linked to a Command Center account', async () => {
  const resolver = createDiscordStage9OfficerContextResolver({ store: makeStore({ noIdentity: true }), stateStore: makeStateStore() });
  await assert.rejects(
    () => resolver.resolve(interaction),
    (error) => error?.code === 'COMMAND_CENTER_DISCORD_IDENTITY_REQUIRED',
  );
});

test('fails closed when linked Command Center account is not an active Guild officer', async () => {
  let resolver = createDiscordStage9OfficerContextResolver({ store: makeStore({ role: 'member' }), stateStore: makeStateStore() });
  await assert.rejects(
    () => resolver.resolve(interaction),
    (error) => error?.code === 'COMMAND_CENTER_OFFICER_REQUIRED',
  );

  resolver = createDiscordStage9OfficerContextResolver({ store: makeStore({ noMembership: true }), stateStore: makeStateStore() });
  await assert.rejects(
    () => resolver.resolve(interaction),
    (error) => error?.code === 'COMMAND_CENTER_OFFICER_REQUIRED',
  );
});

test('fails closed when Discord Guild state is unavailable or not bound', async () => {
  let resolver = createDiscordStage9OfficerContextResolver({ store: makeStore(), stateStore: makeStateStore({ durable: false }) });
  await assert.rejects(
    () => resolver.resolve(interaction),
    (error) => error?.code === 'DISCORD_GUILD_STATE_UNAVAILABLE',
  );

  resolver = createDiscordStage9OfficerContextResolver({ store: makeStore(), stateStore: makeStateStore({ unbound: true }) });
  await assert.rejects(
    () => resolver.resolve(interaction),
    (error) => error?.code === 'DISCORD_GUILD_NOT_BOUND',
  );
});
