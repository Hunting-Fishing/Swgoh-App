create table if not exists public.guild_tb_phase_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.guild_tb_events(id) on delete cascade,
  phase text not null,
  snapshot_kind text not null default 'route_apply',
  snapshot_at timestamptz not null default now(),
  guild_gp bigint check (guild_gp is null or guild_gp >= 0),
  zone_state_json jsonb not null default '[]'::jsonb,
  member_completion_json jsonb not null default '[]'::jsonb,
  operations_json jsonb not null default '{}'::jsonb,
  projected_stars integer check (projected_stars is null or projected_stars >= 0),
  projection_inputs_json jsonb not null default '{}'::jsonb,
  route_plan_json jsonb not null default '{}'::jsonb,
  input_fingerprint text not null,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guild_tb_phase_snapshots_phase_check check (phase ~ '^P[1-6]$'),
  constraint guild_tb_phase_snapshots_kind_check check (snapshot_kind in ('route_apply','projection','phase_close','manual')),
  constraint guild_tb_phase_snapshots_fingerprint_check check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  unique(event_id, phase, snapshot_kind, input_fingerprint)
);

create index if not exists guild_tb_phase_snapshots_event_phase_idx
  on public.guild_tb_phase_snapshots(event_id, phase, snapshot_at desc);

alter table public.guild_tb_phase_snapshots enable row level security;
revoke all on table public.guild_tb_phase_snapshots from anon, authenticated;
revoke update, delete, truncate on table public.guild_tb_phase_snapshots from service_role;
grant select, insert on table public.guild_tb_phase_snapshots to service_role;

comment on table public.guild_tb_phase_snapshots is 'Immutable TB phase/optimizer evidence snapshots. Route applications preserve the exact server event state, explicit optimizer inputs, deterministic result and SHA-256 input fingerprint used to issue officer commands.';

create or replace function public.apply_guild_tb_route_plan(
  p_event_id uuid,
  p_phase text,
  p_created_by_user_id uuid,
  p_input_fingerprint text,
  p_zone_state_json jsonb,
  p_projection_inputs_json jsonb,
  p_route_plan_json jsonb,
  p_zone_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_requested integer := 0;
  v_distinct_planets integer := 0;
  v_matched integer := 0;
  v_applied integer := 0;
  v_now timestamptz := now();
begin
  if p_phase is null or p_phase !~ '^P[1-6]$' then
    raise exception 'TB_ROUTE_PHASE_INVALID';
  end if;
  if p_input_fingerprint is null or p_input_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'TB_ROUTE_FINGERPRINT_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_zone_state_json, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_zone_updates, '[]'::jsonb)) <> 'array' then
    raise exception 'TB_ROUTE_PAYLOAD_INVALID';
  end if;

  perform 1
  from public.guild_tb_events e
  where e.id = p_event_id
    and e.status = 'active'
    and e.current_phase = p_phase
  for update;
  if not found then
    raise exception 'TB_ROUTE_EVENT_STALE';
  end if;

  select count(*), count(distinct u->>'planetId')
    into v_requested, v_distinct_planets
  from jsonb_array_elements(coalesce(p_zone_updates, '[]'::jsonb)) u;

  if v_requested <> v_distinct_planets then
    raise exception 'TB_ROUTE_DUPLICATE_ZONE_UPDATE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_zone_updates, '[]'::jsonb)) u
    where coalesce(u->>'planetId', '') !~ '^[a-z0-9-]{2,80}$'
       or coalesce(u->>'command', '') not in ('attack','preload','hold','deploy','stop')
       or nullif(u->>'expectedUpdatedAt', '') is null
  ) then
    raise exception 'TB_ROUTE_ZONE_UPDATE_INVALID';
  end if;

  select count(*) into v_matched
  from public.guild_tb_zone_states z
  join jsonb_array_elements(coalesce(p_zone_updates, '[]'::jsonb)) u
    on z.planet_id = u->>'planetId'
  where z.event_id = p_event_id
    and z.phase = p_phase
    and z.locked_by_officer = false
    and z.updated_at = nullif(u->>'expectedUpdatedAt', '')::timestamptz;

  if v_matched <> v_requested then
    raise exception 'TB_ROUTE_STATE_STALE';
  end if;

  insert into public.guild_tb_phase_snapshots (
    event_id,
    phase,
    snapshot_kind,
    snapshot_at,
    zone_state_json,
    projection_inputs_json,
    route_plan_json,
    input_fingerprint,
    created_by_user_id,
    metadata
  ) values (
    p_event_id,
    p_phase,
    'route_apply',
    v_now,
    coalesce(p_zone_state_json, '[]'::jsonb),
    coalesce(p_projection_inputs_json, '{}'::jsonb),
    coalesce(p_route_plan_json, '{}'::jsonb),
    p_input_fingerprint,
    p_created_by_user_id,
    jsonb_build_object('source', 'tb-route-apply-service-v1')
  )
  on conflict (event_id, phase, snapshot_kind, input_fingerprint) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select s.id into v_snapshot_id
    from public.guild_tb_phase_snapshots s
    where s.event_id = p_event_id
      and s.phase = p_phase
      and s.snapshot_kind = 'route_apply'
      and s.input_fingerprint = p_input_fingerprint
    limit 1;
  end if;

  update public.guild_tb_zone_states z
  set command_state = u.command_state,
      command_message = left(u.command_message, 800),
      source_kind = 'officer',
      updated_by_user_id = p_created_by_user_id,
      metadata = coalesce(z.metadata, '{}'::jsonb) || jsonb_build_object(
        'routeOptimizer', jsonb_build_object(
          'inputFingerprint', p_input_fingerprint,
          'snapshotId', v_snapshot_id,
          'appliedAt', v_now
        )
      ),
      updated_at = v_now
  from (
    select
      item->>'planetId' as planet_id,
      item->>'command' as command_state,
      coalesce(item->>'commandMessage', '') as command_message,
      nullif(item->>'expectedUpdatedAt', '')::timestamptz as expected_updated_at
    from jsonb_array_elements(coalesce(p_zone_updates, '[]'::jsonb)) item
  ) u
  where z.event_id = p_event_id
    and z.phase = p_phase
    and z.planet_id = u.planet_id
    and z.locked_by_officer = false
    and z.updated_at = u.expected_updated_at;

  get diagnostics v_applied = row_count;
  if v_applied <> v_requested then
    raise exception 'TB_ROUTE_APPLY_CONCURRENCY_FAILURE';
  end if;

  return jsonb_build_object(
    'snapshotId', v_snapshot_id,
    'inputFingerprint', p_input_fingerprint,
    'appliedZoneCount', v_applied,
    'appliedAt', v_now
  );
end;
$$;

revoke all on function public.apply_guild_tb_route_plan(uuid,text,uuid,text,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_guild_tb_route_plan(uuid,text,uuid,text,jsonb,jsonb,jsonb,jsonb) to service_role;

comment on function public.apply_guild_tb_route_plan(uuid,text,uuid,text,jsonb,jsonb,jsonb,jsonb) is 'Atomically verifies unlocked zone versions, records an immutable route optimizer snapshot, and applies generated officer commands. Locked zones are never writable through this function.';
