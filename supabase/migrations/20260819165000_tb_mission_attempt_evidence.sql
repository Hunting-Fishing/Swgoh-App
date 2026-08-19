create table if not exists public.guild_tb_mission_attempts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  event_id uuid not null references public.guild_tb_events(id) on delete cascade,
  phase text not null,
  planet_id text not null,
  mission_id text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  ally_code text not null,
  result_code text not null,
  team_snapshot jsonb not null default '{}'::jsonb,
  note text not null default '',
  source_kind text not null default 'member_report',
  revision integer not null default 1 check (revision >= 1),
  is_current boolean not null default true,
  supersedes_attempt_id uuid references public.guild_tb_mission_attempts(id) on delete set null,
  correction_reason text not null default '',
  reported_by_user_id uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint guild_tb_mission_attempts_phase_check check (phase ~ '^P[1-6]$'),
  constraint guild_tb_mission_attempts_planet_check check (planet_id ~ '^[a-z0-9-]{2,80}$'),
  constraint guild_tb_mission_attempts_mission_check check (mission_id ~ '^[a-z0-9-]{2,120}$'),
  constraint guild_tb_mission_attempts_ally_check check (ally_code ~ '^[0-9]{9}$'),
  constraint guild_tb_mission_attempts_result_check check (result_code in ('2/2','1/2','0/2','failed','skipped')),
  constraint guild_tb_mission_attempts_source_check check (source_kind in ('member_report','officer_correction','canonical_import')),
  constraint guild_tb_mission_attempts_superseded_check check (
    (is_current = true and superseded_at is null)
    or (is_current = false and superseded_at is not null)
  )
);

create unique index if not exists guild_tb_mission_attempts_current_member_idx
  on public.guild_tb_mission_attempts(event_id, mission_id, player_id)
  where is_current = true;

create index if not exists guild_tb_mission_attempts_guild_mission_idx
  on public.guild_tb_mission_attempts(guild_id, mission_id, is_current, reported_at desc);
create index if not exists guild_tb_mission_attempts_event_phase_idx
  on public.guild_tb_mission_attempts(event_id, phase, mission_id, is_current, reported_at desc);
create index if not exists guild_tb_mission_attempts_player_idx
  on public.guild_tb_mission_attempts(player_id, mission_id, is_current, reported_at desc);

alter table public.guild_tb_mission_attempts enable row level security;
revoke all on table public.guild_tb_mission_attempts from anon, authenticated;
grant select, insert, update on table public.guild_tb_mission_attempts to service_role;

comment on table public.guild_tb_mission_attempts is 'Versioned member-reported TB mission outcomes. Current evidence is separated from immutable superseded revisions so Guild history and officer corrections remain auditable.';

create or replace function public.record_guild_tb_mission_attempt(
  p_guild_id uuid,
  p_event_id uuid,
  p_phase text,
  p_planet_id text,
  p_mission_id text,
  p_player_id uuid,
  p_ally_code text,
  p_result_code text,
  p_team_snapshot jsonb,
  p_note text,
  p_reported_by_user_id uuid,
  p_source_kind text,
  p_allow_correction boolean default false,
  p_expected_current_attempt_id uuid default null,
  p_correction_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_guild_id uuid;
  v_current public.guild_tb_mission_attempts%rowtype;
  v_revision integer := 1;
  v_new_id uuid;
  v_now timestamptz := now();
begin
  if p_phase is null or p_phase !~ '^P[1-6]$' then
    raise exception 'TB_ATTEMPT_PHASE_INVALID';
  end if;
  if coalesce(p_planet_id, '') !~ '^[a-z0-9-]{2,80}$'
     or coalesce(p_mission_id, '') !~ '^[a-z0-9-]{2,120}$'
     or coalesce(p_ally_code, '') !~ '^[0-9]{9}$' then
    raise exception 'TB_ATTEMPT_IDENTITY_INVALID';
  end if;
  if p_result_code not in ('2/2','1/2','0/2','failed','skipped') then
    raise exception 'TB_ATTEMPT_RESULT_INVALID';
  end if;
  if p_source_kind not in ('member_report','officer_correction','canonical_import') then
    raise exception 'TB_ATTEMPT_SOURCE_INVALID';
  end if;
  if p_allow_correction = false and p_source_kind = 'officer_correction' then
    raise exception 'TB_ATTEMPT_CORRECTION_FLAG_REQUIRED';
  end if;

  select e.guild_id into v_event_guild_id
  from public.guild_tb_events e
  where e.id = p_event_id;
  if v_event_guild_id is null or v_event_guild_id <> p_guild_id then
    raise exception 'TB_ATTEMPT_EVENT_GUILD_MISMATCH';
  end if;

  select * into v_current
  from public.guild_tb_mission_attempts a
  where a.event_id = p_event_id
    and a.mission_id = p_mission_id
    and a.player_id = p_player_id
    and a.is_current = true
  for update;

  if found then
    if p_allow_correction = false then
      raise exception 'TB_ATTEMPT_ALREADY_REPORTED';
    end if;
    if p_expected_current_attempt_id is null or v_current.id <> p_expected_current_attempt_id then
      raise exception 'TB_ATTEMPT_STATE_STALE';
    end if;
    if length(trim(coalesce(p_correction_reason, ''))) < 3 then
      raise exception 'TB_ATTEMPT_CORRECTION_REASON_REQUIRED';
    end if;
    v_revision := v_current.revision + 1;
    update public.guild_tb_mission_attempts
    set is_current = false,
        superseded_at = v_now,
        superseded_by_user_id = p_reported_by_user_id
    where id = v_current.id;
  elsif p_allow_correction = true then
    raise exception 'TB_ATTEMPT_NOT_FOUND';
  end if;

  insert into public.guild_tb_mission_attempts (
    guild_id,
    event_id,
    phase,
    planet_id,
    mission_id,
    player_id,
    ally_code,
    result_code,
    team_snapshot,
    note,
    source_kind,
    revision,
    is_current,
    supersedes_attempt_id,
    correction_reason,
    reported_by_user_id,
    reported_at,
    metadata
  ) values (
    p_guild_id,
    p_event_id,
    p_phase,
    p_planet_id,
    p_mission_id,
    p_player_id,
    p_ally_code,
    p_result_code,
    coalesce(p_team_snapshot, '{}'::jsonb),
    left(coalesce(p_note, ''), 1200),
    p_source_kind,
    v_revision,
    true,
    case when v_current.id is null then null else v_current.id end,
    left(coalesce(p_correction_reason, ''), 600),
    p_reported_by_user_id,
    v_now,
    '{}'::jsonb
  ) returning id into v_new_id;

  return jsonb_build_object(
    'id', v_new_id,
    'revision', v_revision,
    'supersedesAttemptId', case when v_current.id is null then null else v_current.id end,
    'reportedAt', v_now
  );
end;
$$;

revoke all on function public.record_guild_tb_mission_attempt(uuid,uuid,text,text,text,uuid,text,text,jsonb,text,uuid,text,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.record_guild_tb_mission_attempt(uuid,uuid,text,text,text,uuid,text,text,jsonb,text,uuid,text,boolean,uuid,text) to service_role;

comment on function public.record_guild_tb_mission_attempt(uuid,uuid,text,text,text,uuid,text,text,jsonb,text,uuid,text,boolean,uuid,text) is 'Atomically creates a first member mission report or an officer correction revision. Corrections require the exact current attempt ID and preserve the superseded row.';
