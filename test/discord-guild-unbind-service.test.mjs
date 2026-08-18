import test from 'node:test';
import assert from 'node:assert/strict';
import { unbindDiscordGuildIntegration } from '../discord-guild-unbind-service.mjs';

const GUILD_UUID = '284efcdb-01ef-4ae9-989a-ca6a94952df4';
const DISCORD_GUILD = '123456789012345678';
const ACTOR = '223456789012345678';

function context(store, stateStore) {
  return {
    store,
    stateStore,
    discordGuildId: DISCORD_GUILD,
    seedAllyCode: '732764286',
    guild: { id: GUILD_UUID, name: 'Ludus Venatus' },
    guildState: {
      swgohAllyCode: '732764286',
      userLinks: { [ACTOR]: { swgohAllyCode: '732764286' } },
      memberPreferences: { a: {} },
      memberAvailability: { b: {} },
    },
  };
}

function fixture({ stage = 'idle' } = {}) {
  const calls = [];
  const store = {
    async select(table) {
      if (table === 'guild_operation_schedules') return [{ id: 'schedule-1', status: 'active', stage }];
      if (table === 'guild_discord_destinations') return [{ id: 'dest-1', destination_kind: 'channel', verified: true }];
      if (table === 'guild_operation_settings') return [{ guild_id: GUILD_UUID }];
      return [];
    },
    async update(table, filter, patch) { calls.push({ type: 'update', table, filter, patch }); return []; },
    async insert(table, rows) { calls.push({ type: 'insert', table, row: rows[0] }); return rows; },
  };
  const stateStore = {
    async readGuild() { return context(store, stateStore).guildState; },
    async unbindGuild(input) {
      calls.push({ type: 'state-unbind', input });
      return { linkedPlayers: 1 };
    },
  };
  const reservationStore = {
    status() { return { enabled: true, durable: true }; },
    async clearGuild(input) { calls.push({ type: 'hard-clear', input }); return { cleared: 2 }; },
  };
  return { store, stateStore, reservationStore, calls };
}

test('Guild unbind disarms delivery/schedules before clearing Discord-only state', async () => {
  const f = fixture();
  const result = await unbindDiscordGuildIntegration(context(f.store, f.stateStore), {
    store: f.store,
    stateStore: f.stateStore,
    reservationStore: f.reservationStore,
    actorDiscordUserId: ACTOR,
    now: () => new Date('2026-08-18T12:00:00Z'),
  });
  assert.equal(result.unbound, true);
  assert.equal(result.disabledDestinations, 1);
  assert.equal(result.pausedSchedules, 1);
  assert.equal(result.clearedDiscordLinks, 1);
  assert.equal(result.clearedHardReservations, 2);

  const destination = f.calls.findIndex((call) => call.type === 'update' && call.table === 'guild_discord_destinations');
  const schedule = f.calls.findIndex((call) => call.type === 'update' && call.table === 'guild_operation_schedules');
  const settings = f.calls.findIndex((call) => call.type === 'update' && call.table === 'guild_operation_settings');
  const audit = f.calls.findIndex((call) => call.type === 'insert' && call.table === 'guild_operations_audit_log');
  const hardClear = f.calls.findIndex((call) => call.type === 'hard-clear');
  const stateUnbind = f.calls.findIndex((call) => call.type === 'state-unbind');
  assert.ok(destination >= 0 && schedule >= 0 && settings >= 0 && audit >= 0 && hardClear >= 0 && stateUnbind >= 0);
  assert.ok(destination < stateUnbind && schedule < stateUnbind && settings < stateUnbind, 'future delivery must be disarmed before durable binding is cleared');
  assert.ok(hardClear < stateUnbind, 'hard reserves must clear before Guild binding disappears');
  assert.equal(f.calls[destination].patch.verified, false);
  assert.equal(f.calls[schedule].patch.status, 'paused');
  assert.equal(f.calls[settings].patch.default_delivery_mode, 'preview');
  assert.equal(f.calls[audit].row.action, 'discord-guild.unregister');
});

test('Guild unbind refuses to proceed while scheduled planning or publishing is in flight', async () => {
  for (const stage of ['syncing','planning','publishing']) {
    const f = fixture({ stage });
    await assert.rejects(
      unbindDiscordGuildIntegration(context(f.store, f.stateStore), {
        store: f.store,
        stateStore: f.stateStore,
        reservationStore: f.reservationStore,
        actorDiscordUserId: ACTOR,
      }),
      (error) => error?.code === 'SCHEDULE_IN_FLIGHT',
    );
    assert.equal(f.calls.length, 0, `${stage} must block every destructive mutation`);
  }
});

test('failure to clear configured hard-reservation storage leaves Guild delivery disarmed and state binding intact', async () => {
  const f = fixture();
  f.reservationStore = { status() { return { enabled: true, durable: true }; } };
  await assert.rejects(
    unbindDiscordGuildIntegration(context(f.store, f.stateStore), {
      store: f.store,
      stateStore: f.stateStore,
      reservationStore: f.reservationStore,
      actorDiscordUserId: ACTOR,
    }),
    (error) => error?.code === 'HARD_RESERVATION_CLEAR_UNAVAILABLE',
  );
  assert.ok(f.calls.some((call) => call.type === 'update' && call.table === 'guild_discord_destinations' && call.patch.verified === false));
  assert.ok(f.calls.some((call) => call.type === 'update' && call.table === 'guild_operation_schedules' && call.patch.status === 'paused'));
  assert.equal(f.calls.some((call) => call.type === 'state-unbind'), false, 'binding remains so an officer can retry safely');
});
