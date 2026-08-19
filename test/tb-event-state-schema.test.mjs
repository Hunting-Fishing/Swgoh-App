import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/20260819130000_tb_event_state_foundation.sql', import.meta.url), 'utf8');

test('TB event foundation creates the three v1 durable tables', () => {
  for (const table of ['guild_tb_events', 'guild_tb_zone_states', 'guild_tb_member_actions']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
  }
});

test('TB event schema keeps source provenance and one active ROTE event per Guild', () => {
  assert.match(sql, /guild_tb_events_one_active_idx/);
  assert.match(sql, /where status = 'active'/);
  assert.match(sql, /source_kind text not null default 'officer'/);
  assert.match(sql, /command_state in \('attack','preload','hold','deploy','stop'\)/);
  assert.match(sql, /unique\(event_id, phase, player_id, action_key\)/);
});
