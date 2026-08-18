create or replace function public.sync_command_center_guild_role_from_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  -- Missing/partial member_level evidence must never demote a verified officer.
  -- Only authoritative in-game Guild roles 2+ are eligible for role sync.
  if new.member_level is null or new.member_level < 2 then
    return new;
  end if;

  v_role := case
    when new.member_level >= 4 then 'owner'
    when new.member_level = 3 then 'officer'
    else 'member'
  end;

  update public.guild_user_memberships
  set role=v_role,
      updated_at=now()
  where guild_id=new.guild_id
    and player_id=new.player_id
    and status='active'
    and role is distinct from v_role;

  return new;
end
$$;

revoke all on function public.sync_command_center_guild_role_from_activity() from public,anon,authenticated;

with latest as (
  select distinct on (guild_id,player_id)
    guild_id,player_id,member_level
  from public.guild_member_activity_snapshots
  where member_level >= 2
  order by guild_id,player_id,captured_at desc
)
update public.guild_user_memberships gum
set role=case
      when latest.member_level>=4 then 'owner'
      when latest.member_level=3 then 'officer'
      else 'member'
    end,
    updated_at=now()
from latest
where gum.guild_id=latest.guild_id
  and gum.player_id=latest.player_id
  and gum.status='active'
  and gum.role is distinct from case
      when latest.member_level>=4 then 'owner'
      when latest.member_level=3 then 'officer'
      else 'member'
    end;
