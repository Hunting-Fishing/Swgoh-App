create table public.player_unit_progression_history (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  guild_id uuid references public.guilds(id) on delete set null,
  base_id text not null,
  event_type text not null check (event_type in ('unlocked','progression_change')),
  changed_at timestamptz not null default now(),
  changed_fields text[] not null default '{}'::text[],
  previous_state jsonb,
  new_state jsonb not null,
  source text not null default 'guild_sync',
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(new_state) = 'object'),
  check (previous_state is null or jsonb_typeof(previous_state) = 'object')
);

create index player_unit_progression_player_time_idx
  on public.player_unit_progression_history(player_id, changed_at desc);

create index player_unit_progression_guild_time_idx
  on public.player_unit_progression_history(guild_id, changed_at desc)
  where guild_id is not null;

create index player_unit_progression_unit_time_idx
  on public.player_unit_progression_history(base_id, changed_at desc);

alter table public.player_unit_progression_history enable row level security;

create policy player_unit_progression_select_authorized
on public.player_unit_progression_history
for select
to authenticated
using (private.user_has_player_access(player_id));

grant select on public.player_unit_progression_history to authenticated;

create or replace function private.capture_player_unit_progression()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_guild_id uuid;
  v_fields text[] := '{}'::text[];
  v_previous jsonb;
  v_new jsonb;
  v_has_prior_snapshot boolean := false;
begin
  select current_guild_id into v_guild_id
  from public.players
  where id = new.player_id;

  v_new := jsonb_build_object(
    'rarity', new.rarity,
    'level', new.level,
    'gearLevel', new.gear_level,
    'relicTier', new.relic_tier,
    'galacticPower', new.galactic_power,
    'zetaCount', new.zeta_count,
    'omicronCount', new.omicron_count,
    'ultimateUnlocked', new.ultimate_unlocked,
    'metadata', coalesce(new.metadata, '{}'::jsonb)
  );

  if tg_op = 'INSERT' then
    select exists (
      select 1
      from public.player_snapshots ps
      where ps.player_id = new.player_id
        and ps.captured_at < coalesce(new.last_synced_at, now())
    ) into v_has_prior_snapshot;

    if v_has_prior_snapshot then
      insert into public.player_unit_progression_history (
        player_id, guild_id, base_id, event_type, changed_at, changed_fields,
        previous_state, new_state, source, metadata
      ) values (
        new.player_id,
        v_guild_id,
        new.base_id,
        'unlocked',
        coalesce(new.last_synced_at, now()),
        array['unlocked'],
        null,
        v_new,
        'guild_sync',
        jsonb_build_object('detectedBy', 'player_units_current_insert')
      );
    end if;
    return new;
  end if;

  if old.rarity is distinct from new.rarity then v_fields := array_append(v_fields, 'rarity'); end if;
  if old.level is distinct from new.level then v_fields := array_append(v_fields, 'level'); end if;
  if old.gear_level is distinct from new.gear_level then v_fields := array_append(v_fields, 'gearLevel'); end if;
  if old.relic_tier is distinct from new.relic_tier then v_fields := array_append(v_fields, 'relicTier'); end if;
  if old.galactic_power is distinct from new.galactic_power then v_fields := array_append(v_fields, 'galacticPower'); end if;
  if old.zeta_count is distinct from new.zeta_count then v_fields := array_append(v_fields, 'zetaCount'); end if;
  if old.omicron_count is distinct from new.omicron_count then v_fields := array_append(v_fields, 'omicronCount'); end if;
  if old.ultimate_unlocked is distinct from new.ultimate_unlocked then v_fields := array_append(v_fields, 'ultimateUnlocked'); end if;
  if coalesce(old.metadata, '{}'::jsonb) is distinct from coalesce(new.metadata, '{}'::jsonb) then v_fields := array_append(v_fields, 'metadata'); end if;

  if cardinality(v_fields) = 0 then
    return new;
  end if;

  v_previous := jsonb_build_object(
    'rarity', old.rarity,
    'level', old.level,
    'gearLevel', old.gear_level,
    'relicTier', old.relic_tier,
    'galacticPower', old.galactic_power,
    'zetaCount', old.zeta_count,
    'omicronCount', old.omicron_count,
    'ultimateUnlocked', old.ultimate_unlocked,
    'metadata', coalesce(old.metadata, '{}'::jsonb)
  );

  insert into public.player_unit_progression_history (
    player_id, guild_id, base_id, event_type, changed_at, changed_fields,
    previous_state, new_state, source, metadata
  ) values (
    new.player_id,
    v_guild_id,
    new.base_id,
    'progression_change',
    coalesce(new.last_synced_at, now()),
    v_fields,
    v_previous,
    v_new,
    'guild_sync',
    jsonb_build_object('detectedBy', 'player_units_current_update')
  );

  return new;
end;
$$;

drop trigger if exists player_units_capture_progression on public.player_units_current;
create trigger player_units_capture_progression
after insert or update on public.player_units_current
for each row
execute function private.capture_player_unit_progression();

revoke all on function private.capture_player_unit_progression() from public;
revoke all on function private.capture_player_unit_progression() from anon;
revoke all on function private.capture_player_unit_progression() from authenticated;

comment on table public.player_unit_progression_history is
  'Change-only unit history for unlocks and progression changes. Avoids duplicating unchanged full rosters while retaining rich before/after state for analytics.';
comment on function private.capture_player_unit_progression() is
  'Captures unit progression after an initial baseline exists. Initial Guild ingestion does not emit an unlock event for every pre-existing unit.';
