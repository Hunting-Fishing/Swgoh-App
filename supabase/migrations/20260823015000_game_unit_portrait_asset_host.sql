-- Normalize legacy SWGOH.GG unit portrait URLs to the current game-assets host.
-- Exact prefix replacement only; non-SWGOH/custom URLs are untouched.

update public.game_units
set image_url = replace(
  image_url,
  'https://swgoh.gg/static/img/assets/',
  'https://game-assets.swgoh.gg/textures/'
)
where image_url like 'https://swgoh.gg/static/img/assets/%';
