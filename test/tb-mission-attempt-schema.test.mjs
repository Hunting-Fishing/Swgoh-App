import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260820015500_rote_mission_attempt_evidence.sql', import.meta.url), 'utf8');

test('ROTE mission attempt schema is append-only, idempotent, and evidence-safe', () => {
  assert.match(sql, /create table if not exists public\.guild_tb_mission_attempts/i);
  assert.match(sql, /attempt_key text not null unique/i);
  assert.match(sql, /evidence_fingerprint text not null/i);
  assert.match(sql, /foreign key \(event_id, guild_id\)[\s\S]*references public\.guild_tb_events\(id, guild_id\)/i);
  assert.match(sql, /outcome in \('complete','partial','failed','skipped','unknown'\)/i);
  assert.match(sql, /jsonb_typeof\(team_snapshot\) = 'array'/i);
  assert.match(sql, /reported_by_user_id uuid references public\.profiles\(id\)/i);
  assert.match(sql, /revoke update, delete, truncate on table public\.guild_tb_mission_attempts from service_role/i);
  assert.match(sql, /before update or delete on public\.guild_tb_mission_attempts/i);
  assert.match(sql, /before truncate on public\.guild_tb_mission_attempts/i);
  assert.match(sql, /TB_MISSION_ATTEMPT_EVIDENCE_APPEND_ONLY/);
  assert.match(sql, /never predicted win probability/i);
});
