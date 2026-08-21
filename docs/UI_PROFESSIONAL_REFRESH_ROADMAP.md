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

## Rollout status

| Workstream | Status | Completion |
| --- | --- | ---: |
| Onboarding | Implemented on styling branch | 100% |
| Action Center | Implemented on styling branch | 100% |
| Shared visual language | Established across major workspaces | 97% |
| Player Command Center + populated detail | Roster, Farm/Journey, Mods/Optimizer and retained-reference pass implemented | 85% |
| Global navigation / workspace tabs | Shared command-rail pass implemented | 65% |
| GAC War Room | Professional battle-room pass implemented; reference preservation corrected | 85% |
| Guild Command Center | Professional overview/member/capability styling implemented | 70% |
| TB / ROTE | Professional phase/map/mission-board pass implemented | 65% |
| Login / auth visual alignment | Pending; behavior remains outside styling scope | 10% |
| Cross-device/accessibility | Responsive rules expanded across major workspaces | 52% |

Approximate overall visual modernization: **75%**.

## Information-preservation corrections

- GAC V3 no longer hides older/reference GAC scaffolding merely to remove duplication.
- Events and Resources no longer replace their whole workspace DOM with `innerHTML`; visual libraries are prepended and existing detailed DOM/handlers remain mounted.
- Original roster controls/grid are restored below Roster Commander as retained detailed reference.
- Farm Gallery no longer suppresses Farm V3 command/surfaces or the Master Farm Plan.
- TB/ROTE descriptive map/territory information previously hidden for density has been restored.
- Regression checks now prohibit the new professional enhancer layers from deleting/replacing workspace content or fetching alternate data.

## Populated Player pass

- Added additive `player-command-professional` styling through the existing asset chain.
- Kept all Roster Commander filters, presets, saved views, summary metrics, ROTE demand, abilities, Mods, readiness and table actions.
- Increased Roster Commander hierarchy, typography, controls, summary cards and table readability.
- Reworked Farm Gallery density from 5 target columns / 7 unit columns toward 4 / 5 wide-screen groups with responsive fallbacks.
- Enlarged Farm target imagery, states, stats, actions, requirement controls and unit tiles.
- Enlarged Current Journey/Era Guide while retaining descriptions, evidence boundaries, source links, tiers and requirements.
- Enlarged Mods Audit summaries, pips and tables while retaining metrics.
- Improved Mod Optimizer controls, assignments, move chips and donor information without changing optimizer logic.
- Visual Resource/Event libraries now supplement the original detailed content instead of replacing it.

## GAC War Room pass

- Colorful battle-command shell with larger setup, HUD, matchup, board and counter surfaces.
- Enter Board is visually dominant while Scout and Truth Gate remain accessible.
- Matchup metrics reduced from eight cramped columns to four readable groups without removing metrics.
- Territory board, manual enemy entry, fleets, evidence counters, heuristic counters, history, execution and diagnostics retained.

## Guild pass

- Brighter guild identity/freshness shell and larger tabs.
- Full Guild stat set retained.
- TB/TW/Raid capability areas visually separated.
- Member search/filter/sort retained.
- Member, GP, character GP, ship GP, GL, R7+, R9 and roster-state columns retained.
- Member GL/top-unit detail retained.

## TB / ROTE pass

- Phase deck, galaxy map, planet nodes, mission board, gate/core units, candidate lists and legacy Geo/Hoth layouts retained.
- Larger phase/territory/readiness/mission/candidate presentation.
- Lane identity improved for Dark, Mixed, Light and Bonus paths.
- Map relationships/positions and map/operations state behavior unchanged.

## Next implementation order

### 1. Login / auth visual alignment
- Align login/signup with onboarding without changing OAuth/session behavior.
- Preserve every auth error, provider button, redirect parameter and recovery path.

### 2. Populated-state visual QA
- Validate major workspaces with real populated data at desktop/laptop/tablet/mobile breakpoints.
- Correct overflow, clipping and conflicts without removing information.

### 3. Shared-style consolidation
- Gradually consolidate proven visual tokens/components after validation.
- Do not rewrite live workflow logic solely for styling.

## Guardrails

- No production-facing mock SWGOH player data.
- No styling change may alter auth, Ally Code ownership verification, roster lookup or guild-binding contracts.
- Existing information must remain accessible.
- Prefer additive classes/data attributes/prepending over replacing workspace DOM.
- Decorative visuals stay lightweight/CSS-driven unless an approved asset pipeline exists.
