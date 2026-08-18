alter function public.guild_intelligence_capture_status(text)
  set search_path = pg_catalog, public;

revoke all on function public.ensure_guild_intelligence_settings() from public,anon,authenticated;
grant execute on function public.ensure_guild_intelligence_settings() to service_role;
