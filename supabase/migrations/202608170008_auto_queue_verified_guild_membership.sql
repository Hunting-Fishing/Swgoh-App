create or replace function private.queue_sync_on_verified_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  if not exists (
    select 1
    from public.user_player_links upl
    where upl.user_id = new.user_id
      and upl.player_id = new.player_id
      and upl.verification_status = 'verified'
  ) then
    return new;
  end if;

  begin
    insert into public.guild_sync_jobs (
      guild_id,
      requested_by_user_id,
      requested_by_player_id,
      trigger_kind,
      priority,
      status,
      include_activity,
      force_refresh,
      run_after,
      metadata
    )
    select
      new.guild_id,
      new.user_id,
      new.player_id,
      'user',
      90,
      'queued',
      true,
      true,
      now(),
      jsonb_build_object('source', 'verified-membership-activation')
    where not exists (
      select 1
      from public.guild_sync_jobs jobs
      where jobs.guild_id = new.guild_id
        and jobs.status in ('queued','running')
    );
  exception
    when unique_violation then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists guild_membership_auto_queue_sync on public.guild_user_memberships;
create trigger guild_membership_auto_queue_sync
after insert or update of status on public.guild_user_memberships
for each row
execute function private.queue_sync_on_verified_membership();

revoke all on function private.queue_sync_on_verified_membership() from public;
revoke all on function private.queue_sync_on_verified_membership() from anon;
revoke all on function private.queue_sync_on_verified_membership() from authenticated;

comment on function private.queue_sync_on_verified_membership() is
  'Automatically queues the first rich Guild sync only when an exact user/player membership becomes active and the same user/player link is verified.';
