create table public.guild_activity_snapshots (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  captured_at timestamptz not null default now(),
  snapshot_kind text not null default 'user_sync' check (snapshot_kind in ('user_sync','scheduled','guild_reset','tb_event','tw_event','raid_event','system')),
  source_sync_run_id uuid references public.guild_sync_runs(id) on delete set null,
  next_challenges_refresh timestamptz,
  raid_launch_config jsonb not null default '[]'::jsonb,
  guild_event_tracker jsonb not null default '[]'::jsonb,
  recent_raid_results jsonb not null default '[]'::jsonb,
  recent_tw_results jsonb not null default '[]'::jsonb,
  territory_battle_results jsonb not null default '[]'::jsonb,
  source_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(raid_launch_config) = 'array'),
  check (jsonb_typeof(guild_event_tracker) = 'array'),
  check (jsonb_typeof(recent_raid_results) = 'array'),
  check (jsonb_typeof(recent_tw_results) = 'array'),
  check (jsonb_typeof(territory_battle_results) = 'array')
);

create unique index guild_activity_snapshots_fingerprint_unique
  on public.guild_activity_snapshots(guild_id, source_fingerprint)
  where source_fingerprint is not null;

create index guild_activity_snapshots_guild_time_idx
  on public.guild_activity_snapshots(guild_id, captured_at desc);

create index guild_activity_snapshots_kind_time_idx
  on public.guild_activity_snapshots(guild_id, snapshot_kind, captured_at desc);

create table public.guild_member_activity_snapshots (
  snapshot_id bigint not null references public.guild_activity_snapshots(id) on delete cascade,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  captured_at timestamptz not null,
  member_level smallint not null default 0 check (member_level >= 0),
  guild_xp bigint not null default 0 check (guild_xp >= 0),
  galactic_power bigint not null default 0 check (galactic_power >= 0),
  squad_power bigint not null default 0 check (squad_power >= 0),
  last_activity_at timestamptz,
  guild_joined_at timestamptz,
  lifetime_season_score bigint not null default 0 check (lifetime_season_score >= 0),
  league_id text,
  raid_tickets_current integer check (raid_tickets_current is null or raid_tickets_current >= 0),
  raid_tickets_lifetime bigint check (raid_tickets_lifetime is null or raid_tickets_lifetime >= 0),
  member_contribution jsonb not null default '[]'::jsonb,
  season_status jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  primary key (snapshot_id, player_id),
  check (jsonb_typeof(member_contribution) = 'array'),
  check (jsonb_typeof(season_status) = 'array')
);

create index guild_member_activity_guild_time_idx
  on public.guild_member_activity_snapshots(guild_id, captured_at desc);

create index guild_member_activity_player_time_idx
  on public.guild_member_activity_snapshots(player_id, captured_at desc);

create index guild_member_activity_ticket_time_idx
  on public.guild_member_activity_snapshots(guild_id, captured_at desc, raid_tickets_current)
  where raid_tickets_current is not null;

alter table public.guild_activity_snapshots enable row level security;
alter table public.guild_member_activity_snapshots enable row level security;

create policy guild_activity_snapshots_select_authorized
on public.guild_activity_snapshots
for select
to authenticated
using (private.user_has_guild_access(guild_id));

create policy guild_member_activity_snapshots_select_authorized
on public.guild_member_activity_snapshots
for select
to authenticated
using (private.user_has_guild_access(guild_id));

grant select on public.guild_activity_snapshots to authenticated;
grant select on public.guild_member_activity_snapshots to authenticated;

comment on table public.guild_activity_snapshots is
  'Durable first-party Guild activity/history captured from authenticated or scheduled Command Center syncs. Raw public game event arrays are retained for later reprocessing.';
comment on table public.guild_member_activity_snapshots is
  'Per-member activity/contribution history attached to a Guild activity snapshot, including Raid Ticket counters when resolvable.';
comment on column public.guild_activity_snapshots.source_fingerprint is
  'Server-generated fingerprint used to suppress duplicate identical activity captures without losing meaningful event history.';
