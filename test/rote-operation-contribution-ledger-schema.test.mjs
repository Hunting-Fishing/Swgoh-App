import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260820070000_rote_operation_contribution_ledger.sql', import.meta.url), 'utf8');

test('A1 creates durable Operation slot state with duplicate logical-slot prevention', () => {
  assert.match(sql, /create table if not exists public\.guild_tb_operation_slots/i);
  assert.match(sql, /foreign key \(event_id, guild_id\)[\s\S]*references public\.guild_tb_events\(id, guild_id\)/i);
  assert.match(sql, /unique\(event_id, phase, operation_id, slot_id\)/i);
  assert.match(sql, /required_base_id text not null/i);
  assert.match(sql, /required_relic smallint/i);
  assert.match(sql, /required_rarity smallint/i);
  assert.match(sql, /guild_tb_operation_slots_event_phase_idx/i);
  assert.match(sql, /guild_tb_operation_slots_guild_base_idx/i);
});

test('A1 preserves assignment history and immutable assignment identity', () => {
  assert.match(sql, /create table if not exists public\.guild_tb_operation_assignments/i);
  assert.match(sql, /assignment_run_id uuid references public\.guild_tb_assignment_runs\(id\)/i);
  assert.match(sql, /foreign key \(slot_id, assigned_base_id\)[\s\S]*references public\.guild_tb_operation_slots\(id, required_base_id\)/i);
  assert.match(sql, /assignment_state in \('assigned','superseded','cancelled'\)/i);
  assert.match(sql, /guild_tb_operation_assignments_one_active_idx/i);
  assert.match(sql, /where assignment_state = 'assigned' and superseded_at is null/i);
  assert.match(sql, /revoke delete, truncate on table public\.guild_tb_operation_assignments from service_role/i);
  assert.match(sql, /before delete on public\.guild_tb_operation_assignments/i);
  assert.match(sql, /before truncate on public\.guild_tb_operation_assignments/i);
  assert.match(sql, /TB_OPERATION_ASSIGNMENT_HISTORY_PRESERVED/);
  assert.match(sql, /TB_OPERATION_ASSIGNMENT_PAYLOAD_IMMUTABLE/);
});

test('A1 contribution evidence is context-bound, idempotent, and append-only', () => {
  assert.match(sql, /create table if not exists public\.guild_tb_operation_contributions/i);
  assert.match(sql, /contribution_key text not null unique/i);
  assert.match(sql, /evidence_fingerprint text not null/i);
  assert.match(sql, /foreign key \(slot_id, event_id, guild_id, phase\)[\s\S]*references public\.guild_tb_operation_slots\(id, event_id, guild_id, phase\)/i);
  assert.match(sql, /status in \('filled','verified','mismatch','unknown'\)/i);
  assert.match(sql, /evidence_class in \('GAME_DATA','GUILD_DATA'\)/i);
  assert.match(sql, /contributor_ally_code is null or contributor_ally_code ~ '\^\[0-9\]\{9\}\$'/i);
  assert.match(sql, /jsonb_typeof\(unit_snapshot\) = 'object'/i);
  assert.match(sql, /grant select, insert on table public\.guild_tb_operation_contributions to service_role/i);
  assert.match(sql, /revoke update, delete, truncate on table public\.guild_tb_operation_contributions from service_role/i);
  assert.match(sql, /before update or delete on public\.guild_tb_operation_contributions/i);
  assert.match(sql, /before truncate on public\.guild_tb_operation_contributions/i);
  assert.match(sql, /TB_OPERATION_CONTRIBUTION_EVIDENCE_APPEND_ONLY/);
  assert.match(sql, /Assignment is never treated as proof of contribution/i);
});

test('A1 exposes no direct anonymous or authenticated table access', () => {
  for (const table of ['guild_tb_operation_slots', 'guild_tb_operation_assignments', 'guild_tb_operation_contributions']) {
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'));
  }
});