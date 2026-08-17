-- Provenance-backed Ludus Venatus membership-history backfill.
-- Source: LV Unit Tracker (new) / Member Data_Backup_20260605_195.
-- Workbook SHA-256: 4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d
-- Parsed coverage: 665 complete roster snapshots, 89 Ally Codes, 104 continuous membership periods.
-- Exact RETURNED events are promoted only when the evidence chain is:
-- prior complete-roster presence -> complete-roster absence -> fresh source-reported guild_join_time.

create table if not exists public.guild_membership_historical_events (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  event_type text not null check (event_type in ('joined','returned')),
  occurred_at timestamptz not null,
  prior_present_at timestamptz,
  absence_first_observed_at timestamptz,
  absence_last_observed_at timestamptz,
  reobserved_at timestamptz,
  source text not null,
  source_ref text not null,
  confidence text not null default 'confirmed' check (confidence in ('confirmed','bounded','inferred')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (guild_id,ally_code,event_type,occurred_at,source)
);

create table if not exists public.guild_membership_historical_periods (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  ally_code text not null check (ally_code ~ '^[0-9]{9}$'),
  player_name text not null,
  period_number integer not null check (period_number >= 1),
  reported_join_time timestamptz,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  next_absence_observed_at timestamptz,
  source text not null,
  source_ref text not null,
  confidence text not null default 'confirmed' check (confidence in ('confirmed','bounded','inferred')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (guild_id,ally_code,period_number,source)
);

create table if not exists public.guild_history_imports (
  id bigint generated always as identity primary key,
  guild_id uuid not null references public.guilds(id) on delete cascade,
  source text not null,
  source_ref text not null,
  source_sha256 text,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  snapshot_count integer not null check (snapshot_count >= 0),
  distinct_ally_codes integer not null check (distinct_ally_codes >= 0),
  membership_period_count integer not null check (membership_period_count >= 0),
  confirmed_return_events integer not null check (confirmed_return_events >= 0),
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (guild_id,source,source_ref)
);

alter table public.guild_membership_historical_events enable row level security;
alter table public.guild_membership_historical_periods enable row level security;
alter table public.guild_history_imports enable row level security;

-- Historical identities required by canonical guild_membership_history FKs.
-- These are archived stats from their last decoded player payload and are never marked as current Guild members.
insert into public.players(ally_code,name,level,galactic_power,character_power,ship_power,current_guild_id,first_seen_at,last_seen_at,last_synced_at,source,metadata)
values
('137185784','ND Irish',85,6957430,4065178,2892252,null,'2023-12-18T07:29:44.701Z','2026-01-05T02:19:26.567Z','2026-01-04T13:05:01.721729Z','historical-workbook',jsonb_build_object('historicalIdentity',true,'sourceRef','Member Data_Backup_20260605_195')),
('162713935','Docobell',85,10560667,6222907,4337760,null,'2022-12-23T01:47:39.094Z','2026-02-11T22:26:47.136Z','2025-06-28T19:02:39.886492Z','historical-workbook',jsonb_build_object('historicalIdentity',true,'sourceRef','Member Data_Backup_20260605_195')),
('269347668','LeviathanZA',85,6643661,4216718,2426943,null,'2022-12-23T01:47:39.094Z','2024-07-19T06:29:46.098Z','2024-07-19T03:06:23.681798Z','historical-workbook',jsonb_build_object('historicalIdentity',true,'sourceRef','Member Data_Backup_20260605_195')),
('631499466','Foxtrot Golf',85,4962320,2988511,1973809,null,'2024-03-19T06:29:46.780Z','2025-06-29T06:05:53.925Z','2025-06-28T22:08:29.450494Z','historical-workbook',jsonb_build_object('historicalIdentity',true,'sourceRef','Member Data_Backup_20260605_195')),
('966846135','YAFG',85,6410214,3880004,2530210,null,'2022-12-23T01:47:39.094Z','2026-01-11T23:22:00.107Z','2025-06-28T22:17:01.565124Z','historical-workbook',jsonb_build_object('historicalIdentity',true,'sourceRef','Member Data_Backup_20260605_195'))
on conflict(ally_code) do nothing;

with g as (
  select id from public.guilds where swgoh_guild_id='3xa5z9KySv25kY3GH9FNvg' limit 1
), e(ally_code,player_name,occurred_at,prior_present_at,absence_first,absence_last,reobserved_at) as (values
('137185784','ND Irish','2025-09-07T23:26:26Z'::timestamptz,'2024-07-14T06:29:37.012Z'::timestamptz,'2024-07-15T06:29:53.006Z'::timestamptz,'2025-08-24T22:24:57.231Z'::timestamptz,'2025-09-10T01:19:27.405Z'::timestamptz),
('162713935','Docobell','2024-09-22T21:58:42Z','2024-03-18T06:29:34.868Z','2024-03-19T06:29:46.780Z','2024-09-23T06:29:44.993Z','2024-09-24T06:29:54.636Z'),
('243175495','VadersFist','2023-04-23T22:46:13Z','2023-01-06T01:40:58.749Z','2023-01-21T00:43:05.996Z','2023-01-21T00:43:05.996Z','2023-09-26T00:18:15.005Z'),
('269347668','LeviathanZA','2024-02-26T09:53:45Z','2023-01-21T00:43:05.996Z','2023-09-26T00:18:15.005Z','2024-02-26T07:29:43.113Z','2024-02-27T07:29:46.897Z'),
('631499466','Foxtrot Golf','2024-04-15T11:33:11Z','2024-04-08T06:29:44.813Z','2024-04-09T06:30:02.893Z','2024-04-15T06:29:44.042Z','2024-04-15T16:57:49.204Z'),
('631499466','Foxtrot Golf','2024-05-24T16:04:10Z','2024-05-05T06:29:49.365Z','2024-05-06T06:29:50.648Z','2024-05-24T06:29:43.187Z','2024-05-25T06:29:54.111Z'),
('631499466','Foxtrot Golf','2024-06-24T00:06:25Z','2024-06-02T06:29:45.785Z','2024-06-03T06:29:47.598Z','2024-06-21T06:29:52.048Z','2024-06-29T23:00:19.719Z'),
('631499466','Foxtrot Golf','2024-07-07T22:13:58Z','2024-07-01T06:30:06.879Z','2024-07-02T06:29:46.018Z','2024-07-08T06:29:51.234Z','2024-07-09T06:29:46.333Z'),
('631499466','Foxtrot Golf','2024-09-16T01:46:37Z','2024-07-17T06:30:03.062Z','2024-07-18T06:29:38.819Z','2024-09-15T06:29:54.152Z','2024-09-16T06:29:48.509Z'),
('631499466','Foxtrot Golf','2025-05-12T14:16:11Z','2024-09-23T06:29:44.993Z','2024-09-24T06:29:54.636Z','2025-05-12T06:05:53.311Z','2025-05-13T06:05:51.597Z'),
('966846135','YAFG','2024-05-12T18:10:55Z','2024-05-06T06:29:50.648Z','2024-05-07T06:29:44.446Z','2024-05-13T06:50:08.848Z','2024-05-14T06:30:02.308Z'),
('966846135','YAFG','2024-07-19T17:31:40Z','2024-07-17T06:30:03.062Z','2024-07-18T06:29:38.819Z','2024-07-19T06:29:46.098Z','2024-07-20T06:29:52.847Z'),
('966846135','YAFG','2025-02-02T18:29:52Z','2024-07-21T06:29:51.570Z','2024-07-22T06:29:49.008Z','2025-02-02T07:29:55.154Z','2025-02-03T07:29:49.924Z'),
('966846135','YAFG','2025-05-08T11:11:41Z','2025-02-09T07:29:50.664Z','2025-02-10T07:29:53.874Z','2025-05-08T06:05:48.931Z','2025-05-09T06:05:51.161Z'),
('966846135','YAFG','2026-01-05T16:33:39Z','2025-07-16T06:05:52.287Z','2025-08-10T22:55:05.418Z','2026-01-05T02:19:26.567Z','2026-01-11T23:22:00.107Z')
)
insert into public.guild_membership_historical_events(guild_id,ally_code,player_name,event_type,occurred_at,prior_present_at,absence_first_observed_at,absence_last_observed_at,reobserved_at,source,source_ref,confidence,metadata)
select g.id,e.ally_code,e.player_name,'returned',e.occurred_at,e.prior_present_at,e.absence_first,e.absence_last,e.reobserved_at,'lv-unit-tracker-workbook','Member Data_Backup_20260605_195','confirmed',jsonb_build_object('historicalBackfill',true,'eventBasis','prior complete-roster presence + complete-roster absence + fresh source-reported guild_join_time')
from g cross join e
on conflict(guild_id,ally_code,event_type,occurred_at,source) do nothing;

insert into public.guild_membership_history(guild_id,player_id,event_type,occurred_at,previous_value,new_value,metadata)
select he.guild_id,p.id,'returned',he.occurred_at,'absent','present',jsonb_build_object('playerName',he.player_name,'allyCode',he.ally_code,'historicalBackfill',true,'backfillSource',he.source,'sourceRef',he.source_ref,'confidence',he.confidence,'priorPresentAt',he.prior_present_at,'absenceFirstObservedAt',he.absence_first_observed_at,'absenceLastObservedAt',he.absence_last_observed_at,'reobservedAt',he.reobserved_at)
from public.guild_membership_historical_events he join public.players p on p.ally_code=he.ally_code
join public.guilds g on g.id=he.guild_id and g.swgoh_guild_id='3xa5z9KySv25kY3GH9FNvg'
where he.event_type='returned' and he.confidence='confirmed'
and not exists (select 1 from public.guild_membership_history mh where mh.guild_id=he.guild_id and mh.player_id=p.id and mh.event_type='returned' and mh.occurred_at=he.occurred_at);

insert into public.guild_history_imports(guild_id,source,source_ref,source_sha256,first_observed_at,last_observed_at,snapshot_count,distinct_ally_codes,membership_period_count,confirmed_return_events,metadata)
select g.id,'lv-unit-tracker-workbook','Member Data_Backup_20260605_195','4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d','2022-12-23T01:47:39.094Z','2026-06-05T23:33:53.906Z',665,89,104,15,jsonb_build_object('workbook','LV Unit Tracker (new)','completeRosterEvidence',true)
from public.guilds g where g.swgoh_guild_id='3xa5z9KySv25kY3GH9FNvg'
on conflict(guild_id,source,source_ref) do update set snapshot_count=excluded.snapshot_count,distinct_ally_codes=excluded.distinct_ally_codes,membership_period_count=excluded.membership_period_count,confirmed_return_events=excluded.confirmed_return_events,source_sha256=excluded.source_sha256,metadata=excluded.metadata,imported_at=now();
