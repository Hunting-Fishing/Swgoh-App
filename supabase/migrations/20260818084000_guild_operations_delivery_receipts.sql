create table if not exists public.guild_operations_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  run_type text not null check (run_type in ('tb','tw')),
  run_id uuid not null,
  destination_id uuid references public.guild_discord_destinations(id) on delete set null,
  delivery_kind text not null check (delivery_kind in ('discord_channel','webhook','dm')),
  recipient_key text not null default 'public',
  chunk_index integer not null default 0 check (chunk_index >= 0),
  idempotency_key text not null,
  status text not null check (status in ('sending','delivered','failed','skipped')),
  external_message_id text,
  external_channel_id text,
  http_status integer,
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key,delivery_kind,recipient_key,chunk_index)
);

create index if not exists guild_operations_delivery_receipts_run_idx
  on public.guild_operations_delivery_receipts(guild_id,run_type,run_id,created_at desc);

alter table public.guild_operations_delivery_receipts enable row level security;
revoke all on table public.guild_operations_delivery_receipts from anon,authenticated;
grant all on table public.guild_operations_delivery_receipts to service_role;

alter table public.guild_tb_assignment_runs
  add column if not exists source_guild_synced_at timestamptz;
alter table public.guild_tw_defense_runs
  add column if not exists source_guild_synced_at timestamptz;
