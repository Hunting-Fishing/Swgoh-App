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

## Current audit findings

1. The app currently has many feature-specific CSS layers loaded together on the main dashboard.
2. Several late CSS layers deliberately compress controls, KPIs and labels into very small type.
3. The visual palette is dominated by near-black, navy and low-saturation blue.
4. Onboarding, Actions, Player Dashboard, Guild tools and GAC use different page shells and navigation patterns.
5. Success states and major player accomplishments do not receive enough visual emphasis.
6. Important actions often look similar to secondary utility controls.
7. Desktop layouts prioritize maximum density over scanability and game-like presentation.
8. Mobile behavior exists, but several dense desktop patterns should be redesigned rather than merely stacked.

## Rollout status

| Workstream | Status | Completion |
| --- | --- | ---: |
| Onboarding visual redesign | Implemented on styling branch | 100% |
| Action Center visual redesign | Implemented on styling branch | 100% |
| Shared palette / visual language | Established in first two surfaces | 70% |
| Player Command Center shell + overview | Audited; implementation next | 20% |
| Global navigation / workspace tabs | Audited; implementation next | 20% |
| GAC War Room visual modernization | Existing feature work retained; styling pass pending | 15% |
| Guild Command Center pages | Styling pass pending | 10% |
| TB / ROTE map and planning surfaces | Styling pass pending | 5% |
| Login / auth visual alignment | Pending after onboarding path stabilizes | 10% |
| Cross-device polish + accessibility review | Initial responsive rules included; full review pending | 20% |

Approximate overall visual modernization: **30%**.

## Next implementation order

### 1. Player Command Center overview

- Replace the ultra-dense 10-column KPI and launch rails with readable responsive groups.
- Increase base dashboard typography.
- Add color-coded feature families.
- Establish a consistent player identity/header card.
- Make Journey/Farm/GAC/Guild entry points feel like game modes.

### 2. Shared navigation

- Standardize Player / Roster / Farm / Mods / Squads / GAC / Datacrons / Events / Guild / Resources tabs.
- Give active workspace a strong gold/cyan state.
- Keep horizontal mobile navigation with larger touch targets.
- Add consistent page-title and account/status treatment.

### 3. GAC War Room

- Treat opponent entry and counter selection as the main mission flow.
- Separate defense setup, opponent scouting, counter recommendations and battle tracking visually.
- Use territory/map-like cards rather than generic data panels.

### 4. Guild Command Center

- Create officer-oriented command sections with strong readiness status.
- Distinguish member views from officer controls.
- Consolidate TB, TW, raid and roster intelligence entry points.

### 5. TB / ROTE

- Preserve tactical density inside map/planning views while simplifying surrounding controls.
- Use planet/faction-specific accent colors and stronger mission state visuals.

## Guardrails

- No mock SWGOH player data should be introduced for production-facing states.
- Styling changes should not alter authentication, Ally Code ownership verification, roster lookup or guild-binding contracts.
- Decorative visuals should remain lightweight and CSS-driven unless a licensed/approved asset pipeline is established.
- New shared styling should gradually reduce the number of conflicting one-off CSS rules rather than adding permanent override layers indefinitely.
