# SWGOH Command Center — Professional UI Refresh

Branch: `ui/starwars-professional-refresh`

## Design direction

The Command Center should feel like a colorful Star Wars-inspired game companion rather than a dark enterprise admin console.

Core visual principles:

- Bright sci-fi command deck instead of near-black/navy surfaces everywhere.
- Warm gold, amber and orange for primary actions and rewards.
- Cyan for live data, navigation and active intelligence.
- Purple/pink for Journey, collection, Mods and special feature accents.
- Green for completed/verified states.
- Larger typography and touch targets; avoid sub-0.7rem text for primary UI.
- Fewer items packed into one row; favor readable cards and responsive clusters.
- Strong visual hierarchy: page mission -> player context -> primary action -> supporting data -> retained detailed reference.
- Game-like progress, mission, readiness and status presentation.
- Shared navigation and card language across Player, Guild, GAC, TB and Actions.
- Preserve existing live-data and authentication contracts while changing presentation.
- **Enhancement-only rule:** existing information must remain accessible. Older/reference surfaces may be visually demoted, but not removed merely to make a screen cleaner.

## Current audit findings

1. The app currently has many feature-specific CSS layers loaded together on the main dashboard.
2. Several late CSS layers deliberately compress controls, KPIs and labels into very small type.
3. The visual palette is dominated by near-black, navy and low-saturation blue.
4. Onboarding, Actions, Player Dashboard, Guild tools and GAC use different page shells and navigation patterns.
5. Success states and major player accomplishments do not receive enough visual emphasis.
6. Important actions often look similar to secondary utility controls.
7. Desktop layouts prioritize maximum density over scanability and game-like presentation.
8. Mobile behavior exists, but several dense desktop patterns should be redesigned rather than merely stacked.
9. Some V3 cleanup logic hid older GAC scaffolding. This has been corrected so reference information remains visible.
10. TB/ROTE phase, readiness, mission and candidate labels frequently fell into the 0.5–0.66rem range; the professional layer enlarges those surfaces without changing the tactical model.
11. The Events/Resources visual library previously replaced whole workspace DOM trees with `innerHTML`; this has been corrected to prepend the visual navigation layer while retaining existing detailed DOM and handlers.
12. Roster Commander and Farm Gallery had styling rules that hid the original roster controls/grid and Farm V3/Master Plan. The professional Player layer now restores those as retained detailed-reference surfaces.

## Rollout status

| Workstream | Status | Completion |
| --- | --- | ---: |
| Onboarding visual redesign | Implemented on styling branch | 100% |
| Action Center visual redesign | Implemented on styling branch | 100% |
| Shared palette / visual language | Established across major Command Center workspaces | 97% |
| Player Command Center + populated detail | Roster, Farm/Journey, Mods/Optimizer and retained reference pass implemented | 85% |
| Global navigation / workspace tabs | Shared command-rail pass implemented | 65% |
| GAC War Room visual modernization | Professional battle-room pass implemented; reference preservation corrected | 85% |
| Guild Command Center pages | Professional overview/member/capability styling implemented | 70% |
| TB / ROTE map and planning surfaces | Professional phase/map/mission-board pass implemented | 65% |
| Login / auth visual alignment | Pending; auth behavior remains outside styling branch scope | 10% |
| Cross-device polish + accessibility review | Responsive rules expanded across major workspaces | 52% |

Approximate overall visual modernization: **75%**.

## Implemented in the Player overview pass

- Reduced 10-column KPI rows to readable 5-column desktop clusters.
- Reduced 10-column launch rails to readable 5-column desktop clusters.
- Increased KPI, launch, player identity and module typography.
- Increased touch targets and module spacing.
- Added warm/cool color families to dashboard cards and workspace states.
- Upgraded active workspace navigation to a strong gold command state.
- Enlarged visual-library cards and their imagery/status treatments.
- Added responsive 3-column, 2-column and 1-column fallbacks for smaller displays.

## Implemented in the populated Player pass

- Added a dedicated additive `player-command-professional` layer loaded through the existing asset chain.
- Restored the original roster controls and original owned-roster grid as **DETAILED REFERENCE · RETAINED** below Roster Commander instead of hiding them.
- Kept all Roster Commander filters, presets, saved views, summary metrics, ROTE demand, abilities, Mods, readiness and action columns intact.
- Enlarged Roster Commander hero, filters, summary cards, table text and action controls.
- Changed the Farm Gallery from highly compressed 5-column target / 7-column unit layouts to readable 4-column target / 5-column unit layouts on wide displays, with responsive reductions below that.
- Restored Farm V3 command/surfaces and the Master Farm Plan alongside the Gallery; Gallery navigation no longer suppresses detailed planning information.
- Enlarged Farm target imagery, state chips, stats, actions, requirement search and unit tiles.
- Enlarged the Current Journey/Era Guide while retaining every description, evidence boundary, source link, tier detail and requirement chip.
- Enlarged Mods Audit summary/pip/table presentation while retaining all existing mod metrics and tables.
- Improved Mod Optimizer controls, assignments, move chips and donor information without changing optimizer logic.
- Corrected Events and Resources so their visual libraries are **prepended**, not destructive replacements; prior detailed DOM and handlers remain mounted.
- Added regression checks prohibiting the Player professional enhancer from fetching alternate data, deleting nodes, replacing children, assigning workspace `innerHTML`, or hiding content.

## Implemented in the GAC War Room pass

- Replaced the white/gray tactical interior with the colorful command-deck language used across the new app shell.
- Enlarged the War Room title, status state, setup controls and primary battle actions.
- Made Enter Board the visually dominant quick action while keeping Scout and Truth Gate available.
- Enlarged tactical HUD cards and made ready/warning/unknown states easier to scan.
- Changed eight matchup metrics into four-column readable groups.
- Preserved the territory-map board while enlarging territories, slots, unit art, labels and progress indicators.
- Increased readability of enemy defense selection and counter-recommendation cards.
- Added distinct visual treatment for evidence-backed counters, heuristic counters, missing counters and fleet territories.
- Added responsive single-column territory ordering for narrower screens while retaining the desktop battlefield map.
- Preserved live opponent lookup, manual board entry, counter logic, scouting/history, fleet handling, battle execution and Truth Gate behavior.
- Corrected the V3 cleanup rule so older/reference GAC information remains visible instead of being hidden.

## Implemented in the Guild Command Center pass

- Added a brighter guild identity/header treatment without changing live guild fetches or hydration state.
- Enlarged source/freshness indicators and refresh controls.
- Upgraded Guild navigation tabs with readable touch targets and non-destructive icons.
- Restyled the full guild stat set rather than removing or consolidating metrics.
- Added color families for Guild GP, Galactic Legends, relic depth, ships and membership metrics.
- Converted TB, TW and Raid capability cards into clearly separated game-mode surfaces while preserving existing copy/actions.
- Improved membership-change cards without reducing change history shown by the existing renderer.
- Enlarged member search/filter/sort controls and maintained all current filtering options.
- Retained all member-table columns: member, total GP, character GP, ship GP, GLs, R7+, R9 and roster state.
- Improved selected-member detail, Galactic Legend chips and top-unit presentation without changing the roster model.
- Added responsive layouts and non-destructive regression tests.

## Implemented in the TB / ROTE pass

- Preserved the phase deck, galaxy map, planet nodes, mission board, gate/core units, candidate lists and legacy Geo/Hoth information layouts.
- Enlarged phase tabs, labels and descriptions.
- Enlarged territory cards, planet art, readiness indicators and mission icons.
- Improved lane-specific readability for dark-side, mixed, light-side and bonus paths without altering underlying status classes.
- Enlarged ROTE planet nodes and selected-planet treatment while keeping map relationships/positions intact.
- Enlarged mission-board summaries, readiness status, mission chips, gate units and candidate rows.
- Restored descriptive text inside fan-map planet details and legacy Geo/Hoth territory cards where previous density styling hid it.
- Preserved map/operations view state behavior; the professional loader does not fetch, mutate or replace tactical data.
- Added responsive layouts, reduced-motion handling and additive regression tests.

## Next implementation order

### 1. Login / auth visual alignment

- Align login/signup shell with onboarding without changing OAuth/session behavior.
- Preserve every auth error, provider button, redirect parameter and recovery path.
- Do not modify OAuth logic while the production redirect/session issue remains under investigation.

### 2. Populated-state visual QA

- Validate Onboarding, Actions, Player, GAC, Guild and TB/ROTE with real populated data.
- Check wide desktop, laptop, tablet and mobile breakpoints.
- Correct overflow, clipping and interaction conflicts without removing information.

### 3. Shared-style consolidation

- Once the refreshed workspaces are validated, reduce one-off override layers into shared visual tokens/components.
- Keep the migration incremental so live workflow behavior is never rewritten solely for styling.

## Guardrails

- No mock SWGOH player data should be introduced for production-facing states.
- Styling changes must not alter authentication, Ally Code ownership verification, roster lookup or guild-binding contracts.
- Existing information must remain accessible during UI modernization.
- Visual enhancer layers should prefer classes/data attributes/prepending over replacing existing workspace DOM.
- Decorative visuals should remain lightweight and CSS-driven unless a licensed/approved asset pipeline is established.
- New shared styling should gradually reduce conflicting one-off CSS rules rather than adding permanent override layers indefinitely.
