create table public.guild_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  requested_by_user_id uuid references public.profiles(id) on delete set null,
  requested_by_player_id uuid references public.players(id) on delete set null,
  trigger_kind text not null default 'user' check (trigger_kind in ('user','scheduled','guild_reset','tb_event','tw_event','raid_event','system')),
  priority smallint not null default 50 check (priority between 0 and 100),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  include_activity boolean not null default true,
  force_refresh boolean not null default true,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  sync_run_id uuid references public.guild_sync_runs(id) on delete set null,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'running' and claimed_at is not null) or status <> 'running'),
  check ((status in ('completed','failed','cancelled') and completed_at is not null) or status not in ('completed','failed','cancelled'))
);

create unique index guild_sync_jobs_one_active_per_guild
  on public.guild_sync_jobs(guild_id)
  where status in ('queued','running');

create index guild_sync_jobs_worker_idx
  on public.guild_sync_jobs(status, priority desc, run_after asc, created_at asc)
  where status = 'queued';

create index guild_sync_jobs_guild_history_idx
  on public.guild_sync_jobs(guild_id, created_at desc);

alter table public.guild_sync_jobs enable row level security;

create policy guild_sync_jobs_select_authorized
on public.guild_sync_jobs
for select
to authenticated
using (private.user_has_guild_access(guild_id));

grant select on public.guild_sync_jobs to authenticated;

create or replace function public.enqueue_verified_user_guild_sync(
  p_user_id uuid,
  p_priority smallint default 80
)
returns public.guild_sync_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_membership public.guild_user_memberships%rowtype;
  v_job public.guild_sync_jobs%rowtype;
begin
  select gum.* into v_membership
  from public.guild_user_memberships gum
  join public.user_player_links upl
    on upl.user_id = gum.user_id
   and upl.player_id = gum.player_id
   and upl.verification_status = 'verified'
  where gum.user_id = p_user_id
    and gum.status = 'active'
  order by gum.updated_at desc
  limit 1;

  if v_membership.guild_id is null then
    raise exception 'No verified active Guild membership exists for this user.';
  end if;

  select * into v_job
  from public.guild_sync_jobs
  where guild_id = v_membership.guild_id
    and status in ('queued','running')
  order by created_at desc
  limit 1;

  if v_job.id is not null then
    return v_job;
  end if;

  insert into public.guild_sync_jobs (
    guild_id,
    requested_by_user_id,
    requested_by_player_id,
    trigger_kind,
    priority,
    status,
    include_activity,
    force_refresh,
    run_after,
    metadata
  ) values (
    v_membership.guild_id,
    p_user_id,
    v_membership.player_id,
    'user',
    least(100, greatest(0, coalesce(p_priority, 80))),
    'queued',
    true,
    true,
    now(),
    jsonb_build_object('source', 'command-center-user')
  ) returning * into v_job;

  return v_job;
end;
$$;

create or replace function public.claim_guild_sync_jobs(
  p_worker_id text,
  p_limit integer default 1
)
returns setof public.guild_sync_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'Worker ID is required.';
  end if;

  return query
  with selected as (
    select id
    from public.guild_sync_jobs
    where status = 'queued'
      and run_after <= now()
      and attempt_count < max_attempts
    order by priority desc, run_after asc, created_at asc
    for update skip locked
    limit least(25, greatest(1, coalesce(p_limit, 1)))
  )
  update public.guild_sync_jobs jobs
  set status = 'running',
      claimed_at = now(),
      claimed_by = left(p_worker_id, 120),
      attempt_count = jobs.attempt_count + 1,
      updated_at = now()
  from selected
  where jobs.id = selected.id
  returning jobs.*;
end;
$$;

revoke all on function public.enqueue_verified_user_guild_sync(uuid, smallint) from public;
revoke all on function public.enqueue_verified_user_guild_sync(uuid, smallint) from anon;
revoke all on function public.enqueue_verified_user_guild_sync(uuid, smallint) from authenticated;
grant execute on function public.enqueue_verified_user_guild_sync(uuid, smallint) to service_role;

revoke all on function public.claim_guild_sync_jobs(text, integer) from public;
revoke all on function public.claim_guild_sync_jobs(text, integer) from anon;
revoke all on function public.claim_guild_sync_jobs(text, integer) from authenticated;
grant execute on function public.claim_guild_sync_jobs(text, integer) to service_role;

comment on table public.guild_sync_jobs is
  'Durable tenant-scoped Guild synchronization queue. User-triggered jobs retain the signed requester; scheduled jobs remain scoped to one onboarded Guild.';
comment on function public.enqueue_verified_user_guild_sync(uuid, smallint) is
  'Service-role-only enqueue function that resolves the Guild from a verified active user membership instead of accepting a client-selected Guild ID.';
comment on function public.claim_guild_sync_jobs(text, integer) is
  'Service-role-only worker claim using FOR UPDATE SKIP LOCKED for concurrent production workers.';
