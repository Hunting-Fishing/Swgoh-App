create table if not exists public.guild_sync_stage_members (
  job_id uuid not null references public.guild_sync_jobs(id) on delete cascade,
  member_index integer not null check (member_index >= 0),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  requester_user_id uuid not null,
  swgoh_player_id text not null,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  payload jsonb not null,
  staged_at timestamptz not null default now(),
  primary key (job_id, member_index),
  unique (job_id, swgoh_player_id),
  unique (job_id, ally_code)
);

create index if not exists guild_sync_stage_members_guild_idx on public.guild_sync_stage_members(guild_id, job_id);
alter table public.guild_sync_stage_members enable row level security;
revoke all on public.guild_sync_stage_members from anon, authenticated;

drop function if exists public.finalize_staged_guild_sync(uuid, jsonb);
create function public.finalize_staged_guild_sync(p_job_id uuid, p_header jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.guild_sync_jobs%rowtype;
  v_stage_count integer := 0;
  v_expected integer := 0;
  v_payload jsonb;
  v_result jsonb;
begin
  if p_job_id is null or p_header is null then raise exception 'A Guild sync job and header payload are required.'; end if;
  select * into v_job from public.guild_sync_jobs where id = p_job_id for update;
  if not found then raise exception 'Guild sync job was not found.'; end if;
  if v_job.status <> 'running' then raise exception 'Guild sync job must be running before staged finalize (status=%).', v_job.status; end if;
  if coalesce(p_header->>'requesterUserId', '') <> v_job.requested_by_user_id::text then raise exception 'Staged Guild sync requester does not match the queued job.'; end if;
  v_expected := greatest(0, coalesce((p_header->'hydration'->>'requested')::integer, 0));
  if v_expected <= 0 then raise exception 'Staged Guild sync header has no expected member count.'; end if;
  select count(*)::integer into v_stage_count from public.guild_sync_stage_members s where s.job_id = p_job_id and s.guild_id = v_job.guild_id and s.requester_user_id = v_job.requested_by_user_id;
  if v_stage_count <> v_expected then raise exception 'Staged Guild sync member count mismatch (%/%).', v_stage_count, v_expected; end if;
  if exists (select 1 from public.guild_sync_stage_members s where s.job_id = p_job_id and (s.guild_id <> v_job.guild_id or s.requester_user_id <> v_job.requested_by_user_id)) then raise exception 'Staged Guild sync contains cross-tenant rows.'; end if;
  select (p_header - 'members') || jsonb_build_object('members', coalesce(jsonb_agg(s.payload order by s.member_index), '[]'::jsonb)) into v_payload from public.guild_sync_stage_members s where s.job_id = p_job_id;
  if jsonb_array_length(coalesce(v_payload->'members', '[]'::jsonb)) <> v_expected then raise exception 'Staged Guild sync aggregate is incomplete.'; end if;
  v_result := public.ingest_verified_user_guild_sync(v_payload);
  delete from public.guild_sync_stage_members where job_id = p_job_id;
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('stagedMembers', v_stage_count, 'boundedTransport', true);
end;
$$;

revoke all on function public.finalize_staged_guild_sync(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_staged_guild_sync(uuid, jsonb) to service_role;
comment on table public.guild_sync_stage_members is 'Service-role-only bounded staging for rich Guild members. Pages are staged independently and atomically finalized through the verified Guild ingestion RPC.';
comment on function public.finalize_staged_guild_sync(uuid, jsonb) is 'Validates one running Guild sync job, reconstructs the complete member array inside Postgres, invokes verified transactional ingestion, then removes staging rows.';
