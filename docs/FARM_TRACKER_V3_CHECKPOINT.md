# Farm Tracker v3 — Implementation Checkpoint

Updated: 2026-08-20

## Completed

### FT0 — Session persistence + Player first paint
- valid Supabase refresh cookie silently restores an expired/missing access session;
- refreshed HttpOnly access + refresh cookies are rotated server-side;
- invalid refresh state is cleared;
- Dashboard v2 density CSS is loaded on first paint so Player no longer relies on a delayed JS style injection.

### FT1 — Journey requirement integrity foundation
- shared canonical Base-ID alias layer executes before Farm/Journey renderers;
- confirmed GL Ahsoka Asajj alias `ASAJJVENTRESS -> ASAJVENTRESS`;
- runtime catalog audit covers every legacy target and requirement;
- unresolved mappings remain counted and display `DATA MAPPING REQUIRED`;
- original source Base ID is retained for diagnostics.

### FT2 — Compact Farm Tracker command surface
- five command views: Active Farms / Ready to Unlock / Completed / All Journeys / Era Journeys;
- compact target cards with canonical portrait, category, state, requirement completion count, blocker count, track/untrack, expand/collapse;
- target states are distinct: ACTIVE FARM / READY TO UNLOCK / COMPLETED / TRACK TO FARM;
- current Era Journeys remain a separate `ERA DATA` evidence surface with no fabricated legacy readiness percentage;
- expanded targets render a dense requirement matrix only on demand;
- blockers are shown before completed requirements;
- missing acquisition sorts ahead of progression-only blockers;
- delta labels remain explicit (`+stars`, Gear target, Relic target) instead of collapsing unlike metrics into a fake universal score;
- completed requirements are moved into a separate collapsible portrait strip;
- old chooser/tracked-list UI is hidden only after v3 successfully activates; durable account-backed Journey tracking remains underneath;
- search and responsive target-grid behavior are included;
- Farm loader cache keys bumped to `farmv3b`.

## Validation

Locally executed focused model validation:
- target state separation: PASS
- missing-first blocker ordering: PASS
- explicit Relic delta: PASS
- command view counts/filtering: PASS

The full repository cannot currently be cloned in the execution environment because `github.com` DNS resolution fails. GitHub Actions also has the known pre-job infrastructure failure pattern when `steps:null` / `logs_url:null`; do not treat that as an application test failure.

## Next slices

### FT4 — Game asset/resource pipeline
- resolve authoritative Gear/Relic/material/currency assets from versioned game data;
- no decorative fake resource icons;
- add reusable material image resolver for Farm requirements and planner surfaces.

### FT3 — Actionable farming priorities
- expose missing acquisition, stars, Gear, Relics and dependency blockers separately;
- add transparent ordering without pretending unlike progression metrics are equivalent.

### FT5 — Full Journey source audit
- verify every supported preset against current Journey/event evidence;
- store provenance/validation date;
- correct any remaining legacy Base-ID or requirement defects.

### FT6 — Responsive/performance acceptance
- 1366x768 command summary above the fold;
- 4–6 cards desktop depending width, 2–3 tablet, 1 mobile;
- detailed matrices remain lazy.
