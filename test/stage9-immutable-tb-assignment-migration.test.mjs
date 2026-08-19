import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlUrl = new URL('../supabase/migrations/20260819220500_stage9_immutable_tb_assignment_versions.sql', import.meta.url);

test('Stage 9 migration adds immutable version identity and approval lifecycle fields', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /add column if not exists rote_phase text/i);
  assert.match(sql, /add column if not exists version_number integer/i);
  assert.match(sql, /add column if not exists plan_hash text/i);
  assert.match(sql, /add column if not exists supersedes_run_id uuid/i);
  assert.match(sql, /add column if not exists superseded_by_run_id uuid/i);
  assert.match(sql, /add column if not exists approved_plan_hash text/i);
  assert.match(sql, /guild_tb_assignment_runs_plan_phase_version_uidx/i);
  assert.match(sql, /plan_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
});

test('Stage 9 migration creates append-only decision history surface', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create table if not exists public\.guild_tb_assignment_decisions/i);
  assert.match(sql, /'created','approved','cancelled','superseded','publishability_rejected'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.guild_tb_assignment_decisions from anon,authenticated/i);
  assert.match(sql, /grant all on table public\.guild_tb_assignment_decisions to service_role/i);
});

test('Stage 9 migration rejects mutation of publish-relevant assignment payload', () => {
  const sql = fs.readFileSync(sqlUrl, 'utf8');
  assert.match(sql, /create or replace function public\.reject_tb_assignment_payload_mutation/i);
  assert.match(sql, /new\.guild_id is distinct from old\.guild_id/i);
  assert.match(sql, /new\.plan_id is distinct from old\.plan_id/i);
  assert.match(sql, /new\.rote_phase is distinct from old\.rote_phase/i);
  assert.match(sql, /new\.version_number is distinct from old\.version_number/i);
  assert.match(sql, /new\.plan_hash is distinct from old\.plan_hash/i);
  assert.match(sql, /new\.input_fingerprint is distinct from old\.input_fingerprint/i);
  assert.match(sql, /new\.assignments is distinct from old\.assignments/i);
  assert.match(sql, /new\.unfilled is distinct from old\.unfilled/i);
  assert.match(sql, /new\.diagnostics is distinct from old\.diagnostics/i);
  assert.match(sql, /new\.source_guild_synced_at is distinct from old\.source_guild_synced_at/i);
  assert.match(sql, /create trigger reject_tb_assignment_payload_mutation/i);
  assert.match(sql, /before update on public\.guild_tb_assignment_runs/i);
});
