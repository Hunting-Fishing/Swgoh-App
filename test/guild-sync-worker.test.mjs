import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuildSyncWorker } from '../guild-sync-worker.mjs';

const USER = '0f4c45c0-b8f6-4b22-aad7-56ad6390b010';
const GUILD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function storeFixture(jobs = [], { recovered = 0 } = {}) {
  const updates = [];
  const rpcCalls = [];
  let claimed = false;
  return {
    updates,
    rpcCalls,
    status() { return { configured: true }; },
    async rpc(name, args) {
      rpcCalls.push({ name, args: structuredClone(args) });
      if (name === 'recover_stale_guild_sync_jobs') return recovered;
      if (name === 'claim_guild_sync_jobs') {
        assert.ok(args.p_worker_id);
        if (claimed) return [];
        claimed = true;
        return structuredClone(jobs);
      }
      throw new Error(`Unexpected RPC ${name}`);
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
  GUILD_SYNC_WORKER_HEARTBEAT_MS: '20000',
  GUILD_SYNC_STALE_LEASE_SECONDS: '90',
  GUILD_SYNC_JOB_TIMEOUT_MS: '180000',
};

test('worker recovers stale leases before claiming queued work', async () => {
  const store = storeFixture([], { recovered: 2 });
  const worker = createGuildSyncWorker(env, {
    store,
    persistence: { async sync() { throw new Error('must not run'); } },
  });

  const cycle = await worker.runOnce();
  assert.equal(cycle.recovered, 2);
  assert.equal(cycle.claimed, 0);
  assert.deepEqual(store.rpcCalls.map((call) => call.name), [
    'recover_stale_guild_sync_jobs',
    'claim_guild_sync_jobs',
  ]);
  assert.equal(store.rpcCalls[0].args.p_stale_seconds, 90);
});

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

test('hard timeout keeps lease running, records error, then terminates worker for safe stale recovery', async () => {
  const store = storeFixture([job()]);
  const terminated = [];
  const timers = [];
  const worker = createGuildSyncWorker(env, {
    store,
    persistence: { async sync() { return new Promise(() => {}); } },
    now: () => new Date('2026-08-17T05:00:00Z'),
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(fn) {
      timers.push(fn);
      queueMicrotask(fn);
      return 2;
    },
    clearTimeout() {},
    terminate(code) { terminated.push(code); },
    logger: { log() {}, warn() {}, error() {} },
  });

  const cycle = await worker.runOnce();
  assert.equal(timers.length, 1);
  assert.equal(cycle.results[0].ok, false);
  assert.equal(cycle.results[0].disposition, 'terminated');
  assert.deepEqual(terminated, [1]);
  assert.equal(store.updates.length, 1);
  assert.match(store.updates[0].values.last_error, /hard limit/i);
  assert.equal(store.updates[0].values.status, undefined, 'timeout must not requeue while old process still owns the request');
  assert.equal(store.updates[0].values.claimed_by, undefined);
});

test('worker status exposes lease safety settings without secrets', () => {
  const worker = createGuildSyncWorker(env, {
    store: storeFixture([]),
    persistence: { async sync() { return null; } },
  });
  const status = worker.status();
  assert.equal(status.heartbeatMs, 20000);
  assert.equal(status.staleLeaseSeconds, 90);
  assert.equal(status.jobTimeoutMs, 180000);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});
