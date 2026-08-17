-- Cover foreign keys used by Guild sync, history and tenant lookups before
-- production roster volume grows. These are additive and safe on the pilot data set.
create index if not exists guild_activity_snapshots_source_sync_run_idx
  on public.guild_activity_snapshots(source_sync_run_id);

create index if not exists guild_snapshots_source_sync_run_idx
  on public.guild_snapshots(source_sync_run_id);

create index if not exists guild_sync_jobs_requested_by_player_idx
  on public.guild_sync_jobs(requested_by_player_id);

create index if not exists guild_sync_jobs_requested_by_user_idx
  on public.guild_sync_jobs(requested_by_user_id);

create index if not exists guild_sync_jobs_sync_run_idx
  on public.guild_sync_jobs(sync_run_id);

create index if not exists guild_sync_runs_requested_by_user_idx
  on public.guild_sync_runs(requested_by_user_id);

create index if not exists guild_user_memberships_granted_by_user_idx
  on public.guild_user_memberships(granted_by_user_id);

create index if not exists guild_user_memberships_player_idx
  on public.guild_user_memberships(player_id);

create index if not exists guilds_onboarded_by_user_idx
  on public.guilds(onboarded_by_user_id);

create index if not exists player_snapshots_guild_idx
  on public.player_snapshots(guild_id);

create index if not exists player_snapshots_source_sync_run_idx
  on public.player_snapshots(source_sync_run_id);

create index if not exists user_guild_preferences_guild_idx
  on public.user_guild_preferences(guild_id);
