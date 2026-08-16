import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuildSyncWorker } from '../guild-sync-worker.mjs';

const USER = '0f4c45c0-b8f6-4b22-aad7-56ad6390b010';
const GUILD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function storeFixture(jobs = []) {
  const updates = [];
  let claimed = false;
  return {
    updates,
    status() { return { configured: true }; },
    async rpc(name, args) {
      assert.equal(name, 'claim_guild_sync_jobs');
      assert.ok(args.p_worker_id);
      if (claimed) return [];
      claimed = true;
      return structuredClone(jobs);
    },
    async update(table, query, values) {
      updates.push({ table, query: structuredClone(query), values: structuredClone(values) });
      return null;
    },
  };
}

function job(overrides = {}) {
  return {
    id: 'job-1',
    guild_id: GUILD,
    requested_by_user_id: USER,
    requested_by_player_id: '11111111-1111-4111-8111-111111111111',
    status: 'running',
    attempt_count: 1,
    max_attempts: 3,
    claimed_by: 'worker-test',
    metadata: {},
    ...overrides,
  };
}

const env = {
  GUILD_SYNC_WORKER_ENABLED: 'true',
  GUILD_SYNC_WORKER_ID: 'worker-test',
  GUILD_SYNC_WORKER_BATCH_SIZE: '1',
  GUILD_SYNC_WORKER_POLL_MS: '15000',
  GUILD_SYNC_RETRY_BASE_SECONDS: '30',
};

test('worker revalidates through signed user persistence rather than trusting queued Guild id', async () => {
  const store = storeFixture([job()]);
  const seenUsers = [];
  const worker = createGuildSyncWorker(env, {
    store,
    persistence: {
      async sync(user) {
        seenUsers.push(user.id);
        return {
          ok: true,
          guild: { id: GUILD, name: 'Guild' },
          syncRunId: 'sync-1',
          membersStored: 50,
          unitsStored: 12000,
          activitySnapshotId: 10,
          capturedAt: '2026-08-17T05:00:00Z',
        };
      },
    },
    now: () => new Date('2026-08-17T05:00:00Z'),
  });

  const cycle = await worker.runOnce();
  assert.deepEqual(seenUsers, [USER]);
  assert.equal(cycle.claimed, 1);
  assert.equal(cycle.results[0].ok, true);
  assert.equal(store.updates.length, 1);
  assert.equal(store.updates[0].values.status, 'completed');
  assert.equal(store.updates[0].values.sync_run_id, 'sync-1');
});

test('worker refuses to complete a job when verified user resolves to another Guild', async () => {
  const store = storeFixture([job()]);
  const worker = createGuildSyncWorker(env, {
    store,
    persistence: {
      async sync() {
        return {
          ok: true,
          guild: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Other Guild' },
          syncRunId: 'sync-other',
          membersStored: 50,
          unitsStored: 12000,
        };
      },
    },
    now: () => new Date('2026-08-17T05:00:00Z'),
  });

  const cycle = await worker.runOnce();
  assert.equal(cycle.results[0].ok, false);
  assert.equal(cycle.results[0].disposition, 'retry');
  assert.equal(store.updates[0].values.status, 'queued');
  assert.match(store.updates[0].values.last_error, /different Guild/i);
  assert.equal(store.updates[0].values.sync_run_id, undefined);
});

test('unsigned scheduled jobs do not reuse another user implicitly', async () => {
  const store = storeFixture([job({ requested_by_user_id: null })]);
  let syncCalls = 0;
  const worker = createGuildSyncWorker(env, {
    store,
    persistence: { async sync() { syncCalls += 1; throw new Error('must not run'); } },
    now: () => new Date('2026-08-17T05:00:00Z'),
  });

  const cycle = await worker.runOnce();
  assert.equal(syncCalls, 0);
  assert.equal(cycle.results[0].ok, false);
  assert.equal(store.updates[0].values.status, 'queued');
  assert.match(store.updates[0].values.last_error, /signed-user requested Guild job/i);
});

test('job reaches failed state only after maximum claimed attempts', async () => {
  const store = storeFixture([job({ attempt_count: 3, max_attempts: 3 })]);
  const worker = createGuildSyncWorker(env, {
    store,
    persistence: { async sync() { throw new Error('persistent failure'); } },
    now: () => new Date('2026-08-17T05:00:00Z'),
  });

  const cycle = await worker.runOnce();
  assert.equal(cycle.results[0].disposition, 'failed');
  assert.equal(store.updates[0].values.status, 'failed');
  assert.equal(store.updates[0].values.completed_at, '2026-08-17T05:00:00.000Z');
});
