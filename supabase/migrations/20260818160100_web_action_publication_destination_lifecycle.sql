alter table public.web_action_publications
  drop constraint if exists web_action_publications_check;

alter table public.web_action_publications
  drop constraint if exists web_action_publications_target_shape_check;

alter table public.web_action_publications
  add constraint web_action_publications_target_shape_check check (
    (target_kind = 'player_page' and target_player_id is not null and target_guild_id is null and discord_destination_id is null)
    or (target_kind = 'guild_page' and target_guild_id is not null and target_player_id is null and discord_destination_id is null)
    or (target_kind = 'discord' and target_guild_id is not null and target_player_id is null)
  );

comment on table public.web_action_publications is 'Optional publication targets for a saved web action result: player page, Guild page, or verified Discord destination. Discord destination references may become null after destination removal while the historical publication record remains.';
