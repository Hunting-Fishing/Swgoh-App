import os from 'node:os';
import { guildPersistence } from './guild-persistence.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

function clean(value) {
  return String(value || '').trim();
}

function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function configFromEnv(env = process.env) {
  const hostname = clean(env.RAILWAY_REPLICA_ID || env.HOSTNAME || os.hostname() || 'worker');
  return Object.freeze({
    enabled: ['1', 'true', 'yes', 'on'].includes(clean(env.GUILD_SYNC_WORKER_ENABLED || 'true').toLowerCase()),
    workerId: clean(env.GUILD_SYNC_WORKER_ID) || `guild-sync:${hostname}:${process.pid}`,
    pollMs: positiveInteger(env.GUILD_SYNC_WORKER_POLL_MS, 15_000, 2_000, 300_000),
    batchSize: positiveInteger(env.GUILD_SYNC_WORKER_BATCH_SIZE, 1, 1, 10),
    retryBaseSeconds: positiveInteger(env.GUILD_SYNC_RETRY_BASE_SECONDS, 30, 5, 3600),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  return clean(error?.message || error || 'Guild sync worker failed.').slice(0, 1000);
}

export function createGuildSyncWorker(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const store = options.store || supabaseCoreStore;
  const persistence = options.persistence || guildPersistence;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const sleeper = typeof options.sleep === 'function' ? options.sleep : sleep;
  const logger = options.logger || console;
  let stopped = false;

  function status() {
    return Object.freeze({
      enabled: config.enabled,
      workerId: config.workerId,
      pollMs: config.pollMs,
      batchSize: config.batchSize,
      persistenceConfigured: Boolean(store.status?.().configured),
    });
  }

  async function claim() {
    const rows = await store.rpc('claim_guild_sync_jobs', {
      p_worker_id: config.workerId,
      p_limit: config.batchSize,
    });
    return Array.isArray(rows) ? rows : rows ? [rows] : [];
  }

  async function markCompleted(job, result) {
    await store.update('guild_sync_jobs', {
      id: `eq.${job.id}`,
      status: 'eq.running',
      claimed_by: `eq.${config.workerId}`,
    }, {
      status: 'completed',
      completed_at: now().toISOString(),
      sync_run_id: result.syncRunId || null,
      last_error: null,
      updated_at: now().toISOString(),
      metadata: {
        ...(job.metadata && typeof job.metadata === 'object' ? job.metadata : {}),
        workerResult: {
          membersStored: Number(result.membersStored || 0),
          unitsStored: Number(result.unitsStored || 0),
          activitySnapshotId: result.activitySnapshotId || null,
          capturedAt: result.capturedAt || null,
        },
      },
    }, { returning: false });
  }

  async function markFailedOrRetry(job, error) {
    const attempts = Number(job.attempt_count || 0);
    const maxAttempts = Math.max(1, Number(job.max_attempts || 3));
    const message = errorText(error);
    const timestamp = now();

    if (attempts >= maxAttempts) {
      await store.update('guild_sync_jobs', {
        id: `eq.${job.id}`,
        status: 'eq.running',
        claimed_by: `eq.${config.workerId}`,
      }, {
        status: 'failed',
        completed_at: timestamp.toISOString(),
        last_error: message,
        updated_at: timestamp.toISOString(),
      }, { returning: false });
      return 'failed';
    }

    const delaySeconds = Math.min(3600, config.retryBaseSeconds * (2 ** Math.max(0, attempts - 1)));
    await store.update('guild_sync_jobs', {
      id: `eq.${job.id}`,
      status: 'eq.running',
      claimed_by: `eq.${config.workerId}`,
    }, {
      status: 'queued',
      run_after: new Date(timestamp.getTime() + delaySeconds * 1000).toISOString(),
      claimed_at: null,
      claimed_by: null,
      last_error: message,
      completed_at: null,
      updated_at: timestamp.toISOString(),
    }, { returning: false });
    return 'retry';
  }

  async function processJob(job) {
    const userId = clean(job?.requested_by_user_id);
    if (!userId) {
      const error = new Error('This worker slice requires a signed-user requested Guild job. Scheduled Guild jobs will use a separate guild-scoped resolver.');
      error.code = 'SIGNED_USER_JOB_REQUIRED';
      await markFailedOrRetry(job, error);
      return Object.freeze({ id: job?.id, ok: false, error: error.message });
    }

    try {
      // guildPersistence.sync re-resolves VERIFIED player ownership and ACTIVE
      // Guild membership from Supabase before it fetches or stores anything.
      // The queue's guild_id is never trusted as authorization input.
      const result = await persistence.sync({ id: userId });
      if (clean(result?.guild?.id) && clean(job?.guild_id) && clean(result.guild.id) !== clean(job.guild_id)) {
        const mismatch = new Error('The verified user now resolves to a different Guild than the queued tenant.');
        mismatch.code = 'QUEUED_GUILD_TENANT_MISMATCH';
        throw mismatch;
      }
      await markCompleted(job, result);
      return Object.freeze({ id: job.id, ok: true, result });
    } catch (error) {
      const disposition = await markFailedOrRetry(job, error);
      return Object.freeze({ id: job.id, ok: false, disposition, error: errorText(error) });
    }
  }

  async function runOnce() {
    if (!config.enabled) return Object.freeze({ claimed: 0, results: Object.freeze([]) });
    if (!store.status?.().configured) throw new Error('Supabase persistence is not configured for the Guild sync worker.');
    const jobs = await claim();
    const results = [];
    for (const job of jobs) results.push(await processJob(job));
    return Object.freeze({ claimed: jobs.length, results: Object.freeze(results) });
  }

  async function runLoop() {
    logger.log(`[guild-sync-worker] ${config.workerId} starting; batch=${config.batchSize} pollMs=${config.pollMs}`);
    while (!stopped) {
      try {
        const cycle = await runOnce();
        if (cycle.claimed) logger.log(`[guild-sync-worker] processed ${cycle.claimed} queued Guild sync job(s)`);
      } catch (error) {
        logger.error(`[guild-sync-worker] ${errorText(error)}`);
      }
      if (!stopped) await sleeper(config.pollMs);
    }
    logger.log(`[guild-sync-worker] ${config.workerId} stopped`);
  }

  return Object.freeze({
    status,
    claim,
    processJob,
    runOnce,
    runLoop,
    stop() { stopped = true; },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createGuildSyncWorker(process.env);
  const stop = () => worker.stop();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  worker.runLoop().catch((error) => {
    console.error(`[guild-sync-worker] fatal: ${errorText(error)}`);
    process.exitCode = 1;
  });
}
