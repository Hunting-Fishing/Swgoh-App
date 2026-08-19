-- Production security-advisor follow-up for Stage 9 trigger functions.
-- Trigger guards do not need SECURITY DEFINER privileges and must not be
-- directly executable through exposed anon/authenticated RPC roles.

alter function public.guard_immutable_tb_assignment_run_payload() security invoker;
revoke all on function public.guard_immutable_tb_assignment_run_payload() from public,anon,authenticated;
grant execute on function public.guard_immutable_tb_assignment_run_payload() to service_role;

alter function public.guard_append_only_tb_assignment_approval() security invoker;
revoke all on function public.guard_append_only_tb_assignment_approval() from public,anon,authenticated;
grant execute on function public.guard_append_only_tb_assignment_approval() to service_role;
