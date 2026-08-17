revoke all privileges on table public.guild_sync_stage_members from anon, authenticated;
grant all privileges on table public.guild_sync_stage_members to service_role;

revoke all privileges on table public.player_unit_skill_tiers_current from anon, authenticated;
grant select on table public.player_unit_skill_tiers_current to authenticated;
grant all privileges on table public.player_unit_skill_tiers_current to service_role;

comment on table public.guild_sync_stage_members is
  'Internal service-role-only staging for bounded Guild synchronization. No client access is intended; RLS plus explicit grant revocation enforce the boundary.';
comment on table public.player_unit_skill_tiers_current is
  'Tenant-readable normalized player skill-tier evidence. Authenticated clients have SELECT only and remain constrained by player-access RLS; writes are service-role only.';
