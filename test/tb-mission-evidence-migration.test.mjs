import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819165000_tb_mission_attempt_evidence.sql', import.meta.url);

test('mission evidence migration creates versioned current-attempt storage with constrained outcomes', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create table if not exists public\.guild_tb_mission_attempts/i);
  assert.match(sql, /result_code in \('2\/2','1\/2','0\/2','failed','skipped'\)/i);
  assert.match(sql, /revision integer not null default 1/i);
  assert.match(sql, /supersedes_attempt_id uuid references public\.guild_tb_mission_attempts/i);
  assert.match(sql, /create unique index if not exists guild_tb_mission_attempts_current_member_idx[\s\S]*event_id, mission_id, player_id[\s\S]*where is_current = true/i);
  assert.match(sql, /alter table public\.guild_tb_mission_attempts enable row level security/i);
  assert.match(sql, /revoke all on table public\.guild_tb_mission_attempts from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.guild_tb_mission_attempts to service_role/i);
});

test('mission-attempt RPC preserves correction history and requires exact current revision', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.record_guild_tb_mission_attempt/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /TB_ATTEMPT_ALREADY_REPORTED/);
  assert.match(sql, /TB_ATTEMPT_STATE_STALE/);
  assert.match(sql, /TB_ATTEMPT_CORRECTION_REASON_REQUIRED/);
  assert.match(sql, /p_expected_current_attempt_id is null or v_current\.id <> p_expected_current_attempt_id/i);
  assert.match(sql, /update public\.guild_tb_mission_attempts[\s\S]*is_current = false[\s\S]*superseded_at = v_now/i);
  assert.match(sql, /supersedes_attempt_id/);
  assert.match(sql, /v_revision := v_current\.revision \+ 1/i);
  assert.match(sql, /revoke all on function public\.record_guild_tb_mission_attempt[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.record_guild_tb_mission_attempt[\s\S]*to service_role/i);
});

test('mission-attempt RPC validates event/Guild identity before writing evidence', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /select e\.guild_id into v_event_guild_id[\s\S]*where e\.id = p_event_id/i);
  assert.match(sql, /TB_ATTEMPT_EVENT_GUILD_MISMATCH/);
  assert.match(sql, /p_result_code not in \('2\/2','1\/2','0\/2','failed','skipped'\)/i);
  assert.match(sql, /p_source_kind not in \('member_report','officer_correction','canonical_import'\)/i);
});
