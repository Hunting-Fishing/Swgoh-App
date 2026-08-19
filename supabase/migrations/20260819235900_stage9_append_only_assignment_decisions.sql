create or replace function public.reject_guild_tb_assignment_decision_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'TB_ASSIGNMENT_DECISION_HISTORY_APPEND_ONLY';
end
$$;

drop trigger if exists reject_guild_tb_assignment_decision_update_delete on public.guild_tb_assignment_decisions;
create trigger reject_guild_tb_assignment_decision_update_delete
before update or delete on public.guild_tb_assignment_decisions
for each row execute function public.reject_guild_tb_assignment_decision_mutation();

drop trigger if exists reject_guild_tb_assignment_decision_truncate on public.guild_tb_assignment_decisions;
create trigger reject_guild_tb_assignment_decision_truncate
before truncate on public.guild_tb_assignment_decisions
for each statement execute function public.reject_guild_tb_assignment_decision_mutation();

revoke update, delete, truncate on table public.guild_tb_assignment_decisions from service_role;
grant select, insert on table public.guild_tb_assignment_decisions to service_role;

revoke all on function public.reject_guild_tb_assignment_decision_mutation() from public,anon,authenticated;
