# SWGOH Command Center — Professional UI Refresh

Branch: `ui/starwars-professional-refresh`

## Design direction

The Command Center should feel like a colorful Star Wars-inspired game companion rather than a dark enterprise admin console.

Core visual principles:

- Bright sci-fi command deck instead of near-black/navy surfaces everywhere.
- Warm gold, amber and orange for primary actions and rewards.
- Cyan for live data, navigation and active intelligence.
- Purple/pink for Journey, collection and special feature accents.
- Green for completed/verified states.
- Larger typography and touch targets; avoid sub-0.7rem text for primary UI.
- Fewer items packed into one row; favor readable cards and responsive clusters.
- Strong visual hierarchy: page mission -> player context -> primary action -> supporting data.
- Game-like progress, mission, readiness and status presentation.
- Shared navigation and card language across Player, Guild, GAC, TB and Actions.
- Preserve existing live-data and authentication contracts while changing presentation.
- Enhancement-only rule: existing information must remain accessible. Older/reference surfaces may be visually demoted, but not removed merely to make a screen cleaner.

## Current audit findings

1. The app currently has many feature-specific CSS layers loaded together on the main dashboard.
2. Several late CSS layers deliberately compress controls, KPIs and labels into very small type.
3. The visual palette is dominated by near-black, navy and low-saturation blue.
4. Onboarding, Actions, Player Dashboard, Guild tools and GAC use different page shells and navigation patterns.
5. Success states and major player accomplishments do not receive enough visual emphasis.
6. Important actions often look similar to secondary utility controls.
7. Desktop layouts prioritize maximum density over scanability and game-like presentation.
8. Mobile behavior exists, but several dense desktop patterns should be redesigned rather than merely stacked.
9. Some V3 cleanup logic hid older GAC scaffolding. This has been corrected so reference information remains visible under the enhancement-only rule.
10. TB/ROTE phase, readiness, mission and candidate labels frequently fall into the 0.5–0.66rem range; the professional layer enlarges those surfaces without changing the tactical model.

## Rollout status

| Workstream | Status | Completion |
| --- | --- | ---: |
| Onboarding visual redesign | Implemented on styling branch | 100% |
| Action Center visual redesign | Implemented on styling branch | 100% |
| Shared palette / visual language | Established across onboarding, Actions, Player, GAC, Guild and TB/ROTE | 95% |
| Player Command Center shell + overview | First readability / color / density pass implemented | 65% |
| Global navigation / workspace tabs | First shared visual pass implemented | 60% |
| GAC War Room visual modernization | Professional battle-room pass implemented; reference information preservation corrected | 85% |
| Guild Command Center pages | Professional overview/member/capability styling implemented; populated-state review pending | 70% |
| TB / ROTE map and planning surfaces | Professional phase/map/mission-board pass implemented; populated-state review pending | 65% |
| Login / auth visual alignment | Pending after onboarding path stabilizes | 10% |
| Cross-device polish + accessibility review | Responsive rules expanded; full review pending | 45% |

Approximate overall visual modernization: **68%**.

## Implemented in the Player overview pass

- Reduced 10-column KPI rows to readable 5-column desktop clusters.
- Reduced 10-column launch rails to readable 5-column desktop clusters.
- Increased KPI, launch, player identity and module typography.
- Increased touch targets and module spacing.
- Added warm/cool color families to dashboard cards and workspace states.
- Upgraded active workspace navigation to a strong gold command state.
- Enlarged visual-library cards and their imagery/status treatments.
- Added responsive 3-column, 2-column and 1-column fallbacks for smaller displays.

## Implemented in the GAC War Room pass

- Replaced the white/gray tactical interior with the same colorful command-deck language used across the new app shell.
- Enlarged the War Room title, status state, setup controls and primary battle actions.
- Made Enter Board the visually dominant quick action while keeping Scout and Truth Gate available.
- Enlarged tactical HUD cards and made ready/warning/unknown states easier to scan.
- Changed eight matchup metrics into four-column readable groups.
- Preserved the territory-map board while enlarging territories, slots, unit art, labels and progress indicators.
- Increased readability of enemy defense selection and counter-recommendation cards.
- Added distinct visual treatment for evidence-backed counters, heuristic counters, missing counters and fleet territories.
- Added responsive single-column territory ordering for narrower screens while retaining the desktop battlefield map.
- Preserved existing live opponent lookup, manual board entry, counter logic, scouting/history, fleet handling, battle execution and Truth Gate behavior.
- Corrected the V3 cleanup rule so older/reference GAC information remains visible instead of being hidden.

## Implemented in the Guild Command Center pass

- Added a brighter guild identity/header treatment without changing live guild fetches or hydration state.
- Enlarged source/freshness indicators and refresh controls.
- Upgraded Guild navigation tabs with readable touch targets and non-destructive icons.
- Restyled the full guild stat set rather than removing or consolidating metrics.
- Added color families for Guild GP, Galactic Legends, relic depth, ships and membership metrics.
- Converted TB, TW and Raid capability cards into clearly separated game-mode surfaces while preserving their existing copy and actions.
- Improved membership-change cards without reducing change history shown by the existing renderer.
- Enlarged member search/filter/sort controls and maintained all current filtering options.
- Increased guild member table readability while retaining all columns: member, total GP, character GP, ship GP, GLs, R7+, R9 and roster state.
- Improved selected-member detail, Galactic Legend chips and top-unit presentation without changing the underlying roster model.
- Added desktop/tablet/mobile responsive layouts.
- Added regression tests that prohibit the new Guild professional layer from removing nodes, fetching alternate data, or hiding content.

## Implemented in the TB / ROTE pass

- Preserved the existing phase deck, galaxy map, planet nodes, mission board, gate/core units, candidate lists and legacy Geo/Hoth information layouts.
- Enlarged phase tabs, phase labels and phase descriptions.
- Enlarged territory cards, planet art, readiness indicators and mission icons.
- Improved lane-specific readability for dark-side, mixed, light-side and bonus paths without altering their underlying status classes.
- Enlarged ROTE planet nodes and selected-planet treatment while keeping map relationships and positions intact.
- Enlarged mission-board summaries, readiness status, mission chips, gate units and candidate rows.
- Restored descriptive text inside fan-map planet details and legacy Geo/Hoth territory cards where previous density styling hid those descriptions.
- Preserved map/operations view state behavior; the professional loader does not fetch, mutate or replace tactical data.
- Added desktop/tablet/mobile responsive layouts and reduced-motion handling.
- Added regression tests protecting the additive TB/ROTE presentation layer.

## Next implementation order

### 1. Player Command Center detail polish

- Review real populated roster state for overflow and visual balance.
- Improve feature-family accents for Journey, Farm, GAC, Guild and Resources.
- Preserve explanatory information while reducing visual competition through hierarchy rather than deletion.
- Continue removing sub-0.7rem text from primary interaction surfaces.

### 2. Login / auth

- Align login/signup visual language with onboarding after the OAuth flow is stable.
- Keep authentication messaging simple and avoid decorative changes that obscure errors.

### 3. Populated-state visual QA

- Validate Onboarding, Actions, Player, GAC, Guild and TB/ROTE with real populated data.
- Check wide desktop, laptop, tablet and mobile breakpoints.
- Correct overflow, clipping and interaction conflicts without removing information.

## Guardrails

- No mock SWGOH player data should be introduced for production-facing states.
- Styling changes should not alter authentication, Ally Code ownership verification, roster lookup or guild-binding contracts.
- Existing information must remain accessible during UI modernization.
- Decorative visuals should remain lightweight and CSS-driven unless a licensed/approved asset pipeline is established.
- New shared styling should gradually reduce the number of conflicting one-off CSS rules rather than adding permanent override layers indefinitely.
