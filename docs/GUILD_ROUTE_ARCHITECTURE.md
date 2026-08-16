# Guild Command Center route architecture

Guild functionality is no longer presented as one long player-home workspace.

## Routes

- `/guild` — guild overview and membership-change summary
- `/guild/members` — current hydrated guild roster and member drill-in
- `/guild/tb` — Territory Battle officer tools, including existing ROTE planning surfaces
- `/guild/tw` — Territory War guild roster/capability workspace
- `/guild/raids` — Raid guild roster/capability workspace

The player workspace exposes **Guild** as a route link. Legacy `#guild` navigation is redirected to `/guild`.

## Shared data authority

All Guild pages use `/api/guild/by-player/:allyCode/roster`, which is backed by the process-wide `guildRosterService` shared with Discord TB commands. `Refresh Guild Now` uses `?refresh=1` to request the explicit shared-service refresh path.

The selected member Ally Code is carried between Guild routes in the query string and browser storage so direct page refreshes retain context.

## Evidence boundary

Territory War and Raid pages show factual roster depth only until mode-specific rules are encoded. They must not present fabricated readiness, expected score, or win-probability values.

## Territory Battles

The dedicated TB route preserves the existing ROTE officer tool container and places it under the TB page. Existing mission coverage, Phase Command, Operations, redundancy, farm, handoff, export, and strategy tools remain available there.
