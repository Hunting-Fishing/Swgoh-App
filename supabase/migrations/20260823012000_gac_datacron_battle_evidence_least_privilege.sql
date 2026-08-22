-- Hardening follow-up for environments where the Datacron evidence warehouse already exists.
-- Keep this additive migration even though the foundation migration is also corrected for fresh installs.

revoke all on table public.gac_datacron_battle_evidence from anon, authenticated, service_role;
grant select, insert, update on table public.gac_datacron_battle_evidence to service_role;

revoke all on sequence public.gac_datacron_battle_evidence_id_seq from anon, authenticated, service_role;
grant usage, select on sequence public.gac_datacron_battle_evidence_id_seq to service_role;
