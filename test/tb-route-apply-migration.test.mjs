import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819153000_tb_route_apply_audit.sql', import.meta.url);

test('route apply migration creates immutable fingerprinted phase snapshots', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create table if not exists public\.guild_tb_phase_snapshots/i);
  assert.match(sql, /input_fingerprint text not null/i);
  assert.match(sql, /unique\(event_id, phase, snapshot_kind, input_fingerprint\)/i);
  assert.match(sql, /route_plan_json jsonb not null/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.guild_tb_phase_snapshots from anon, authenticated/i);
  assert.match(sql, /grant all on table public\.guild_tb_phase_snapshots to service_role/i);
});

test('atomic route apply RPC guards event phase, zone versions and officer locks', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.apply_guild_tb_route_plan/i);
  assert.match(sql, /e\.status = 'active'/i);
  assert.match(sql, /e\.current_phase = p_phase/i);
  assert.match(sql, /z\.locked_by_officer = false/i);
  assert.match(sql, /z\.updated_at = nullif\(u->>'expectedUpdatedAt'/i);
  assert.match(sql, /TB_ROUTE_STATE_STALE/);
  assert.match(sql, /TB_ROUTE_APPLY_CONCURRENCY_FAILURE/);
  assert.match(sql, /insert into public\.guild_tb_phase_snapshots/i);
  assert.match(sql, /update public\.guild_tb_zone_states/i);
  assert.match(sql, /grant execute on function public\.apply_guild_tb_route_plan[\s\S]*to service_role/i);
});
