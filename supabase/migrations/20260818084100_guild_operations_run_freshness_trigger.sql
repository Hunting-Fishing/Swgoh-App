create or replace function public.set_guild_operations_run_source_freshness()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.source_guild_synced_at is null
     and nullif(new.diagnostics->'guildFreshness'->>'lastSyncedAt','') is not null then
    new.source_guild_synced_at := (new.diagnostics->'guildFreshness'->>'lastSyncedAt')::timestamptz;
  end if;
  return new;
end
$$;

drop trigger if exists set_tb_assignment_run_source_freshness on public.guild_tb_assignment_runs;
create trigger set_tb_assignment_run_source_freshness
before insert or update of diagnostics on public.guild_tb_assignment_runs
for each row execute function public.set_guild_operations_run_source_freshness();

drop trigger if exists set_tw_defense_run_source_freshness on public.guild_tw_defense_runs;
create trigger set_tw_defense_run_source_freshness
before insert or update of diagnostics on public.guild_tw_defense_runs
for each row execute function public.set_guild_operations_run_source_freshness();

revoke all on function public.set_guild_operations_run_source_freshness() from public,anon,authenticated;
