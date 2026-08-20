# SWGOH Command Center — Farm Tracker v3 Build Plan

Status: ACTIVE
Branch: `feature/farm-tracker-v3-auth-persistence`

## Why this rebuild exists

User review of the live Command Center exposed four related problems:

1. a verified account can be asked to authenticate with Discord again after the short-lived access token expires even though a long-lived refresh session still exists;
2. the Player route briefly renders the oversized legacy hero before Dashboard v2 finishes loading;
3. Journey/Farm presets can contain an incorrect game Base ID and silently lose a required unit from the rendered farm (confirmed example: GL Ahsoka used `ASAJJVENTRESS`, while the canonical game Base ID is `ASAJVENTRESS`);
4. Farm Tracker mixes completed requirements into a generic `Ready` state, which makes active blockers, unlock-ready farms, and completed farms difficult to scan.

## Competitive review distilled into product rules

### SWGOH.GG

Useful patterns to retain conceptually:

- authoritative event requirement lists;
- target/event artwork;
- explicit event tiers and requirements;
- direct character/ship drill-down;
- no omission of a required unit just because roster evidence is missing.

Command Center advantage:

- overlay the player's live roster directly;
- separate current vs target progression;
- preserve account/Guild context;
- add actionable farm ordering instead of presenting only static event data.

### The Don Project Farm Tracker / community trackers

Useful patterns:

- compact portrait-led rows;
- one farm can be collapsed;
- current Level / Stars / Gear / Relic are visible without opening each character;
- progress is graphical rather than long-form prose;
- multiple farms can be viewed together;
- custom/tracked farms are first-class.

Command Center should improve on this with authoritative Base-ID validation, durable account goals, game-native imagery, and explicit evidence boundaries.

## Non-negotiable data rules

1. **Every preset Base ID must resolve against the current game catalog.**
2. Known legacy/typo Base IDs may be canonicalized by an explicit alias table with regression coverage.
3. An unresolved required unit is displayed as `DATA MAPPING REQUIRED`; it is never dropped from the requirement count.
4. Event completion and farm readiness are different concepts.
5. A target is `COMPLETED` when the unlock target is already owned/unlocked by the player.
6. A target is `READY TO UNLOCK` when all normalized entry requirements are met and the target is not yet owned.
7. Otherwise a tracked target is `ACTIVE FARM`.
8. A required unit that meets its target is `COMPLETE`, not merely `READY`.
9. Missing roster evidence remains `MISSING / UNKNOWN`; it is not treated as completed.
10. Current 2026 Era-Level journeys remain separate from legacy Star/Gear/Relic readiness until Era Level is authoritative roster evidence.

---

# FT0 — Session persistence + route stability

## FT0.1 Silent refresh

- `/api/auth/status` checks the access cookie first;
- when access is missing/expired and a refresh cookie exists, refresh the Supabase session server-side;
- rotate access + refresh cookies in the response;
- only return unauthenticated when the refresh session is genuinely invalid;
- temporary upstream auth failure must not destroy a valid local refresh cookie.

## FT0.2 Player page first-paint stability

- load Dashboard v2 density CSS statically in the document head;
- do not wait for the Player Command JS model to inject the stylesheet;
- eliminate the oversized legacy hero flash between clicking `Player` and the compact dashboard becoming ready.

Acceptance:

- returning verified users do not need to press Discord again while the refresh session is valid;
- Player route never presents the old large-screen hero as its normal loading state.

---

# FT1 — Canonical Journey requirement integrity

## FT1.1 Shared canonicalizer

Create a single preset canonicalization layer used before any Farm/Journey renderer initializes.

Initial confirmed alias:

- `ASAJJVENTRESS` -> `ASAJVENTRESS`

The alias table is evidence-backed and must not become a fuzzy guessing system.

## FT1.2 Runtime catalog audit

After the static catalog loads:

- validate every target Base ID;
- validate every required Base ID;
- collect unresolved IDs by event;
- expose a Farm data-quality summary;
- show unresolved requirements in the UI instead of suppressing them.

## FT1.3 Regression audit

Tests must ensure:

- GL Ahsoka contains all 16 requirements;
- Asajj resolves as `ASAJVENTRESS` and remains R5;
- requirement counts cannot shrink because a unit is absent from the live roster;
- aliases preserve the original source ID for diagnostics.

---

# FT2 — Farm Tracker v3 information architecture

Desktop target: dense multi-farm command surface, not stacked document cards.

## FT2.1 Status command bar

Top-level tabs/counters:

- **ACTIVE FARMS** — tracked targets with unmet requirements;
- **READY TO UNLOCK** — all entry requirements complete, target not owned;
- **COMPLETED** — unlock target owned;
- **ALL JOURNEYS** — supported legacy Journey catalog;
- **ERA JOURNEYS** — separate evidence contract.

This directly replaces the ambiguous use of `Ready` for both a completed prerequisite and an unlock-ready event.

## FT2.2 Compact target cards

Each target card contains:

- target portrait;
- target/event name;
- category;
- overall progress;
- completed requirement count / total;
- active blocker count;
- status (`ACTIVE FARM`, `READY TO UNLOCK`, `COMPLETED`, `ERA DATA`);
- track/untrack control;
- collapse/expand control.

## FT2.3 Requirement matrix

Expanded target uses a compact matrix instead of large independent cards.

Columns:

- portrait + unit name;
- current stars;
- current level;
- current Gear/Relic;
- target;
- delta / blocker;
- status.

Characters and ships use appropriate progression columns.

## FT2.4 Blockers and completed requirements are separated

Within an expanded farm:

**NEEDS WORK**
- shown first;
- ordered by actionable progression gap;
- missing acquisition first when appropriate.

**COMPLETED REQUIREMENTS**
- separate collapsible section;
- compact portrait strip/table;
- never mixed into the blocker list.

This preserves evidence but removes visual clutter.

---

# FT3 — Farm ordering and actionable progression

Do not use a single naive percentage as the only recommendation signal.

Expose separately:

- requirements complete / total;
- missing unlocks;
- star deficits;
- Gear deficits;
- Relic deficits;
- ship-star deficits;
- prerequisite Journey dependencies;
- material evidence when authoritative.

Future ordering may use a transparent distance model, but it must not pretend that one Relic level equals one star or one Gear level without an explicit weighting contract.

---

# FT4 — Assets and game-native visual resources

Priority order:

1. live roster image;
2. versioned static catalog image;
3. existing Command Center game-asset maps;
4. source-backed game asset URL where legally/technically appropriate;
5. explicit fallback icon.

Add visual resources for:

- Journey target portraits;
- all prerequisite characters/ships;
- Gear/relic/material categories where the versioned game database has authoritative asset identity;
- currencies/materials only when their ID-to-image mapping is canonical.

Do not use decorative fake resource icons as if they were game materials.

---

# FT5 — Journey source completeness

For each supported preset store/source-check:

- event ID / Journey target;
- complete requirement list;
- requirement type + target tier;
- event source/provenance;
- last validation date.

Use current SWGOH.GG event/quest data as an external cross-check, while the Command Center runtime continues to use its own versioned game catalog for unit identity and images.

---

# FT6 — Responsive + performance pass

- 1366x768: target/status summary above the fold;
- desktop: 4–6 target cards per row depending width;
- tablet: 2–3;
- mobile: 1;
- lazy-load portraits;
- do not render thousands of detailed requirement cards until expanded;
- reuse shared player/catalog snapshots where possible.

## Delivery sequence

1. FT0 session persistence
2. FT0 first-paint CSS stability
3. FT1 canonical preset layer + Asajj correction
4. FT1 runtime preset audit
5. FT2 status command bar + compact cards
6. FT2 requirement matrix + separate completed section
7. FT4 asset/resource pass
8. FT3 actionable ordering
9. FT5 full preset source audit
10. FT6 responsive/performance acceptance
