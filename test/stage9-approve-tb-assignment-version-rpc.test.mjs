import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819222500_stage9_approve_tb_assignment_version_rpc.sql', import.meta.url);

test('approval RPC requires one exact immutable run and SHA-256 hash', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.approve_guild_tb_assignment_version/i);
  assert.match(sql, /TB_ASSIGNMENT_VERSION_REQUIRED/);
  assert.match(sql, /TB_ASSIGNMENT_APPROVER_REQUIRED/);
  assert.match(sql, /TB_ASSIGNMENT_INVALID_HASH/);
  assert.match(sql, /v_run\.plan_hash <> lower\(p_plan_hash\)/i);
  assert.match(sql, /TB_ASSIGNMENT_APPROVAL_HASH_MISMATCH/);
});

test('approval RPC rejects cancelled and superseded versions', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /v_run\.cancelled_at is not null or v_run\.status = 'cancelled'/i);
  assert.match(sql, /TB_ASSIGNMENT_VERSION_CANCELLED/);
  assert.match(sql, /v_run\.superseded_by_run_id is not null/i);
  assert.match(sql, /TB_ASSIGNMENT_VERSION_SUPERSEDED/);
});

test('approval RPC records exact approved hash and append-only decision history', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /set approved_at = v_now/i);
  assert.match(sql, /approved_by_user_id = p_actor_user_id/i);
  assert.match(sql, /approved_plan_hash = lower\(p_plan_hash\)/i);
  assert.match(sql, /insert into public\.guild_tb_assignment_decisions/i);
  assert.match(sql, /'approved'/i);
});

test('approval RPC is idempotent only for the same already-approved hash', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /if v_run\.approved_at is not null/i);
  assert.match(sql, /v_run\.approved_plan_hash <> lower\(p_plan_hash\)/i);
  assert.match(sql, /TB_ASSIGNMENT_EXISTING_APPROVAL_HASH_MISMATCH/);
  assert.match(sql, /'alreadyApproved', true/i);
});

test('approval RPC is service-role only', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /revoke all on function public\.approve_guild_tb_assignment_version[\s\S]*from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.approve_guild_tb_assignment_version[\s\S]*to service_role/i);
});
