# SWGOH Command Center — UI / Dashboard v2 Build Plan

Status: ACTIVE
Branch: `feature/ui-dashboard-v2`
Paused work: ROTE A–F / Tactical Map v2 remains frozen on its existing feature branch while this visual program is in progress.

## Objective

Rebuild the Command Center presentation layer so the most important player and Guild information is visible above the fold at 100% desktop zoom, while preserving every existing data/evidence boundary and deep workflow.

The target experience is a modern Star Wars command console rather than a stacked dark-form interface:

- compact command header;
- icon-led navigation;
- stronger visual hierarchy and brighter surfaces;
- game portraits / event / planet / resource art wherever authoritative assets exist;
- high information density without reducing readability;
- drill-down second, summary first;
- no fabricated metrics or placeholder game data.

## Non-negotiable rules

1. **No mock live data.** Missing values remain N/A / unknown.
2. **No fake win percentages.** Existing evidence semantics remain intact.
3. **Do not remove deep workflows.** Dashboard v2 is a compact launch/summary surface; existing Roster, Farm, Mods, GAC, Guild, ROTE, etc. stay available.
4. **Use actual catalog/live image URLs where available.** Do not fabricate character portraits or game screenshots.
5. **Journey Guide becomes first-class.** Reuse the existing Journey Map / eligibility engines before creating duplicate logic.
6. **Desktop above-the-fold target.** At 1366×768 and larger, the first meaningful dashboard view should fit the primary command summary with minimal/no vertical scrolling.
7. **Mobile remains responsive.** Compression must not make touch targets unusable.

---

# Phase UI-0 — foundation and visual contract

## UI-0.1 Branch isolation

- build from current `main` on `feature/ui-dashboard-v2`;
- do not write to the paused ROTE feature branch;
- resync current main before each major slice if needed.

## UI-0.2 Shared visual tokens

Create a final-loaded visual layer for:

- page density;
- panel radius / border / shadow hierarchy;
- bright command-blue / cyan / gold accents;
- compact KPI cards;
- icon launch tiles;
- image-backed module cards;
- consistent headings, chips and buttons;
- responsive density breakpoints.

## UI-0.3 Asset resolution contract

Preferred order for visuals:

1. live roster unit image;
2. static catalog unit image;
3. existing repository visual asset map;
4. explicit icon fallback;
5. initials only when no authoritative image exists.

Never treat a missing image as missing gameplay evidence.

---

# Phase UI-1 — compact onboarding

Goal: verified onboarding should fit in one desktop viewport at normal zoom.

## UI-1.1 Reduce vertical waste

- top margin/header height reduced;
- hero heading reduced after verification;
- onboarding steps become a thin progress rail;
- verified identity becomes compact rows rather than large stacked cards;
- primary actions stay visible without scrolling.

## UI-1.2 State-aware layout

Pending/challenge flows may use more room when instructions are necessary.
Verified users get a compact completion state because the setup explanation is no longer the primary task.

Acceptance:

- verified state fits at 100% on common laptop screens;
- sign-out remains reachable;
- account/player/Guild/clearance/proof remain visible;
- no identity/security information removed.

---

# Phase UI-2 — landing dashboard v2

Goal: the Overview tab becomes a true launch dashboard rather than a long report.

## UI-2.1 Compact command header

Replace the large marketing-style hero with:

- SWGOH Command Center title;
- current player / Ally Code / Guild;
- data freshness indicator;
- compact Ally Code lookup;
- health status.

## UI-2.2 Icon launch rail

First-class launches:

- Dashboard
- Roster
- Squads
- Journey Guide
- Events
- GAC
- TW
- Guild / TB
- Mods / Datacrons
- Ships / Fleet
- Resources
- Tools / Guides

Use accessible inline icons; game art is supplemental, not required for navigation semantics.

## UI-2.3 Above-the-fold player summary

Display compact KPIs using real current model values:

- Galactic Power
- Character GP
- Ship GP
- Level
- roster count
- characters
- ships
- Relic depth
- Zetas
- Omicrons
- relevant N/A/unknown states

Keep individual evidence streams distinct.

## UI-2.4 Primary intelligence modules

Three/four compact modules:

- Journey Guide / closest supported farms;
- current Events / mode launches;
- ROTE / Guild pressure summary;
- recent progression / development signals.

Only show data already supported by the repository. Deep detail collapses below the fold.

---

# Phase UI-3 — Journey Guide first-class module

Existing reusable engines:

- `farm-journey-map-pro.js`
- `journey-event-eligibility-pro.js`
- `farm-presets.js`
- `journey-progress.js`

## UI-3.1 Navigation

- add dedicated Journey Guide launch from dashboard;
- make Journey Guide visually distinct from generic Farm Tracker;
- preserve existing farm tracking integration.

## UI-3.2 Journey catalog audit

Compare supported preset list against current Journey Guide roster.

For every supported event expose:

- unlock target;
- category;
- requirement characters/ships;
- live player readiness;
- missing/progression gaps;
- target portrait;
- tracking shortcut.

Unknown/unsupported event requirements remain explicitly unsupported rather than guessed.

## UI-3.3 Dashboard Journey preview

Show closest supported unlocks / tracked targets using existing readiness calculations.

---

# Phase UI-4 — authoritative visual asset pass

## UI-4.1 Unit portraits

Use catalog/live images consistently in:

- dashboard modules;
- Journey cards;
- Guild/TB summaries;
- roster shortcuts.

## UI-4.2 Mode/location visuals

Add existing or safely sourced visual assets for:

- ROTE planets;
- TB locations;
- Journey targets;
- ships/fleet;
- resources;
- event modes.

Store external visual provenance where required. Avoid hot-linking fragile third-party assets when repository-hosted/static delivery is more appropriate.

## UI-4.3 Resource icon map

Create a stable resource/icon mapping for known currencies/material categories only when image identity is authoritative.

---

# Phase UI-5 — global density pass

Apply component standards across every major page:

- reduce oversized section intros;
- compact table rows and cards;
- shorten explanatory copy in primary surfaces;
- move long evidence explanations into expandable details/help;
- reduce redundant whitespace;
- prefer grid layouts over vertical stacks;
- preserve accessibility and touch sizing.

Target pages:

1. Player / Roster
2. Journey / Farm
3. Guild
4. ROTE / TB
5. TW
6. GAC
7. Mods / Datacrons
8. Resources
9. Actions
10. onboarding/auth

---

# Phase UI-6 — final dashboard polish

- image-backed featured cards;
- community/tools strip using approved resources;
- activity/event status strip;
- responsive desktop/tablet/mobile tuning;
- empty/loading/error-state visual cleanup;
- performance audit for image loading and DOM size.

---

# Build order

1. **UI-1 compact onboarding**
2. **UI-2 dashboard shell + density**
3. **UI-3 Journey Guide first-class navigation/catalog audit**
4. **UI-4 asset pass**
5. **UI-5 global page density pass**
6. **UI-6 final polish**

Each phase should be delivered in small commits with focused regression coverage.

## Current first slice

Implement together because they directly solve the screenshots:

- compact verified onboarding;
- final-loaded Dashboard v2 visual stylesheet;
- compact Overview information architecture;
- icon launch rail;
- compact Player Command above-the-fold summary;
- preserve deeper Player Command evidence in expandable sections;
- add a visible Journey Guide launch using existing Journey Map infrastructure.
