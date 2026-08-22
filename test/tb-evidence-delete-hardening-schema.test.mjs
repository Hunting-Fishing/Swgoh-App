import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260822124500_tb_evidence_delete_hardening.sql', import.meta.url), 'utf8');

const hardenedConstraints = [
  'guild_tb_mission_attempts_player_id_fkey',
  'guild_tb_mission_attempts_event_guild_fk',
  'guild_tb_operation_slots_event_guild_fk',
  'guild_tb_operation_assignments_slot_unit_fk',
  'guild_tb_operation_contributions_slot_context_fk',
];

test('TB evidence hardening replaces all historical CASCADE paths with RESTRICT', () => {
  for (const constraint of hardenedConstraints) {
    assert.match(sql, new RegExp(`drop constraint if exists ${constraint}`, 'i'));
    assert.match(sql, new RegExp(`add constraint ${constraint}[\\s\\S]*?on delete restrict`, 'i'));
  }
  assert.doesNotMatch(sql, /on delete cascade/i);
});

test('TB evidence hardening protects event, player, assignment and contribution history', () => {
  assert.match(sql, /foreign key \(player_id\)[\s\S]*references public\.players\(id\)[\s\S]*on delete restrict/i);
  assert.match(sql, /foreign key \(event_id, guild_id\)[\s\S]*references public\.guild_tb_events\(id, guild_id\)[\s\S]*on delete restrict/i);
  assert.match(sql, /foreign key \(slot_id, assigned_base_id\)[\s\S]*references public\.guild_tb_operation_slots\(id, required_base_id\)[\s\S]*on delete restrict/i);
  assert.match(sql, /foreign key \(slot_id, event_id, guild_id, phase\)[\s\S]*references public\.guild_tb_operation_slots\(id, event_id, guild_id, phase\)[\s\S]*on delete restrict/i);
  assert.match(sql, /auditable records/i);
  assert.match(sql, /silently cascading away history/i);
});
