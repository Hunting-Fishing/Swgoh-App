import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/migrations/20260819223000_gac_attack_plan_assignments.sql", import.meta.url), "utf8");

test("war-room migration creates one operational assignment per round defense with append-only attempt storage", () => {
  assert.match(sql, /create table if not exists public\.gac_attack_plan_assignments/i);
  assert.match(sql, /round_id uuid not null references public\.gac_rounds\(id\) on delete cascade/i);
  assert.match(sql, /defense_squad_id bigint not null references public\.gac_round_squads\(id\) on delete cascade/i);
  assert.match(sql, /attempt_log jsonb not null default '\[\]'::jsonb/i);
  assert.match(sql, /unique\(round_id, defense_squad_id\)/i);
});

test("war-room migration constrains operational statuses and nonnegative counters", () => {
  assert.match(sql, /status in \('planned','attempted','win','loss','abandoned'\)/i);
  assert.match(sql, /attempt_count integer not null default 0 check \(attempt_count >= 0\)/i);
  assert.match(sql, /banners integer check \(banners is null or banners >= 0\)/i);
});

test("war-room table is server-controlled rather than directly writable by browser roles", () => {
  assert.match(sql, /alter table public\.gac_attack_plan_assignments enable row level security/i);
  assert.match(sql, /revoke all on public\.gac_attack_plan_assignments from anon, authenticated/i);
  assert.equal(/create policy/i.test(sql), false, "No direct client RLS policy should bypass the authenticated server API");
});

test("migration documents that operational attempts are not historical counter evidence", () => {
  assert.match(sql, /not promoted to historical counter evidence automatically/i);
  assert.match(sql, /separate verified battle-recording path/i);
});
