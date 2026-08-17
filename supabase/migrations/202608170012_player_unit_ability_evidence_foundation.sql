alter table public.player_units_current
  alter column zeta_count drop not null,
  alter column zeta_count drop default,
  alter column omicron_count drop not null,
  alter column omicron_count drop default;

create table if not exists public.player_unit_abilities_current (
  player_id uuid not null,
  base_id text not null,
  ability_id text not null,
  ability_kind text,
  classification_source text not null default 'unclassified',
  classification_version text,
  last_synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (player_id, base_id, ability_id),
  constraint player_unit_abilities_current_unit_fkey
    foreign key (player_id, base_id)
    references public.player_units_current(player_id, base_id)
    on delete cascade,
  constraint player_unit_abilities_current_kind_check
    check (ability_kind is null or ability_kind = any (array['zeta'::text,'omicron'::text,'ultimate'::text,'omega'::text,'other'::text,'unknown'::text]))
);

create index if not exists player_unit_abilities_current_ability_idx
  on public.player_unit_abilities_current(ability_id);
create index if not exists player_unit_abilities_current_base_idx
  on public.player_unit_abilities_current(base_id);

alter table public.player_unit_abilities_current enable row level security;

drop policy if exists player_unit_abilities_current_select_authorized on public.player_unit_abilities_current;
create policy player_unit_abilities_current_select_authorized
  on public.player_unit_abilities_current
  for select
  to authenticated
  using (private.user_has_player_access(player_id));

create or replace function private.normalize_player_unit_ability_counts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if lower(coalesce(new.metadata->>'abilityClassificationPendingCatalog', 'false')) = 'true' then
    new.zeta_count := null;
    new.omicron_count := null;
  end if;
  return new;
end;
$$;

drop trigger if exists player_units_normalize_ability_counts on public.player_units_current;
create trigger player_units_normalize_ability_counts
before insert or update on public.player_units_current
for each row execute function private.normalize_player_unit_ability_counts();

create or replace function private.sync_player_unit_ability_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_abilities jsonb := coalesce(new.metadata->'purchasedAbilityIds', '[]'::jsonb);
begin
  if jsonb_typeof(v_abilities) is distinct from 'array' then
    v_abilities := '[]'::jsonb;
  end if;

  delete from public.player_unit_abilities_current a
  where a.player_id = new.player_id
    and a.base_id = new.base_id
    and not exists (
      select 1
      from jsonb_array_elements_text(v_abilities) x(ability_id)
      where btrim(x.ability_id) <> ''
        and x.ability_id = a.ability_id
    );

  insert into public.player_unit_abilities_current (
    player_id, base_id, ability_id, ability_kind,
    classification_source, classification_version,
    last_synced_at, metadata
  )
  select
    new.player_id,
    new.base_id,
    btrim(x.ability_id),
    null,
    'unclassified',
    null,
    coalesce(new.last_synced_at, now()),
    jsonb_build_object('source', 'purchasedAbilityIds', 'classificationPending', true)
  from jsonb_array_elements_text(v_abilities) x(ability_id)
  where btrim(x.ability_id) <> ''
  on conflict (player_id, base_id, ability_id) do update
  set last_synced_at = excluded.last_synced_at,
      metadata = excluded.metadata;

  return new;
end;
$$;

drop trigger if exists player_units_sync_ability_evidence on public.player_units_current;
create trigger player_units_sync_ability_evidence
after insert or update of metadata, last_synced_at on public.player_units_current
for each row execute function private.sync_player_unit_ability_evidence();

comment on table public.player_unit_abilities_current is
  'Raw purchased SWGOH ability evidence for each current player unit. Ability classification is intentionally nullable until verified against the current game catalog.';
comment on column public.player_units_current.zeta_count is
  'Verified zeta count when ability classification is complete; NULL means not yet classified and must not be interpreted as zero.';
comment on column public.player_units_current.omicron_count is
  'Verified omicron count when ability classification is complete; NULL means not yet classified and must not be interpreted as zero.';
