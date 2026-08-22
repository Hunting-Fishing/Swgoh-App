-- Harden ROTE/TB evidence retention against parent-row cascade deletion.
-- Historical mission attempts, Operation assignments and contribution evidence are
-- auditable records. Deleting an event, player or slot must fail while evidence
-- references it instead of silently cascading away history.

alter table public.guild_tb_mission_attempts
  drop constraint if exists guild_tb_mission_attempts_player_id_fkey;
alter table public.guild_tb_mission_attempts
  add constraint guild_tb_mission_attempts_player_id_fkey
  foreign key (player_id)
  references public.players(id)
  on delete restrict;

alter table public.guild_tb_mission_attempts
  drop constraint if exists guild_tb_mission_attempts_event_guild_fk;
alter table public.guild_tb_mission_attempts
  add constraint guild_tb_mission_attempts_event_guild_fk
  foreign key (event_id, guild_id)
  references public.guild_tb_events(id, guild_id)
  on delete restrict;

alter table public.guild_tb_operation_slots
  drop constraint if exists guild_tb_operation_slots_event_guild_fk;
alter table public.guild_tb_operation_slots
  add constraint guild_tb_operation_slots_event_guild_fk
  foreign key (event_id, guild_id)
  references public.guild_tb_events(id, guild_id)
  on delete restrict;

alter table public.guild_tb_operation_assignments
  drop constraint if exists guild_tb_operation_assignments_slot_unit_fk;
alter table public.guild_tb_operation_assignments
  add constraint guild_tb_operation_assignments_slot_unit_fk
  foreign key (slot_id, assigned_base_id)
  references public.guild_tb_operation_slots(id, required_base_id)
  on delete restrict;

alter table public.guild_tb_operation_contributions
  drop constraint if exists guild_tb_operation_contributions_slot_context_fk;
alter table public.guild_tb_operation_contributions
  add constraint guild_tb_operation_contributions_slot_context_fk
  foreign key (slot_id, event_id, guild_id, phase)
  references public.guild_tb_operation_slots(id, event_id, guild_id, phase)
  on delete restrict;

comment on constraint guild_tb_mission_attempts_player_id_fkey on public.guild_tb_mission_attempts is
  'Historical TB attempt evidence retains its player identity; referenced players cannot be deleted while evidence exists.';
comment on constraint guild_tb_mission_attempts_event_guild_fk on public.guild_tb_mission_attempts is
  'Historical TB attempt evidence prevents deletion of its parent event/guild context.';
comment on constraint guild_tb_operation_slots_event_guild_fk on public.guild_tb_operation_slots is
  'Operation slot history prevents deletion of its parent TB event while durable slot state exists.';
comment on constraint guild_tb_operation_assignments_slot_unit_fk on public.guild_tb_operation_assignments is
  'Assignment history prevents deletion of the referenced Operation slot/unit context.';
comment on constraint guild_tb_operation_contributions_slot_context_fk on public.guild_tb_operation_contributions is
  'Append-only contribution evidence prevents deletion of the referenced Operation slot/event context.';
