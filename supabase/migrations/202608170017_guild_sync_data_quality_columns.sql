alter table public.guild_sync_runs
  add column if not exists calculation_complete boolean,
  add column if not exists calculation_requested integer,
  add column if not exists calculation_calculated integer,
  add column if not exists calculation_failed integer,
  add column if not exists data_quality text;

alter table public.guild_sync_runs
  drop constraint if exists guild_sync_runs_calculation_requested_check,
  add constraint guild_sync_runs_calculation_requested_check check (calculation_requested is null or calculation_requested >= 0),
  drop constraint if exists guild_sync_runs_calculation_calculated_check,
  add constraint guild_sync_runs_calculation_calculated_check check (calculation_calculated is null or calculation_calculated >= 0),
  drop constraint if exists guild_sync_runs_calculation_failed_check,
  add constraint guild_sync_runs_calculation_failed_check check (calculation_failed is null or calculation_failed >= 0),
  drop constraint if exists guild_sync_runs_data_quality_check,
  add constraint guild_sync_runs_data_quality_check check (
    data_quality is null or data_quality = any(array[
      'hydrated-and-stats-complete'::text,
      'hydrated-raw-stats-partial'::text
    ])
  );

create or replace function private.normalize_guild_sync_data_quality()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_calculation jsonb := coalesce(new.metadata->'calculation', '{}'::jsonb);
begin
  new.calculation_complete := case
    when v_calculation ? 'complete' then coalesce((v_calculation->>'complete')::boolean, false)
    else null
  end;
  new.calculation_requested := case
    when nullif(v_calculation->>'requested', '') is not null then greatest(0, (v_calculation->>'requested')::integer)
    else null
  end;
  new.calculation_calculated := case
    when nullif(v_calculation->>'calculated', '') is not null then greatest(0, (v_calculation->>'calculated')::integer)
    else null
  end;
  new.calculation_failed := case
    when nullif(v_calculation->>'failed', '') is not null then greatest(0, (v_calculation->>'failed')::integer)
    else null
  end;
  new.data_quality := coalesce(
    nullif(v_calculation->>'dataQuality', ''),
    case
      when new.calculation_complete is true then 'hydrated-and-stats-complete'
      when v_calculation <> '{}'::jsonb then 'hydrated-raw-stats-partial'
      else null
    end
  );
  return new;
end;
$$;

drop trigger if exists guild_sync_runs_normalize_data_quality on public.guild_sync_runs;
create trigger guild_sync_runs_normalize_data_quality
before insert or update of metadata on public.guild_sync_runs
for each row execute function private.normalize_guild_sync_data_quality();

update public.guild_sync_runs
set metadata = metadata
where metadata ? 'calculation';

create index if not exists guild_sync_runs_quality_started_idx
  on public.guild_sync_runs(guild_id, data_quality, started_at desc);

comment on column public.guild_sync_runs.data_quality is
  'Typed quality classification for persisted Guild roster syncs. Raw roster hydration must be complete; SWGOH Stats enrichment may be partial.';
