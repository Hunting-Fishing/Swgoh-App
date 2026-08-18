-- Keep Command Center Guild authorization aligned with current in-game Guild authority.
-- Cross-validated against the canonical Ludus roster and SWGOH.GG role labels:
-- member_level 4 = Leader -> owner, 3 = Officer -> officer, 2 = Member -> member.
create or replace function public.sync_command_center_guild_role_from_activity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  v_role := case
    when coalesce(new.member_level,0) >= 4 then 'owner'
    when coalesce(new.member_level,0) = 3 then 'officer'
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

drop trigger if exists sync_command_center_guild_role_from_activity on public.guild_member_activity_snapshots;
create trigger sync_command_center_guild_role_from_activity
after insert or update of member_level on public.guild_member_activity_snapshots
for each row execute function public.sync_command_center_guild_role_from_activity();

with latest as (
  select distinct on (guild_id,player_id)
    guild_id,player_id,member_level
  from public.guild_member_activity_snapshots
  order by guild_id,player_id,captured_at desc
)
update public.guild_user_memberships gum
set role=case
      when coalesce(latest.member_level,0)>=4 then 'owner'
      when latest.member_level=3 then 'officer'
      else 'member'
    end,
    updated_at=now()
from latest
where gum.guild_id=latest.guild_id
  and gum.player_id=latest.player_id
  and gum.status='active'
  and gum.role is distinct from case
      when coalesce(latest.member_level,0)>=4 then 'owner'
      when latest.member_level=3 then 'officer'
      else 'member'
    end;
