-- A fully hydrated Comlink Guild roster is authoritative for current roster identity
-- and progression evidence. SWGOH Stats remains an enrichment layer. A temporary
-- or partial Stats calculation must not discard the entire 50-player raw roster.
--
-- Keep all existing tenant, requester, hydration, member-count and identity checks.
-- Only remove the legacy hard gate that required calculation.complete=true.

do $migration$
declare
  v_definition text;
  v_old text := $old$
  if coalesce(p_payload->'calculation'->>'complete', 'false')::boolean is not true then
    raise exception 'Guild roster GP/stat calculation is incomplete.';
  end if;
$old$;
  v_new text := $new$
  -- SWGOH Stats is optional enrichment. Fully hydrated Comlink roster data is
  -- persisted even when calculation.complete=false; the calculation object is
  -- retained in guild_sync_runs.metadata so consumers can distinguish partial
  -- enrichment from a fully calculated snapshot.
$new$;
begin
  select pg_get_functiondef('public.ingest_verified_user_guild_sync(jsonb)'::regprocedure)
    into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected legacy calculation completeness gate was not found; refusing unsafe migration.';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$migration$;

comment on function public.ingest_verified_user_guild_sync(jsonb) is
  'Service-role-only transactional Guild ingestion. Requires verified tenant identity and complete Comlink roster hydration. SWGOH Stats enrichment may be partial and is recorded in sync metadata rather than blocking raw roster persistence.';
