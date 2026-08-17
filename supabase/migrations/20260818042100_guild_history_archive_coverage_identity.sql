create or replace function public.read_guild_history_coverage(p_ally_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := regexp_replace(coalesce(p_ally_code,''),'[^0-9]','','g');
  v_guild_id uuid;
  v_archive public.guild_history_archives%rowtype;
  v_guild public.guilds%rowtype;
begin
  if length(v_code) <> 9 then return null; end if;
  select current_guild_id into v_guild_id from public.players where ally_code=v_code limit 1;
  if v_guild_id is null then return null; end if;
  select * into v_guild from public.guilds where id=v_guild_id;
  select * into v_archive
  from public.guild_history_archives
  where guild_id=v_guild_id
  order by payload_version desc,updated_at desc
  limit 1;
  if not found then
    return jsonb_build_object(
      'guildId',v_guild_id,
      'guild',jsonb_build_object('id',v_guild.id,'name',v_guild.name,'memberCount',v_guild.member_count,'galacticPower',v_guild.galactic_power,'lastSyncedAt',v_guild.last_synced_at),
      'available',false
    );
  end if;
  return jsonb_build_object(
    'guildId',v_guild_id,
    'guild',jsonb_build_object('id',v_guild.id,'name',v_guild.name,'memberCount',v_guild.member_count,'galacticPower',v_guild.galactic_power,'lastSyncedAt',v_guild.last_synced_at),
    'available',true,
    'archiveKey',v_archive.archive_key,
    'payloadVersion',v_archive.payload_version,
    'source',v_archive.source,
    'sourceRef',v_archive.source_ref,
    'sourceSha256',v_archive.source_sha256,
    'firstObservedAt',v_archive.first_observed_at,
    'lastObservedAt',v_archive.last_observed_at,
    'counts',coalesce(v_archive.payload->'meta'->'counts','{}'::jsonb),
    'relicNormalization',v_archive.payload->'meta'->>'relicNormalization',
    'importedAt',v_archive.imported_at,
    'updatedAt',v_archive.updated_at
  );
end
$$;
revoke all on function public.read_guild_history_coverage(text) from public,anon,authenticated;
grant execute on function public.read_guild_history_coverage(text) to service_role;
