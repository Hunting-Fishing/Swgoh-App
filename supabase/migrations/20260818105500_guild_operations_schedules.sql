create table if not exists public.guild_operation_schedules (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  created_by_user_id uuid not null,
  requested_by_player_id uuid not null references public.players(id) on delete cascade,
  lookup_ally_code text not null check (lookup_ally_code ~ '^[0-9]{9}$'),
  run_type text not null check (run_type in ('tb','tw')),
  plan_id uuid not null,
  name text not null default 'Scheduled Guild Operation',
  status text not null default 'active' check (status in ('active','paused','completed','failed')),
  recurrence_kind text not null default 'once' check (recurrence_kind in ('once','daily','weekly')),
  scheduled_timezone text not null default 'UTC',
  scheduled_local_time time not null default '00:00:00',
  scheduled_weekday integer check (scheduled_weekday is null or scheduled_weekday between 0 and 6),
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  destination_id uuid references public.guild_discord_destinations(id) on delete set null,
  include_mentions boolean not null default false,
  send_dms boolean not null default false,
  auto_publish boolean not null default true,
  stage text not null default 'idle' check (stage in ('idle','syncing','planning','publishing','complete','failed')),
  sync_job_id uuid references public.guild_sync_jobs(id) on delete set null,
  last_assignment_run_id uuid,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_operation_schedules_due_idx
  on public.guild_operation_schedules(status,next_run_at)
  where status='active';
create index if not exists guild_operation_schedules_guild_idx
  on public.guild_operation_schedules(guild_id,updated_at desc);
create index if not exists guild_operation_schedules_sync_job_idx
  on public.guild_operation_schedules(sync_job_id)
  where sync_job_id is not null;

alter table public.guild_operation_schedules enable row level security;
revoke all on table public.guild_operation_schedules from anon,authenticated;
grant select,insert,update,delete on table public.guild_operation_schedules to service_role;

create or replace function public.claim_due_guild_operation_schedules(
  p_worker_id text,
  p_limit integer default 2,
  p_stale_seconds integer default 300
)
returns setof public.guild_operation_schedules
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  return query
  with candidates as (
    select s.id
    from public.guild_operation_schedules s
    where s.status='active'
      and (
        (s.stage='idle' and s.next_run_at<=now())
        or (s.stage in ('syncing','planning','publishing') and (s.locked_at is null or s.locked_at<now()-make_interval(secs=>greatest(60,p_stale_seconds))))
      )
    order by s.next_run_at asc,s.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,2),10))
  )
  update public.guild_operation_schedules s
  set locked_at=now(),locked_by=left(coalesce(p_worker_id,'guild-operations-worker'),180),updated_at=now()
  from candidates c
  where s.id=c.id
  returning s.*;
end
$$;

create or replace function public.advance_guild_operation_schedule(
  p_schedule_id uuid,
  p_success boolean,
  p_assignment_run_id uuid default null,
  p_error text default null
)
returns public.guild_operation_schedules
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_row public.guild_operation_schedules%rowtype; v_next timestamptz;
begin
  select * into v_row from public.guild_operation_schedules where id=p_schedule_id for update;
  if not found then raise exception 'Guild Operation schedule not found'; end if;

  if p_success then
    v_next := case v_row.recurrence_kind
      when 'daily' then v_row.next_run_at + interval '1 day'
      when 'weekly' then v_row.next_run_at + interval '7 days'
      else null
    end;
    update public.guild_operation_schedules
    set last_run_at=now(),last_assignment_run_id=coalesce(p_assignment_run_id,last_assignment_run_id),
        status=case when recurrence_kind='once' then 'completed' else 'active' end,
        stage=case when recurrence_kind='once' then 'complete' else 'idle' end,
        next_run_at=coalesce(v_next,next_run_at),sync_job_id=null,attempt_count=0,last_error=null,
        locked_at=null,locked_by=null,updated_at=now()
    where id=p_schedule_id returning * into v_row;
  else
    update public.guild_operation_schedules
    set attempt_count=attempt_count+1,
        status=case when attempt_count+1>=max_attempts then 'failed' else status end,
        stage=case when attempt_count+1>=max_attempts then 'failed' else 'idle' end,
        next_run_at=case when attempt_count+1>=max_attempts then next_run_at else now()+make_interval(mins=>least(30,5*(attempt_count+1))) end,
        sync_job_id=null,last_error=left(coalesce(p_error,'Scheduled Guild Operation failed.'),1000),
        locked_at=null,locked_by=null,updated_at=now()
    where id=p_schedule_id returning * into v_row;
  end if;
  return v_row;
end
$$;

revoke all on function public.claim_due_guild_operation_schedules(text,integer,integer) from public,anon,authenticated;
revoke all on function public.advance_guild_operation_schedule(uuid,boolean,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_due_guild_operation_schedules(text,integer,integer) to service_role;
grant execute on function public.advance_guild_operation_schedule(uuid,boolean,uuid,text) to service_role;
