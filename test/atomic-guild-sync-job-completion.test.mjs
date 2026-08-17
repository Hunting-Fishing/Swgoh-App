import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/202608180001_atomic_guild_sync_job_completion.sql', import.meta.url),
  'utf8',
);

test('completed Guild sync runs atomically acknowledge the matching running job', () => {
  assert.match(migration, /after update of status on public\.guild_sync_runs/i);
  assert.match(migration, /when \(new\.status = 'completed'\)/i);
  assert.match(migration, /where j\.sync_run_id = new\.id[\s\S]*j\.guild_id = new\.guild_id[\s\S]*j\.status = 'running'/i);
  assert.match(migration, /status = 'completed'/i);
});

test('atomic acknowledgement releases the worker lease and preserves completion evidence', () => {
  assert.match(migration, /claimed_at = null/i);
  assert.match(migration, /claimed_by = null/i);
  assert.match(migration, /last_error = null/i);
  assert.match(migration, /'completedAtomically', true/i);
  assert.match(migration, /'workerResult'/i);
  assert.match(migration, /'membersStored'/i);
  assert.match(migration, /'unitsStored'/i);
});

test('migration reconciles previously committed runs without touching queued or failed jobs', () => {
  const backfill = migration.indexOf('update public.guild_sync_jobs j', migration.indexOf('update public.guild_sync_jobs j') + 1);
  assert.notEqual(backfill, -1);
  const tail = migration.slice(backfill);
  assert.match(tail, /j\.status = 'running'/i);
  assert.match(tail, /r\.status = 'completed'/i);
  assert.match(tail, /j\.sync_run_id = r\.id/i);
});
