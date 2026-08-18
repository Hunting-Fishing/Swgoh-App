create table if not exists public.user_journey_goals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  journey_event_id text not null,
  priority_rank integer not null default 100 check (priority_rank between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, player_id, journey_event_id),
  constraint user_journey_goals_event_id_check check (journey_event_id ~ '^[A-Z0-9_:-]{3,96}$')
);

create index if not exists user_journey_goals_player_idx
  on public.user_journey_goals(player_id, priority_rank, journey_event_id);

alter table public.user_journey_goals enable row level security;
revoke all on table public.user_journey_goals from anon, authenticated;
grant all on table public.user_journey_goals to service_role;

create or replace function public.replace_user_journey_goals(
  p_user_id uuid,
  p_player_id uuid,
  p_event_ids text[]
)
returns setof public.user_journey_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := coalesce(cardinality(p_event_ids), 0);
begin
  if p_user_id is null or p_player_id is null then
    raise exception 'user_id and player_id are required';
  end if;
  if v_count > 50 then
    raise exception 'at most 50 Journey goals may be tracked';
  end if;

  delete from public.user_journey_goals
  where user_id = p_user_id and player_id = p_player_id;

  insert into public.user_journey_goals(user_id, player_id, journey_event_id, priority_rank, created_at, updated_at)
  select p_user_id,
         p_player_id,
         normalized.event_id,
         normalized.priority_rank,
         now(),
         now()
  from (
    select upper(trim(event_id)) as event_id, min(ord)::integer as priority_rank
    from unnest(coalesce(p_event_ids, array[]::text[])) with ordinality as supplied(event_id, ord)
    where trim(event_id) <> ''
    group by upper(trim(event_id))
  ) normalized
  where normalized.event_id ~ '^[A-Z0-9_:-]{3,96}$';

  return query
  select goals.*
  from public.user_journey_goals goals
  where goals.user_id = p_user_id and goals.player_id = p_player_id
  order by goals.priority_rank, goals.journey_event_id;
end;
$$;

revoke all on function public.replace_user_journey_goals(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.replace_user_journey_goals(uuid, uuid, text[]) to service_role;

comment on table public.user_journey_goals is 'Durable verified-account Journey/GL/Fleet targets used to personalize Command Center farming recommendations across web actions and farming views.';
comment on function public.replace_user_journey_goals(uuid, uuid, text[]) is 'Atomically replaces the ordered tracked Journey targets for one verified user/player identity. Application code validates event IDs against the versioned Journey preset catalog.';
