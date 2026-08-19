import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819221500_stage9_create_tb_assignment_version_rpc.sql', import.meta.url);

test('Stage 9 create-version RPC validates immutable identity and payload shape', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.create_guild_tb_assignment_version/i);
  assert.match(sql, /TB_ASSIGNMENT_PLAN_REQUIRED/);
  assert.match(sql, /TB_ASSIGNMENT_INVALID_PHASE/);
  assert.match(sql, /TB_ASSIGNMENT_INVALID_HASH/);
  assert.match(sql, /TB_ASSIGNMENT_INPUT_FINGERPRINT_REQUIRED/);
  assert.match(sql, /TB_ASSIGNMENT_INVALID_PAYLOAD_SHAPE/);
});

test('Stage 9 create-version RPC serializes version allocation and fails closed on races', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /from public\.guild_tb_plans[\s\S]*for update/i);
  assert.match(sql, /coalesce\(max\(version_number\), 0\) \+ 1/i);
  assert.match(sql, /TB_ASSIGNMENT_VERSION_CONFLICT/);
  assert.match(sql, /using errcode = '40001'/i);
});

test('Stage 9 create-version RPC atomically supersedes prior version and audits both decisions', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /superseded_by_run_id is null/i);
  assert.match(sql, /insert into public\.guild_tb_assignment_runs/i);
  assert.match(sql, /supersedes_run_id/i);
  assert.match(sql, /set superseded_by_run_id = v_run_id/i);
  assert.match(sql, /'superseded'/i);
  assert.match(sql, /'created'/i);
  assert.match(sql, /insert into public\.guild_tb_assignment_decisions/i);
});

test('Stage 9 create-version RPC is service-role only', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /revoke all on function public\.create_guild_tb_assignment_version[\s\S]*from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.create_guild_tb_assignment_version[\s\S]*to service_role/i);
});
