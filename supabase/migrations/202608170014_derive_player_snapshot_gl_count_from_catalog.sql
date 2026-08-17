create or replace function private.derive_player_snapshot_catalog_metrics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_gl_count integer := 0;
  v_catalog_version text;
begin
  select count(*)::integer
    into v_gl_count
  from public.player_units_current puc
  join public.game_units gu on gu.base_id = puc.base_id
  where puc.player_id = new.player_id
    and 'galactic_legend' = any(gu.categories);

  select max(gu.catalog_version)
    into v_catalog_version
  from public.game_units gu
  where gu.catalog_version is not null;

  new.gl_count := coalesce(v_gl_count, 0);
  new.metrics := (coalesce(new.metrics, '{}'::jsonb) - 'glCountPendingCatalog')
    || jsonb_build_object(
      'glCountSource', 'game_units.categories:galactic_legend',
      'glCountCatalogVersion', v_catalog_version
    );
  return new;
end;
$$;

drop trigger if exists player_snapshots_derive_catalog_metrics on public.player_snapshots;
create trigger player_snapshots_derive_catalog_metrics
before insert or update on public.player_snapshots
for each row execute function private.derive_player_snapshot_catalog_metrics();

comment on column public.player_snapshots.gl_count is
  'Number of owned current units classified by the current game catalog with category galactic_legend.';
