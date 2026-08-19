import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819223500_stage9_cancel_tb_assignment_version_rpc.sql', import.meta.url);

test('cancellation RPC targets one exact Guild assignment version', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.cancel_guild_tb_assignment_version/i);
  assert.match(sql, /where id = p_run_id[\s\S]*and guild_id = p_guild_id[\s\S]*for update/i);
  assert.match(sql, /TB_ASSIGNMENT_VERSION_NOT_FOUND/);
});

test('cancellation RPC mutates only lifecycle fields and leaves immutable payload untouched', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /set status = 'cancelled'/i);
  assert.match(sql, /cancelled_at = v_now/i);
  assert.match(sql, /cancelled_by_user_id = p_actor_user_id/i);
  assert.match(sql, /cancellation_reason = v_reason/i);
  assert.doesNotMatch(sql, /set[\s\S]{0,300}assignments\s*=/i);
  assert.doesNotMatch(sql, /set[\s\S]{0,300}unfilled\s*=/i);
  assert.doesNotMatch(sql, /set[\s\S]{0,300}diagnostics\s*=/i);
});

test('cancellation RPC appends an audit decision and is idempotent', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /insert into public\.guild_tb_assignment_decisions/i);
  assert.match(sql, /'cancelled'/i);
  assert.match(sql, /'wasApproved'/i);
  assert.match(sql, /'alreadyCancelled', true/i);
});

test('cancellation RPC is service-role only', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /revoke all on function public\.cancel_guild_tb_assignment_version[\s\S]*from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.cancel_guild_tb_assignment_version[\s\S]*to service_role/i);
});
