import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819235900_stage9_append_only_assignment_decisions.sql', import.meta.url);

test('assignment decision history rejects UPDATE and DELETE at the database boundary', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.reject_guild_tb_assignment_decision_mutation/i);
  assert.match(sql, /TB_ASSIGNMENT_DECISION_HISTORY_APPEND_ONLY/);
  assert.match(sql, /before update or delete on public\.guild_tb_assignment_decisions/i);
});

test('assignment decision history rejects TRUNCATE and removes service-role mutation grants', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /before truncate on public\.guild_tb_assignment_decisions/i);
  assert.match(sql, /revoke update, delete, truncate on table public\.guild_tb_assignment_decisions from service_role/i);
  assert.match(sql, /grant select, insert on table public\.guild_tb_assignment_decisions to service_role/i);
});

test('append-only mutation guard is not executable by public client roles', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /revoke all on function public\.reject_guild_tb_assignment_decision_mutation\(\) from public,anon,authenticated/i);
});
