create table if not exists public.guild_historical_dataset_coverage (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  dataset_key text not null,
  source text not null,
  source_ref text not null,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  event_count integer not null default 0,
  observation_count bigint not null default 0,
  import_status text not null default 'discovered' check(import_status in ('discovered','partial','imported')),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(guild_id,dataset_key,source)
);
alter table public.guild_historical_dataset_coverage enable row level security;

insert into public.guild_historical_dataset_coverage(guild_id,dataset_key,source,source_ref,first_observed_at,last_observed_at,event_count,observation_count,import_status,metadata)
select g.id,v.dataset_key,'lv-unit-tracker-workbook',v.source_ref,v.first_at,v.last_at,v.events,v.observations,'discovered',jsonb_build_object('workbookSha256','4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d','validated',true)
from public.guilds g cross join (values
  ('member_snapshots','Member Data_Backup_20260605_195','2022-12-23T01:47:39.094Z'::timestamptz,'2026-06-05T23:33:53.906Z'::timestamptz,665,33115::bigint),
  ('raid_tickets','Raid Ticket Data','2023-12-24T00:00:00Z','2026-08-14T23:59:59Z',1009,50382::bigint),
  ('raid_results','Endor Performance Data','2023-11-25T00:00:00Z','2026-08-06T23:59:59Z',136,6749::bigint),
  ('rote_performance','ROTE Data','2023-06-12T04:00:00Z','2026-08-03T04:00:00Z',81,4037::bigint),
  ('reva_shards','ROTE Reva Shards','2023-08-07T00:00:00Z','2026-08-03T23:59:59Z',76,3784::bigint)
) as v(dataset_key,source_ref,first_at,last_at,events,observations)
where g.swgoh_guild_id='3xa5z9KySv25kY3GH9FNvg'
on conflict(guild_id,dataset_key,source) do update set
  source_ref=excluded.source_ref,
  first_observed_at=excluded.first_observed_at,
  last_observed_at=excluded.last_observed_at,
  event_count=excluded.event_count,
  observation_count=excluded.observation_count,
  metadata=excluded.metadata,
  updated_at=now();

create or replace function public.read_guild_historical_coverage(p_ally_code text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_code text:=regexp_replace(coalesce(p_ally_code,''),'[^0-9]','','g'); v_gid uuid;
begin
  if length(v_code)<>9 then return null; end if;
  select current_guild_id into v_gid from public.players where ally_code=v_code limit 1;
  if v_gid is null then return null; end if;
  return jsonb_build_object(
    'guildId',v_gid,
    'datasets',coalesce((select jsonb_agg(jsonb_build_object(
      'datasetKey',dataset_key,'sourceRef',source_ref,'firstObservedAt',first_observed_at,
      'lastObservedAt',last_observed_at,'eventCount',event_count,'observationCount',observation_count,
      'importStatus',import_status,'metadata',metadata) order by first_observed_at)
      from public.guild_historical_dataset_coverage where guild_id=v_gid),'[]'::jsonb),
    'totals',jsonb_build_object(
      'datasets',(select count(*) from public.guild_historical_dataset_coverage where guild_id=v_gid),
      'sourceEvents',(select coalesce(sum(event_count),0) from public.guild_historical_dataset_coverage where guild_id=v_gid),
      'observations',(select coalesce(sum(observation_count),0) from public.guild_historical_dataset_coverage where guild_id=v_gid))
  );
end $$;
revoke all on function public.read_guild_historical_coverage(text) from public,anon,authenticated;
grant execute on function public.read_guild_historical_coverage(text) to service_role;
