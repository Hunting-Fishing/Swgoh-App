import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildOperationScheduleService, zonedLocalToIso } from '../guild-operation-schedule-service.mjs';
import { createGuildOperationScheduleWorker } from '../guild-operation-schedule-worker.mjs';

const PLAN_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_ID = '22222222-2222-4222-8222-222222222222';

test('server interprets the first run in the selected IANA timezone, not the browser timezone', () => {
  const iso = zonedLocalToIso('2026-08-20T10:00', 'America/Phoenix', () => new Date('2026-08-18T00:00:00Z'));
  assert.equal(iso, '2026-08-20T17:00:00.000Z');
});

test('server rejects nonexistent daylight-saving local times', () => {
  assert.throws(
    () => zonedLocalToIso('2026-03-08T02:30', 'America/New_York', () => new Date('2026-03-01T00:00:00Z')),
    (error) => error?.code === 'NONEXISTENT_LOCAL_TIME',
  );
});

test('schedule save persists timezone-authoritative first run and local recurrence clock', async () => {
  let inserted = null;
  const store = {
    status() { return { configured: true }; },
    async select() { return []; },
    async insert(_table, rows) {
      inserted = rows[0];
      return [{ id: SCHEDULE_ID, ...rows[0], created_at: '2026-08-18T00:00:00Z', updated_at: rows[0].updated_at }];
    },
    async update() { return []; },
    async delete() {},
  };
  const operations = {
    async requireOfficer(userId, code) {
      return { userId, code, guild: { id: 'guild-1' }, membership: { player_id: 'player-1' } };
    },
    async getTbPlanDetail() { return { plan: { id: PLAN_ID }, rules: [], preAssignments: [] }; },
    async getWorkspace() { return { twPlans: [] }; },
  };
  const service = createGuildOperationScheduleService({ store, operations, now: () => new Date('2026-08-18T00:00:00Z') });
  await service.save('user-1', '732764286', {
    runType: 'tb',
    planId: PLAN_ID,
    name: 'Phoenix 10 AM ROTE',
    recurrenceKind: 'daily',
    scheduledTimezone: 'America/Phoenix',
    scheduledLocalDateTime: '2026-08-20T10:00',
    nextRunAt: '2026-08-20T02:00:00Z',
  });
  assert.equal(inserted.next_run_at, '2026-08-20T17:00:00.000Z', 'server must ignore the browser-derived instant when local timezone data is supplied');
  assert.equal(inserted.scheduled_local_time, '10:00:00');
  assert.equal(inserted.scheduled_timezone, 'America/Phoenix');
});

test('due schedule queues a forced canonical Guild refresh before any assignment execution', async () => {
  const inserts = [];
  const updates = [];
  let executorCalls = 0;
  const store = {
    status() { return { configured: true }; },
    async select(table) {
      if (table === 'guild_sync_jobs') return [];
      return [];
    },
    async insert(table, rows) {
      inserts.push({ table, row: rows[0] });
      if (table === 'guild_sync_jobs') return [{ id: 'sync-job-1', ...rows[0] }];
      return rows;
    },
    async update(table, filter, patch) { updates.push({ table, filter, patch }); return []; },
    async rpc() { return []; },
  };
  const worker = createGuildOperationScheduleWorker({}, {
    store,
    executor: { async execute() { executorCalls += 1; return { runId: 'run-1', published: true }; } },
    now: () => new Date('2026-08-18T00:00:00Z'),
  });
  const result = await worker.process({
    id: SCHEDULE_ID,
    guild_id: 'guild-1',
    created_by_user_id: 'user-1',
    requested_by_player_id: 'player-1',
    run_type: 'tb',
    plan_id: PLAN_ID,
    next_run_at: '2026-08-18T00:00:00Z',
    stage: 'idle',
  });
  assert.equal(result.stage, 'syncing');
  assert.equal(executorCalls, 0);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, 'guild_sync_jobs');
  assert.equal(inserts[0].row.force_refresh, true);
  assert.equal(inserts[0].row.include_activity, true);
  assert.ok(updates.some((entry) => entry.table === 'guild_operation_schedules' && entry.patch.stage === 'syncing'));
});
