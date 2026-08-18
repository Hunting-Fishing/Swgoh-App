create table if not exists public.guild_operation_settings (
  guild_id uuid primary key references public.guilds(id) on delete cascade,
  assignment_algorithm text not null default 'mission-safe-scarcity-v1',
  default_delivery_mode text not null default 'preview' check (default_delivery_mode in ('preview','discord_channel','webhook')),
  include_mentions boolean not null default false,
  send_dms boolean not null default false,
  default_discord_destination_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guild_discord_destinations (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  destination_kind text not null check (destination_kind in ('channel','webhook')),
  external_id text,
  display_name text not null,
  verified boolean not null default false,
  secret_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id,destination_kind,external_id)
);

alter table public.guild_operation_settings
  drop constraint if exists guild_operation_settings_default_discord_destination_id_fkey;
alter table public.guild_operation_settings
  add constraint guild_operation_settings_default_discord_destination_id_fkey
  foreign key (default_discord_destination_id) references public.guild_discord_destinations(id) on delete set null;

create table if not exists public.guild_member_operation_controls (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  available boolean not null default true,
  ignored_until timestamptz,
  ignore_reason text,
  source text not null default 'command-center',
  metadata jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id,player_id)
);

create table if not exists public.guild_unit_donation_preferences (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  base_id text not null,
  preference text not null check (preference in ('give','keep')),
  source text not null default 'command-center',
  metadata jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id,player_id,base_id)
);

create table if not exists public.guild_tb_plans (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  tb_key text not null default 'rote',
  name text not null,
  status text not null default 'draft' check (status in ('draft','previewed','published','archived')),
  phase_layout jsonb not null default '{}'::jsonb,
  requirement_overrides jsonb not null default '{}'::jsonb,
  ignored_missions text[] not null default '{}'::text[],
  ignored_platoons text[] not null default '{}'::text[],
  ignored_slots text[] not null default '{}'::text[],
  delivery jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_tb_plans_guild_updated_idx on public.guild_tb_plans(guild_id,updated_at desc);

create table if not exists public.guild_tb_grouping_rules (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  plan_id uuid references public.guild_tb_plans(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  priority integer not null default 100,
  rule_type text not null check (rule_type in ('avoid_pair','prefer_pair','avoid_unit_after','max_member_assignments','protect_unit_if_assigned')),
  when_spec jsonb not null default '{}'::jsonb,
  then_spec jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_tb_grouping_rules_plan_idx on public.guild_tb_grouping_rules(plan_id,priority,id);

create table if not exists public.guild_tb_plan_preassignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.guild_tb_plans(id) on delete cascade,
  slot_id text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  base_id text,
  phase text,
  source text not null default 'officer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id,slot_id)
);

create table if not exists public.guild_tb_assignment_runs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  plan_id uuid references public.guild_tb_plans(id) on delete set null,
  status text not null check (status in ('preview','queued','published','failed','cancelled')),
  input_fingerprint text,
  assignments jsonb not null default '[]'::jsonb,
  unfilled jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists guild_tb_assignment_runs_guild_created_idx on public.guild_tb_assignment_runs(guild_id,created_at desc);

create table if not exists public.guild_tw_defense_plans (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','previewed','published','archived')),
  strategy jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guild_tw_defense_plans_guild_updated_idx on public.guild_tw_defense_plans(guild_id,updated_at desc);

create table if not exists public.guild_tw_defense_runs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  plan_id uuid references public.guild_tw_defense_plans(id) on delete set null,
  status text not null check (status in ('preview','queued','published','failed','cancelled')),
  input_fingerprint text,
  assignments jsonb not null default '[]'::jsonb,
  unfilled jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists guild_tw_defense_runs_guild_created_idx on public.guild_tw_defense_runs(guild_id,created_at desc);

create table if not exists public.guild_operations_audit_log (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists guild_operations_audit_log_guild_time_idx on public.guild_operations_audit_log(guild_id,occurred_at desc);

alter table public.guild_operation_settings enable row level security;
alter table public.guild_discord_destinations enable row level security;
alter table public.guild_member_operation_controls enable row level security;
alter table public.guild_unit_donation_preferences enable row level security;
alter table public.guild_tb_plans enable row level security;
alter table public.guild_tb_grouping_rules enable row level security;
alter table public.guild_tb_plan_preassignments enable row level security;
alter table public.guild_tb_assignment_runs enable row level security;
alter table public.guild_tw_defense_plans enable row level security;
alter table public.guild_tw_defense_runs enable row level security;
alter table public.guild_operations_audit_log enable row level security;

revoke all on table public.guild_operation_settings from anon,authenticated;
revoke all on table public.guild_discord_destinations from anon,authenticated;
revoke all on table public.guild_member_operation_controls from anon,authenticated;
revoke all on table public.guild_unit_donation_preferences from anon,authenticated;
revoke all on table public.guild_tb_plans from anon,authenticated;
revoke all on table public.guild_tb_grouping_rules from anon,authenticated;
revoke all on table public.guild_tb_plan_preassignments from anon,authenticated;
revoke all on table public.guild_tb_assignment_runs from anon,authenticated;
revoke all on table public.guild_tw_defense_plans from anon,authenticated;
revoke all on table public.guild_tw_defense_runs from anon,authenticated;
revoke all on table public.guild_operations_audit_log from anon,authenticated;

grant all on table public.guild_operation_settings to service_role;
grant all on table public.guild_discord_destinations to service_role;
grant all on table public.guild_member_operation_controls to service_role;
grant all on table public.guild_unit_donation_preferences to service_role;
grant all on table public.guild_tb_plans to service_role;
grant all on table public.guild_tb_grouping_rules to service_role;
grant all on table public.guild_tb_plan_preassignments to service_role;
grant all on table public.guild_tb_assignment_runs to service_role;
grant all on table public.guild_tw_defense_plans to service_role;
grant all on table public.guild_tw_defense_runs to service_role;
grant all on table public.guild_operations_audit_log to service_role;

grant usage,select on sequence public.guild_operations_audit_log_id_seq to service_role;
