create or replace function private.normalize_player_unit_ability_counts()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
begin
  if lower(coalesce(new.metadata->>'abilityClassificationPendingCatalog','false'))='true' then
    if tg_op='UPDATE' then
      new.zeta_count:=old.zeta_count;
      new.omicron_count:=old.omicron_count;
      if new.ultimate_unlocked is null then new.ultimate_unlocked:=old.ultimate_unlocked; end if;
    else
      new.zeta_count:=null;
      new.omicron_count:=null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.capture_player_unit_progression()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_guild_id uuid;
  v_fields text[]:='{}'::text[];
  v_previous jsonb;
  v_new jsonb;
  v_has_prior_snapshot boolean:=false;
begin
  select current_guild_id into v_guild_id from public.players where id=new.player_id;

  v_new:=jsonb_build_object(
    'rarity',new.rarity,'level',new.level,'gearLevel',new.gear_level,
    'relicTier',new.relic_tier,'galacticPower',new.galactic_power,
    'zetaCount',new.zeta_count,'omicronCount',new.omicron_count,
    'ultimateUnlocked',new.ultimate_unlocked);

  if tg_op='INSERT' then
    select exists(select 1 from public.player_snapshots ps where ps.player_id=new.player_id and ps.captured_at<coalesce(new.last_synced_at,now())) into v_has_prior_snapshot;
    if v_has_prior_snapshot then
      insert into public.player_unit_progression_history(
        player_id,guild_id,base_id,event_type,changed_at,changed_fields,previous_state,new_state,source,metadata)
      values(new.player_id,v_guild_id,new.base_id,'unlocked',coalesce(new.last_synced_at,now()),array['unlocked'],null,v_new,'guild_sync',jsonb_build_object('detectedBy','player_units_current_insert'));
    end if;
    return new;
  end if;

  if old.rarity is distinct from new.rarity then v_fields:=array_append(v_fields,'rarity'); end if;
  if old.level is distinct from new.level then v_fields:=array_append(v_fields,'level'); end if;
  if old.gear_level is distinct from new.gear_level then v_fields:=array_append(v_fields,'gearLevel'); end if;
  if old.relic_tier is distinct from new.relic_tier then v_fields:=array_append(v_fields,'relicTier'); end if;
  if old.galactic_power is distinct from new.galactic_power then v_fields:=array_append(v_fields,'galacticPower'); end if;
  if old.zeta_count is not null and new.zeta_count is not null and old.zeta_count is distinct from new.zeta_count then v_fields:=array_append(v_fields,'zetaCount'); end if;
  if old.omicron_count is not null and new.omicron_count is not null and old.omicron_count is distinct from new.omicron_count then v_fields:=array_append(v_fields,'omicronCount'); end if;
  if old.ultimate_unlocked is not null and new.ultimate_unlocked is not null and old.ultimate_unlocked is distinct from new.ultimate_unlocked then v_fields:=array_append(v_fields,'ultimateUnlocked'); end if;

  if cardinality(v_fields)=0 then return new; end if;

  v_previous:=jsonb_build_object(
    'rarity',old.rarity,'level',old.level,'gearLevel',old.gear_level,
    'relicTier',old.relic_tier,'galacticPower',old.galactic_power,
    'zetaCount',old.zeta_count,'omicronCount',old.omicron_count,
    'ultimateUnlocked',old.ultimate_unlocked);

  insert into public.player_unit_progression_history(
    player_id,guild_id,base_id,event_type,changed_at,changed_fields,previous_state,new_state,source,metadata)
  values(new.player_id,v_guild_id,new.base_id,'progression_change',coalesce(new.last_synced_at,now()),v_fields,v_previous,v_new,'guild_sync',jsonb_build_object('detectedBy','player_units_current_update'));
  return new;
end;
$$;

-- Initial catalog normalization is baseline enrichment, not player progression.
delete from public.player_unit_progression_history
where event_type='progression_change'
  and not (changed_fields && array['rarity','level','gearLevel','relicTier','galacticPower']::text[]);

comment on function private.capture_player_unit_progression() is
  'Captures actual roster progression only. Metadata enrichment and NULL-to-classified ability transitions are excluded; derived ability fields are compared only when both snapshots are known.';
