create index if not exists gac_bracket_players_player_id_idx
  on public.gac_bracket_players(player_id)
  where player_id is not null;
