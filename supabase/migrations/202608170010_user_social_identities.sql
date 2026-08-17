create table public.user_social_identities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('discord','google','apple')),
  provider_user_id text not null,
  email text,
  display_name text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (provider, provider_user_id),
  unique (user_id, provider)
);

create index user_social_identities_user_idx
  on public.user_social_identities(user_id, provider);

alter table public.user_social_identities enable row level security;

create policy user_social_identities_select_self
on public.user_social_identities
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select on public.user_social_identities to authenticated;

comment on table public.user_social_identities is
  'Tenant-safe mapping from a Command Center user to stable OAuth provider identities. Provider access/refresh tokens are never stored here.';
