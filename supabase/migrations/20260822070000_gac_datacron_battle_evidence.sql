-- GAC Datacron-specific battle evidence.
-- One row per sourced/verified battle keeps ingestion idempotent and lets the API aggregate
-- equivalent Datacron rolls by normalized signatures without relying on player-specific instance IDs.

create table if not exists public.gac_datacron_battle_evidence (
  id bigint generated always as identity primary key,
  battle_key text not null unique,
  format text not null check (format in ('3v3','5v5')),
  enemy_leader_base_id text not null,
  enemy_members jsonb not null,
  defender_datacron_state text not null check (defender_datacron_state in ('unknown','none','assigned')),
  defender_datacron_signature text not null,
  defender_datacron jsonb,
  counter_leader_base_id text not null,
  counter_members jsonb not null,
  attacker_datacron_state text not null check (attacker_datacron_state in ('unknown','none','assigned')),
  attacker_datacron_signature text not null,
  attacker_datacron jsonb,
  battle_outcome text not null check (battle_outcome in ('win','loss','draw','unknown')),
  banners integer check (banners is null or banners >= 0),
  season_id text,
  source text not null,
  source_ref text,
  observed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists gac_dc_battle_enemy_idx
  on public.gac_datacron_battle_evidence(format, enemy_leader_base_id, observed_at desc);
create index if not exists gac_dc_battle_defender_sig_idx
  on public.gac_datacron_battle_evidence(format, defender_datacron_signature, observed_at desc);
create index if not exists gac_dc_battle_counter_idx
  on public.gac_datacron_battle_evidence(format, counter_leader_base_id, observed_at desc);
create index if not exists gac_dc_battle_attacker_sig_idx
  on public.gac_datacron_battle_evidence(format, attacker_datacron_signature, observed_at desc);
create index if not exists gac_dc_battle_exact_matchup_idx
  on public.gac_datacron_battle_evidence(
    format,
    enemy_leader_base_id,
    defender_datacron_signature,
    counter_leader_base_id,
    attacker_datacron_signature
  );

alter table public.gac_datacron_battle_evidence enable row level security;
revoke all on public.gac_datacron_battle_evidence from anon, authenticated;

comment on table public.gac_datacron_battle_evidence is 'Battle-level GAC counter evidence with normalized defender and attacker Datacron signatures; never interpreted as a predicted current-battle outcome.';
comment on column public.gac_datacron_battle_evidence.battle_key is 'Idempotent source battle identity matching gac_battles.battle_key when available.';
comment on column public.gac_datacron_battle_evidence.defender_datacron_signature is 'Normalized roll signature excluding the player-specific Datacron instance ID; DC:NONE and DC:UNKNOWN remain distinct.';
comment on column public.gac_datacron_battle_evidence.attacker_datacron_signature is 'Normalized attacker roll signature excluding the player-specific Datacron instance ID.';
