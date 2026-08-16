alter table public.user_player_links
  drop constraint if exists user_player_links_verification_method_check;

alter table public.user_player_links
  add constraint user_player_links_verification_method_check
  check (
    verification_method is null
    or verification_method in ('manual','discord','profile_code','cosmetic_challenge','admin')
  );

create table public.player_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  challenge_type text not null check (challenge_type in ('portrait','title')),
  previous_value text not null,
  target_value text not null,
  status text not null default 'pending' check (status in ('pending','verified','expired','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 100),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_value <> ''),
  check (target_value <> previous_value),
  check (expires_at > created_at),
  check ((status = 'verified' and verified_at is not null) or status <> 'verified')
);

create unique index player_verification_one_pending_per_user
  on public.player_verification_challenges(user_id)
  where status = 'pending';

create unique index player_verification_one_pending_per_player
  on public.player_verification_challenges(player_id)
  where status = 'pending';

create index player_verification_challenges_user_created_idx
  on public.player_verification_challenges(user_id, created_at desc);

create index player_verification_challenges_expiry_idx
  on public.player_verification_challenges(status, expires_at)
  where status = 'pending';

alter table public.player_verification_challenges enable row level security;

create policy player_verification_challenges_select_self
on public.player_verification_challenges
for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

grant select on public.player_verification_challenges to authenticated;

comment on table public.player_verification_challenges is
  'Short-lived server-created proof-of-control challenges. Users may read only their own challenge; direct browser mutation is forbidden.';
comment on column public.player_verification_challenges.target_value is
  'Unlocked SWGOH portrait/title identifier the user must temporarily select in-game to prove control of the claimed player.';
