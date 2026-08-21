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
- Shared navigation and card language across Player, Guild, TB, Actions and Auth.
- Preserve existing live-data and authentication contracts while changing presentation.
- **Enhancement-only rule:** existing information must remain accessible. Older/reference surfaces may be visually demoted, but not removed merely to make a screen cleaner.

## Branch coordination

**GAC is frozen on this styling branch until further notice.** A separate branch is actively working on GAC, so ongoing work here must not modify GAC CSS, JavaScript, tests, selectors or behavior. Existing GAC changes already present in this branch are left as-is; new work proceeds around them to reduce merge conflicts.

## Rollout status

| Workstream | Status | Completion |
| --- | --- | ---: |
| Onboarding | Implemented on styling branch | 100% |
| Action Center | Implemented on styling branch | 100% |
| Shared visual language | Established across major non-GAC workspaces and Auth | 98% |
| Player Command Center + populated detail | Roster, Farm/Journey, Mods/Optimizer and retained-reference pass implemented | 85% |
| Global navigation / workspace tabs | Responsive command-rail QA pass implemented | 80% |
| GAC War Room | **Frozen here — separate branch owns further GAC work** | 85% |
| Guild Command Center | Populated member/table/detail responsive QA expanded | 78% |
| TB / ROTE | Populated phase/mission/candidate readability QA expanded | 75% |
| Login / auth visual alignment | Login/Signup styling implemented; OAuth/session logic deliberately unchanged | 90% |
| Cross-device/accessibility | Responsive/focus/overflow rules expanded across major non-GAC surfaces | 68% |

Approximate overall visual modernization on this branch: **85%**.

## Information-preservation corrections

- Events and Resources no longer replace their whole workspace DOM with `innerHTML`; visual libraries are prepended and existing detailed DOM/handlers remain mounted.
- Original roster controls/grid are restored below Roster Commander as retained detailed reference.
- Farm Gallery no longer suppresses Farm V3 command/surfaces or the Master Farm Plan.
- TB/ROTE descriptive map/territory information previously hidden for density has been restored.
- Regression checks prohibit the new professional enhancer layers from deleting/replacing workspace content or fetching alternate data.
- A dedicated non-GAC QA regression test rejects `.gac-*` / `data-gac` selectors from the current responsive polish layer.

## Populated Player pass

- Added additive `player-command-professional` styling through the existing asset chain.
- Kept all Roster Commander filters, presets, saved views, summary metrics, ROTE demand, abilities, Mods, readiness and table actions.
- Increased Roster Commander hierarchy, typography, controls, summary cards and table readability.
- Reworked Farm Gallery density from 5 target columns / 7 unit columns toward 4 / 5 wide-screen groups with responsive fallbacks.
- Enlarged Farm target imagery, states, stats, actions, requirement controls and unit tiles.
- Enlarged Current Journey/Era Guide while retaining descriptions, evidence boundaries, source links, tiers and requirements.
- Enlarged Mods Audit summaries, pips and tables while retaining metrics.
- Improved Mod Optimizer controls, assignments, move chips and donor information without changing optimizer logic.
- Visual Resource/Event libraries supplement the original detailed content instead of replacing it.

## Auth pass

- Added an additive `auth-professional.css` layer to Login and Signup; `auth-page.js` was not modified.
- Preserved Discord and Google provider URLs including `next=/onboarding`.
- Preserved active-session card, status/error live region, sign-out control, email/password fields and password reveal controls.
- Preserved Signup display name, password confirmation and ownership-verification/security explanations.
- Upgraded the visual language to bright gold/cyan/purple command styling consistent with Onboarding.
- Increased provider buttons, input fields and primary actions for readability/touch use.
- Added visible keyboard focus states and mobile layouts.
- Added regression checks protecting provider links, onboarding redirects, forms, status messaging and the existing Auth script contract.
- OAuth/session redirect behavior remains intentionally untouched by this styling branch.

## Guild pass

- Brighter guild identity/freshness shell and larger tabs.
- Full Guild stat set retained.
- TB/TW/Raid capability areas visually separated.
- Member search/filter/sort retained.
- Member, GP, character GP, ship GP, GL, R7+, R9 and roster-state columns retained.
- Member GL/top-unit detail retained.
- Populated-state table now has a deliberate horizontal data width instead of compressing columns into unreadable cells.
- Member table/detail scrolling uses contained overscroll and stable scrollbar space.
- Guild tab rail and keyboard focus behavior improved for laptop/tablet/mobile use.
- Small member/change/roster-state labels raised into the readability target.

## TB / ROTE pass

- Phase deck, galaxy map, planet nodes, mission board, gate/core units, candidate lists and legacy Geo/Hoth layouts retained.
- Larger phase/territory/readiness/mission/candidate presentation.
- Lane identity improved for Dark, Mixed, Light and Bonus paths.
- Map relationships/positions and map/operations state behavior unchanged.
- Small populated-state labels, readiness badges, legacy details, mission controls and candidate text raised into the readability target.
- Candidate rows, legacy territories and mission chips receive larger touch/readability treatment.
- Phase/view navigation gains contained horizontal scrolling at narrow widths rather than squeezing controls.

## Shared non-GAC responsive QA pass

- Added `non-gac-responsive-polish.css` as an additive layer through the existing Player professional enhancer.
- Shared workspace tabs now use the common gold active state, larger 46–48px touch targets, scroll snapping and contained horizontal scrolling.
- Added visible focus treatment for shared workspace, Guild and TB/ROTE controls.
- Increased baseline workspace intro/note/table typography.
- Added desktop/laptop/tablet/mobile rules without hiding or replacing content.
- Added reduced-motion support.
- The stylesheet contains no GAC selectors and is protected by a regression test.

## Next implementation order

### 1. Non-GAC populated-state visual QA
- Continue static and real-data review of Player, Guild, TB/ROTE, Farm/Journey, Mods, Events/Resources and Auth.
- Correct overflow, clipping and interaction conflicts without removing information.
- Keep GAC untouched while the separate GAC branch is active.

### 2. Shared-style consolidation
- Gradually consolidate proven visual tokens/components after validation.
- Reduce duplicated one-off rules only after the current surfaces are stable.
- Do not rewrite live workflow logic solely for styling.

### 3. Auth behavior — separate functional workstream
- Diagnose the OAuth/session redirect loop independently from presentation.
- Keep the visual branch free of speculative session/auth logic changes.

## Guardrails

- No production-facing mock SWGOH player data.
- No styling change may alter auth, Ally Code ownership verification, roster lookup or guild-binding contracts.
- Existing information must remain accessible.
- Prefer additive classes/data attributes/prepending over replacing workspace DOM.
- Do not modify GAC on this branch while the separate GAC workstream is active.
- Decorative visuals stay lightweight/CSS-driven unless an approved asset pipeline exists.
