# SWGOH Roster Command Data Architecture

## Decision

Use a hybrid data model:

1. **Static game definition data** comes from GitHub-hosted SWGOH game data and is cached/versioned.
2. **Player roster data** comes live from Comlink by Ally Code.
3. **Calculated unit stats / GP** come from SWGOH Stats.
4. **Character artwork** comes from AE2.
5. **Roster strategy, squads, requirements, recommendations, and app-specific metadata** live in this repository as curated/versioned data.

Production must not use mock player rosters.

## Why

Game definitions such as units, skills, categories, names, and localization change far less often than player rosters. Pulling all game data and localization for every player lookup is unnecessary and expensive. The app should load static definitions once per game version and reuse them for every roster lookup.

## Static upstream

Primary machine-readable game definition source:

- `swgoh-utils/gamedata` on GitHub
- `allVersions.json` is checked first.
- Only when game or localization versions change should the large static files be refreshed.
- Player-obtainable units come from `units.json.br`.
- Skills come from `skill.json`.
- English localization comes from `Loc_ENG_US.txt.json.br`.

The Gateway currently uses this GitHub data for static context and keeps Comlink focused on live player data.

## Runtime flow

```text
Browser
  -> Swgoh-App
      -> static catalog/cache (GitHub game data)
      -> SWGOH-Live-Gateway
          -> Comlink /player (live Ally Code roster)
          -> SWGOH Stats /api (calculated stats and GP)
          -> static GitHub game data (unit definitions/localization)
          -> AE2 (art assets)
```

## Repository-owned data

The following should be stored in `Swgoh-App` and reviewed in Git:

- squad definitions
- counters
- Journey Guide / Galactic Legend requirement graphs
- event and feat rules
- raid/TW/GAC recommendations
- farming priorities
- app scoring formulas
- manually reviewed aliases and display overrides
- source/reference metadata

Do not duplicate raw CG game-data dumps in this repository unless a release snapshot is intentionally required. Keep curated app data small and reviewable.

## Update policy

- Check `allVersions.json` periodically.
- If `gameVersion` is unchanged: reuse cached static data.
- If `gameVersion` changes: refresh units/skills/other required collections.
- If `localeVersion` changes: refresh localization.
- If `assetVersion` changes: AE2 assets may need refreshing.
- Live player roster data is fetched only when a user requests an Ally Code.

## Planned app pages

1. `/` - Ally Code / player profile
2. `/units` - complete unit catalog
3. `/units/:baseId` - unit details, skills, factions, requirements
4. `/squads` - curated squads and counters
5. `/journeys` - Journey Guide and GL requirements
6. `/analysis/:allyCode` - roster gaps, priorities, feats, GAC/TW/raid readiness

## Deployment

Railway GitHub auto-deploy is not required. Manual redeploy after an approved GitHub change is acceptable for the current phase.
