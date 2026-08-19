create table if not exists public.guild_tb_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  tb_key text not null default 'rote',
  started_at timestamptz,
  ends_at timestamptz,
  current_phase text not null default 'P1',
  phase_ends_at timestamptz,
  status text not null default 'planned',
  strategy_plan_id uuid references public.guild_tb_plans(id) on delete set null,
  source_kind text not null default 'officer',
  source_fetched_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guild_tb_events_tb_key_check check (tb_key ~ '^[a-z0-9_-]{2,40}$'),
  constraint guild_tb_events_phase_check check (current_phase ~ '^P[1-6]$'),
  constraint guild_tb_events_status_check check (status in ('planned','active','completed','archived')),
  constraint guild_tb_events_source_check check (source_kind in ('officer','canonical','import')),
  constraint guild_tb_events_time_check check (ends_at is null or started_at is null or ends_at > started_at)
);

create unique index if not exists guild_tb_events_one_active_idx
  on public.guild_tb_events(guild_id, tb_key)
  where status = 'active';
create index if not exists guild_tb_events_guild_status_idx
  on public.guild_tb_events(guild_id, status, updated_at desc);

create table if not exists public.guild_tb_zone_states (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.guild_tb_events(id) on delete cascade,
  phase text not null,
  planet_id text not null,
  current_tp bigint not null default 0 check (current_tp >= 0),
  current_stars integer not null default 0 check (current_stars between 0 and 3),
  preload_cap_tp bigint check (preload_cap_tp is null or preload_cap_tp >= 0),
  deployment_tp bigint not null default 0 check (deployment_tp >= 0),
  combat_tp bigint not null default 0 check (combat_tp >= 0),
  operation_tp bigint not null default 0 check (operation_tp >= 0),
  target_stars integer not null default 0 check (target_stars between 0 and 3),
  command_state text not null default 'attack',
  command_message text not null default '',
  locked_by_officer boolean not null default false,
  source_kind text not null default 'officer',
  observed_at timestamptz,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guild_tb_zone_states_phase_check check (phase ~ '^P[1-6]$'),
  constraint guild_tb_zone_states_planet_check check (planet_id ~ '^[a-z0-9-]{2,80}$'),
  constraint guild_tb_zone_states_command_check check (command_state in ('attack','preload','hold','deploy','stop')),
  constraint guild_tb_zone_states_source_check check (source_kind in ('officer','canonical','import','officer-default')),
  unique(event_id, phase, planet_id)
);

create index if not exists guild_tb_zone_states_event_phase_idx
  on public.guild_tb_zone_states(event_id, phase, command_state, planet_id);

create table if not exists public.guild_tb_member_actions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.guild_tb_events(id) on delete cascade,
  phase text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  ally_code text not null,
  action_key text not null,
  action_type text not null,
  planet_id text,
  mission_id text,
  operation_slot_id text,
  priority integer not null default 100 check (priority between 1 and 10000),
  status text not null default 'pending',
  recommended_team_id text,
  deployment_target_tp bigint check (deployment_target_tp is null or deployment_target_tp >= 0),
  explanation text not null default '',
  generated_from_fingerprint text,
  source_kind text not null default 'generated',
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guild_tb_member_actions_phase_check check (phase ~ '^P[1-6]$'),
  constraint guild_tb_member_actions_ally_check check (ally_code ~ '^[0-9]{9}$'),
  constraint guild_tb_member_actions_type_check check (action_type in ('operation','special','combat','fleet','deploy','acknowledge')),
  constraint guild_tb_member_actions_status_check check (status in ('pending','acknowledged','completed','skipped','blocked')),
  constraint guild_tb_member_actions_source_check check (source_kind in ('generated','officer','reported','canonical')),
  unique(event_id, phase, player_id, action_key)
);

create index if not exists guild_tb_member_actions_member_idx
  on public.guild_tb_member_actions(event_id, phase, player_id, status, priority, created_at);
create index if not exists guild_tb_member_actions_ally_idx
  on public.guild_tb_member_actions(ally_code, event_id, phase, priority);

alter table public.guild_tb_events enable row level security;
alter table public.guild_tb_zone_states enable row level security;
alter table public.guild_tb_member_actions enable row level security;

revoke all on table public.guild_tb_events from anon, authenticated;
revoke all on table public.guild_tb_zone_states from anon, authenticated;
revoke all on table public.guild_tb_member_actions from anon, authenticated;
grant all on table public.guild_tb_events to service_role;
grant all on table public.guild_tb_zone_states to service_role;
grant all on table public.guild_tb_member_actions to service_role;

comment on table public.guild_tb_events is 'Canonical Command Center Territory Battle instances. Reference map data is intentionally separate from live/officer event state.';
comment on table public.guild_tb_zone_states is 'Per-event Territory Battle zone state and officer commands, including an explicit preload TP safety cap, with source provenance.';
comment on table public.guild_tb_member_actions is 'Durable ordered Today in TB task queue generated from an event fingerprint and current verified player roster.';
