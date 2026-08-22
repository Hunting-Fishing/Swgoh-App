import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql', import.meta.url), 'utf8');

test('Datacron evidence schema preserves UNKNOWN/NONE separation and validates JSON payload shapes', () => {
  assert.match(sql, /create table if not exists public\.gac_datacron_battle_evidence/i);
  assert.match(sql, /defender_datacron_state in \('unknown','none','assigned'\)/i);
  assert.match(sql, /attacker_datacron_state in \('unknown','none','assigned'\)/i);
  assert.match(sql, /jsonb_typeof\(enemy_members\) = 'array'/i);
  assert.match(sql, /jsonb_typeof\(counter_members\) = 'array'/i);
  assert.match(sql, /defender_datacron is null or jsonb_typeof\(defender_datacron\) = 'object'/i);
  assert.match(sql, /attacker_datacron is null or jsonb_typeof\(attacker_datacron\) = 'object'/i);
  assert.match(sql, /jsonb_typeof\(metadata\) = 'object'/i);
});

test('Datacron evidence schema exposes only required service-role write capabilities', () => {
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.gac_datacron_battle_evidence from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update on table public\.gac_datacron_battle_evidence to service_role/i);
  assert.match(sql, /revoke delete, truncate on table public\.gac_datacron_battle_evidence from service_role/i);
  assert.match(sql, /grant usage, select on sequence public\.gac_datacron_battle_evidence_id_seq to service_role/i);
});

test('Datacron evidence indexes support enemy, defender DC, counter and exact matchup lookup', () => {
  for (const index of [
    'gac_dc_battle_enemy_idx',
    'gac_dc_battle_defender_sig_idx',
    'gac_dc_battle_counter_idx',
    'gac_dc_battle_attacker_sig_idx',
    'gac_dc_battle_exact_matchup_idx',
  ]) assert.match(sql, new RegExp(index, 'i'));
});
