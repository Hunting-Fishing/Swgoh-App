create table if not exists public.gac_attack_plan_assignments (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.gac_rounds(id) on delete cascade,
  defense_squad_id bigint not null references public.gac_round_squads(id) on delete cascade,
  attacker_leader_base_id text not null,
  attacker_members jsonb not null,
  datacron jsonb,
  status text not null default 'planned' check (status in ('planned','attempted','win','loss','abandoned')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_log jsonb not null default '[]'::jsonb,
  banners integer check (banners is null or banners >= 0),
  source text not null default 'verified-owner-war-room',
  source_ref text,
  planned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(round_id, defense_squad_id)
);

create index if not exists gac_attack_plan_round_idx
  on public.gac_attack_plan_assignments(round_id, status, updated_at desc);
create index if not exists gac_attack_plan_defense_idx
  on public.gac_attack_plan_assignments(defense_squad_id);

alter table public.gac_attack_plan_assignments enable row level security;
revoke all on public.gac_attack_plan_assignments from anon, authenticated;

comment on table public.gac_attack_plan_assignments is
  'Verified-owner operational GAC war-room state: one current plan per saved enemy defense plus an append-only attempt log, separate from historical battle evidence.';
comment on column public.gac_attack_plan_assignments.attempt_log is
  'Append-only operational attempt snapshots (squad, datacron id, result, banners, timestamp). These are not promoted to historical counter evidence automatically.';
comment on column public.gac_attack_plan_assignments.status is
  'Operational state only; a win/loss becomes historical evidence only through a separate verified battle-recording path.';
