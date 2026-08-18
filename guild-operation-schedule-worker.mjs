import os from 'node:os';
import { guildOperationScheduledExecutor } from './guild-operation-scheduled-executor.mjs';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : value ? [value] : [];
const first = (value) => array(value)[0] || null;
const errorText = (error) => text(error?.message || error || 'Scheduled Guild Operation failed.').slice(0, 1000);

function positive(value, fallback, min = 1, max = 1000) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function createGuildOperationScheduleWorker(env = process.env, options = {}) {
  const store = options.store || supabaseCoreStore;
  const executor = options.executor || guildOperationScheduledExecutor;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const workerId = text(env.GUILD_OPERATION_SCHEDULE_WORKER_ID) || `guild-ops:${text(env.RAILWAY_REPLICA_ID || os.hostname())}:${process.pid}`;
  const batchSize = positive(env.GUILD_OPERATION_SCHEDULE_BATCH_SIZE, 2, 1, 10);
  const staleSeconds = positive(env.GUILD_OPERATION_SCHEDULE_STALE_SECONDS, 300, 60, 3600);

  async function updateSchedule(scheduleId, patch) {
    await store.update('guild_operation_schedules', { id: `eq.${scheduleId}` }, { ...patch, updated_at: now().toISOString() }, { returning: false });
  }

  async function activeSyncJob(guildId) {
    const candidates = await store.select('guild_sync_jobs', {
      select: 'id,status,created_at', guild_id: `eq.${guildId}`, status: 'in.(queued,running)', order: 'created_at.asc', limit: 1,
    });
    return first(candidates);
  }

  async function queueRefresh(schedule) {
    let job = await activeSyncJob(schedule.guild_id);
    if (!job) {
      job = first(await store.insert('guild_sync_jobs', [{
        guild_id: schedule.guild_id,
        requested_by_user_id: schedule.created_by_user_id,
        requested_by_player_id: schedule.requested_by_player_id,
        trigger_kind: 'scheduled',
        priority: 80,
        status: 'queued',
        include_activity: true,
        force_refresh: true,
        max_attempts: 3,
        run_after: now().toISOString(),
        metadata: {
          guildOperationSchedule: {
            scheduleId: schedule.id,
            runType: schedule.run_type,
            planId: schedule.plan_id,
            requestedFor: schedule.next_run_at,
          },
        },
        created_at: now().toISOString(),
        updated_at: now().toISOString(),
      }]));
    } else {
      const existing = await store.select('guild_sync_jobs', { select: 'metadata', id: `eq.${job.id}`, limit: 1 });
      await store.update('guild_sync_jobs', { id: `eq.${job.id}` }, {
        metadata: {
          ...(first(existing)?.metadata || {}),
          guildOperationSchedule: { scheduleId: schedule.id, runType: schedule.run_type, planId: schedule.plan_id, requestedFor: schedule.next_run_at },
        },
        updated_at: now().toISOString(),
      }, { returning: false });
    }
    await updateSchedule(schedule.id, { stage: 'syncing', sync_job_id: job.id, locked_at: null, locked_by: null, last_error: null });
    return { scheduleId: schedule.id, stage: 'syncing', syncJobId: job.id };
  }

  async function syncJob(schedule) {
    if (!schedule.sync_job_id) return null;
    return first(await store.select('guild_sync_jobs', {
      select: 'id,status,last_error,completed_at,sync_run_id', id: `eq.${schedule.sync_job_id}`, limit: 1,
    }));
  }

  async function fail(schedule, error) {
    return store.rpc('advance_guild_operation_schedule', {
      p_schedule_id: schedule.id,
      p_success: false,
      p_assignment_run_id: null,
      p_error: errorText(error),
    });
  }

  async function succeed(schedule, runId) {
    return store.rpc('advance_guild_operation_schedule', {
      p_schedule_id: schedule.id,
      p_success: true,
      p_assignment_run_id: runId || null,
      p_error: null,
    });
  }

  async function process(schedule) {
    try {
      if (text(schedule.stage) === 'idle') return await queueRefresh(schedule);
      if (text(schedule.stage) === 'syncing') {
        const job = await syncJob(schedule);
        if (!job || !['completed','failed'].includes(text(job.status))) {
          await updateSchedule(schedule.id, { locked_at: null, locked_by: null });
          return { scheduleId: schedule.id, stage: 'syncing', pending: true };
        }
        if (job.status === 'failed') throw new Error(`Pre-run Guild refresh failed: ${text(job.last_error) || 'unknown sync failure'}`);
        await updateSchedule(schedule.id, { stage: 'planning', locked_at: now().toISOString(), locked_by: workerId });
        const result = await executor.execute({ ...schedule, stage: 'planning' });
        await succeed(schedule, result.runId);
        return { scheduleId: schedule.id, stage: 'complete', runId: result.runId, published: result.published };
      }
      if (['planning','publishing'].includes(text(schedule.stage))) {
        // A stale lease means the previous process died after entering a non-idempotent stage.
        // Fail closed rather than guessing whether a publish occurred; delivery receipts remain available for officer review.
        throw new Error(`Recovered stale ${schedule.stage} lease; automatic replay was blocked to prevent duplicate assignment delivery.`);
      }
      await updateSchedule(schedule.id, { locked_at: null, locked_by: null });
      return { scheduleId: schedule.id, stage: schedule.stage, skipped: true };
    } catch (error) {
      await fail(schedule, error);
      return { scheduleId: schedule.id, ok: false, error: errorText(error) };
    }
  }

  async function runOnce() {
    if (!store.status?.().configured) throw new Error('Supabase persistence is not configured for scheduled Guild Operations.');
    const claimed = array(await store.rpc('claim_due_guild_operation_schedules', {
      p_worker_id: workerId,
      p_limit: batchSize,
      p_stale_seconds: staleSeconds,
    }));
    const results = [];
    for (const schedule of claimed) results.push(await process(schedule));
    return Object.freeze({ workerId, claimed: claimed.length, results: Object.freeze(results) });
  }

  return Object.freeze({ runOnce, process });
}

export const guildOperationScheduleWorker = createGuildOperationScheduleWorker();
