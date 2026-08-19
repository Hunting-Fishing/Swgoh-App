import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260819235930_stage9_remove_parallel_db_artifacts.sql', import.meta.url);

test('Stage 9 legacy cleanup fails closed on unexpected approval data and removes only superseded objects', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /exists \(select 1 from public\.guild_tb_assignment_run_approvals limit 1\)/);
  assert.match(sql, /manual reconciliation required before cleanup/);
  assert.match(sql, /drop trigger if exists guild_tb_assignment_runs_immutable_payload/);
  assert.match(sql, /drop function if exists public\.guard_immutable_tb_assignment_run_payload\(\)/);
  assert.match(sql, /drop table if exists public\.guild_tb_assignment_run_approvals/);
  assert.match(sql, /drop function if exists public\.guard_append_only_tb_assignment_approval\(\)/);
  assert.match(sql, /drop function if exists public\.create_guild_tb_assignment_version\([\s\S]*uuid, uuid, text, text, text, jsonb, jsonb, jsonb, uuid, text[\s\S]*\)/);
  assert.match(sql, /drop index if exists public\.guild_tb_assignment_runs_version_scope_uidx/);

  // Do not destructively churn additive legacy columns while live Stage 9 is
  // still in pilot acceptance.
  assert.doesNotMatch(sql, /drop column/i);
});

test('Stage 9 legacy cleanup explicitly verifies authoritative main boundaries survive', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /to_regclass\('public\.guild_tb_assignment_decisions'\)/);
  assert.match(sql, /to_regprocedure\('public\.create_guild_tb_assignment_version\(uuid,uuid,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,uuid\)'\)/);
  assert.match(sql, /tgname = 'reject_tb_assignment_payload_mutation'/);
});
