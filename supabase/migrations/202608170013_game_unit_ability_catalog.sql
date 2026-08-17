create table if not exists public.game_unit_abilities (
  base_id text not null references public.game_units(base_id) on delete cascade,
  ability_id text not null,
  name text not null,
  ability_type text,
  max_tier integer not null default 0 check (max_tier >= 0),
  has_zeta boolean not null default false,
  has_omicron boolean not null default false,
  has_omega boolean not null default false,
  omicron_mode integer,
  catalog_version text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (base_id, ability_id)
);

create index if not exists game_unit_abilities_ability_idx
  on public.game_unit_abilities(ability_id);
create index if not exists game_unit_abilities_zeta_idx
  on public.game_unit_abilities(base_id, ability_id) where has_zeta;
create index if not exists game_unit_abilities_omicron_idx
  on public.game_unit_abilities(base_id, ability_id) where has_omicron;

alter table public.game_unit_abilities enable row level security;

drop policy if exists game_unit_abilities_select_authenticated on public.game_unit_abilities;
create policy game_unit_abilities_select_authenticated
  on public.game_unit_abilities
  for select
  to authenticated
  using (true);

comment on table public.game_unit_abilities is
  'Current static SWGOH unit ability catalog used to classify purchased player ability evidence without scanning unit JSON metadata.';
