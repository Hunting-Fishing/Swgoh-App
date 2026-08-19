import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscordTbPlanVersionService } from '../discord-tb-plan-version-service.mjs';

const GUILD = '11111111-1111-4111-8111-111111111111';
const WEB_USER = '22222222-2222-4222-8222-222222222222';
const DISCORD_GUILD = '987654321098765432';
const DISCORD_USER = '111111111111111111';

function interaction() {
  return {
    guild_id: DISCORD_GUILD,
    member: { user: { id: DISCORD_USER } },
  };
}

function stateStore() {
  return {
    status: () => ({ enabled: true, durable: true, reason: 'ready' }),
    readGuild: async (guildId) => {
      assert.equal(guildId, DISCORD_GUILD);
      return { swgohAllyCode: '732764286' };
    },
  };
}

function store({ socialIdentity = true } = {}) {
  return {
    async select(table, query) {
      if (table === 'players') {
        assert.equal(query.ally_code, 'eq.732764286');
        return [{ id: 'player-id', ally_code: '732764286', current_guild_id: GUILD }];
      }
      if (table === 'guilds') {
        assert.equal(query.id, `eq.${GUILD}`);
        return [{ id: GUILD, swgoh_guild_id: 'game-guild', name: 'Ludus Venatus', member_count: 50 }];
      }
      if (table === 'user_social_identities') {
        assert.equal(query.provider, 'eq.discord');
        assert.equal(query.provider_user_id, `eq.${DISCORD_USER}`);
        return socialIdentity ? [{ user_id: WEB_USER, provider: 'discord', provider_user_id: DISCORD_USER }] : [];
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test('Discord bridge resolves durable Guild and passes both web and Discord actor identities when linked', async () => {
  let captured = null;
  const service = createDiscordTbPlanVersionService({
    stateStore: stateStore(),
    store: store({ socialIdentity: true }),
    versionService: {
      createVersionForContext: async (context, input) => {
        captured = { context, input };
        return { id: 'version-id' };
      },
    },
  });

  const result = await service.createVersion(interaction(), { phase: 'P6', assignments: [], unfilled: [] });
  assert.equal(result.id, 'version-id');
  assert.equal(captured.context.guild.id, GUILD);
  assert.equal(captured.context.guild.name, 'Ludus Venatus');
  assert.equal(captured.context.userId, WEB_USER);
  assert.equal(captured.context.actorDiscordUserId, DISCORD_USER);
  assert.equal(captured.context.discordGuildId, DISCORD_GUILD);
  assert.equal(captured.input.phase, 'P6');
});

test('Discord-authorized officer does not require a linked web account for immutable audit identity', async () => {
  let captured = null;
  const service = createDiscordTbPlanVersionService({
    stateStore: stateStore(),
    store: store({ socialIdentity: false }),
    versionService: {
      approveVersionForContext: async (context, runId, hash, reason) => {
        captured = { context, runId, hash, reason };
        return { run: { id: runId }, approval: { decision: 'approved' } };
      },
    },
  });

  await service.approveVersion(interaction(), '33333333-3333-4333-8333-333333333333', 'a'.repeat(12), 'Discord-only officer');
  assert.equal(captured.context.userId, '');
  assert.equal(captured.context.actorDiscordUserId, DISCORD_USER);
  assert.equal(captured.context.guild.id, GUILD);
  assert.equal(captured.reason, 'Discord-only officer');
});

test('Discord bridge fails closed when durable Guild binding is unavailable', async () => {
  const service = createDiscordTbPlanVersionService({
    stateStore: {
      status: () => ({ enabled: false, durable: false }),
      readGuild: async () => null,
    },
    store: store(),
    versionService: { listVersionsForContext: async () => [] },
  });

  await assert.rejects(
    service.listVersions(interaction(), { phase: 'P6' }),
    /Durable Discord Guild state is unavailable/,
  );
});

test('Discord bridge fails closed when canonical Guild identity cannot be resolved', async () => {
  const service = createDiscordTbPlanVersionService({
    stateStore: stateStore(),
    store: {
      async select(table) {
        if (table === 'players') return [{ id: 'player-id', ally_code: '732764286', current_guild_id: GUILD }];
        if (table === 'guilds') return [];
        return [];
      },
    },
    versionService: { listVersionsForContext: async () => [] },
  });

  await assert.rejects(
    service.listVersions(interaction(), { phase: 'P6' }),
    /Canonical Guild identity is unavailable/,
  );
});
