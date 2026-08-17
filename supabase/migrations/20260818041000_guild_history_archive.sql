create table if not exists public.guild_history_archives (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  archive_key text not null,
  payload_version integer not null check (payload_version >= 1),
  source text not null,
  source_ref text not null,
  source_sha256 text not null,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  payload jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, archive_key)
);

create index if not exists guild_history_archives_guild_time_idx
  on public.guild_history_archives(guild_id, last_observed_at desc);

alter table public.guild_history_archives enable row level security;

create or replace function public.read_guild_history_coverage(p_ally_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := regexp_replace(coalesce(p_ally_code,''),'[^0-9]','','g');
  v_guild_id uuid;
  v_archive public.guild_history_archives%rowtype;
begin
  if length(v_code) <> 9 then return null; end if;
  select current_guild_id into v_guild_id from public.players where ally_code=v_code limit 1;
  if v_guild_id is null then return null; end if;
  select * into v_archive
  from public.guild_history_archives
  where guild_id=v_guild_id
  order by payload_version desc, updated_at desc
  limit 1;
  if not found then
    return jsonb_build_object('guildId',v_guild_id,'available',false);
  end if;
  return jsonb_build_object(
    'guildId',v_guild_id,
    'available',true,
    'archiveKey',v_archive.archive_key,
    'payloadVersion',v_archive.payload_version,
    'source',v_archive.source,
    'sourceRef',v_archive.source_ref,
    'sourceSha256',v_archive.source_sha256,
    'firstObservedAt',v_archive.first_observed_at,
    'lastObservedAt',v_archive.last_observed_at,
    'counts',coalesce(v_archive.payload->'meta'->'counts','{}'::jsonb),
    'relicNormalization',v_archive.payload->'meta'->>'relicNormalization',
    'importedAt',v_archive.imported_at,
    'updatedAt',v_archive.updated_at
  );
end
$$;

create or replace function public.read_guild_history_section(p_ally_code text, p_section text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := regexp_replace(coalesce(p_ally_code,''),'[^0-9]','','g');
  v_guild_id uuid;
  v_payload jsonb;
  v_section text := coalesce(p_section,'');
begin
  if length(v_code) <> 9 then return null; end if;
  if v_section not in ('meta','dict','guildSnapshots','playerMonthly','membershipPeriods','returns','trackedUnitMilestones','tickets','raids','rote','reva') then
    raise exception 'Unsupported Guild history section';
  end if;
  select current_guild_id into v_guild_id from public.players where ally_code=v_code limit 1;
  if v_guild_id is null then return null; end if;
  select payload into v_payload
  from public.guild_history_archives
  where guild_id=v_guild_id
  order by payload_version desc, updated_at desc
  limit 1;
  if v_payload is null then return null; end if;
  return v_payload->v_section;
end
$$;

revoke all on table public.guild_history_archives from anon, authenticated;
revoke all on function public.read_guild_history_coverage(text) from public, anon, authenticated;
revoke all on function public.read_guild_history_section(text,text) from public, anon, authenticated;
grant execute on function public.read_guild_history_coverage(text) to service_role;
grant execute on function public.read_guild_history_section(text,text) to service_role;
