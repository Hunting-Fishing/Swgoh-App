-- Cross-source return found after comparing the final workbook history to the current live Guild tenure.
-- Warm Bacon was present in the workbook through 2025-12-03, absent in every later workbook
-- snapshot through 2026-06-05, and the live Guild payload reports a fresh join at 2026-06-15T00:11:06Z.
with g as (
  select id from public.guilds where swgoh_guild_id='3xa5z9KySv25kY3GH9FNvg' limit 1
)
insert into public.guild_membership_historical_events(
  guild_id,ally_code,player_name,event_type,occurred_at,prior_present_at,
  absence_first_observed_at,absence_last_observed_at,reobserved_at,
  source,source_ref,confidence,metadata
)
select g.id,'732764286','Warm Bacon','returned','2026-06-15T00:11:06Z'::timestamptz,
       '2025-12-03T00:23:35.344Z'::timestamptz,'2026-01-05T02:19:26.567Z'::timestamptz,
       '2026-06-05T23:33:53.906Z'::timestamptz,'2026-08-17T17:05:34.408Z'::timestamptz,
       'lv-unit-tracker-workbook+canonical-current','Member Data_Backup_20260605_195 + live guild_join_time',
       'confirmed',jsonb_build_object('historicalBackfill',true,'eventBasis','prior workbook presence + complete workbook absence through final snapshot + current source-reported guild_join_time')
from g
on conflict(guild_id,ally_code,event_type,occurred_at,source) do nothing;

insert into public.guild_membership_history(guild_id,player_id,event_type,occurred_at,previous_value,new_value,metadata)
select he.guild_id,p.id,'returned',he.occurred_at,'absent','present',
       jsonb_build_object('playerName',he.player_name,'allyCode',he.ally_code,'historicalBackfill',true,
         'backfillSource',he.source,'sourceRef',he.source_ref,'confidence',he.confidence,
         'priorPresentAt',he.prior_present_at,'absenceFirstObservedAt',he.absence_first_observed_at,
         'absenceLastObservedAt',he.absence_last_observed_at,'reobservedAt',he.reobserved_at)
from public.guild_membership_historical_events he
join public.players p on p.ally_code=he.ally_code
where he.ally_code='732764286' and he.event_type='returned' and he.occurred_at='2026-06-15T00:11:06Z'::timestamptz
and not exists(select 1 from public.guild_membership_history mh where mh.guild_id=he.guild_id and mh.player_id=p.id and mh.event_type='returned' and mh.occurred_at=he.occurred_at);

update public.guild_history_imports
set confirmed_return_events=16,
    metadata=metadata||jsonb_build_object('crossSourceCurrentReturnEvents',1),
    imported_at=now()
where source='lv-unit-tracker-workbook'
  and source_ref='Member Data_Backup_20260605_195'
  and guild_id=(select id from public.guilds where swgoh_guild_id='3xa5z9KySv25kY3GH9FNvg' limit 1);
