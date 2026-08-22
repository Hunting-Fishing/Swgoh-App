# GAC Intelligence Refresh Status

Updated: 2026-08-23 (GMT+8)
Release branch: `feature/gac-intelligence-refresh-20260822`
Release PR: #318
Supersedes: #306
Original refresh bridge: #317
Current-main sync bridge: #322

## Completion

- Feature / implementation completion: **100%**
- GAC release-package completion: **100%**
- Targeted reconstructed GAC validation: **91 / 91 passing**
- Failures: **0**
- Skipped: **0**
- GAC release UI / reachability contract: **implemented and source-audited**
- Production Datacron warehouse migration: **APPLIED AND VERIFIED**
- Final active-branch exact-filename collision audit: **CLEAN**
- Production release action: **one merge of PR #318 to `main` followed by live asset/surface verification**

The GAC War Room / Intelligence feature package is complete. This release record intentionally distinguishes targeted GAC validation from the unavailable repository-wide manual workflow: the release is approved on the completed GAC-specific validation, production schema verification, source/reachability audit, and explicit user production-release instruction. A complete repository-wide `npm test` run is not falsely claimed.

## Validation boundary

The repository Node workflow is manual-only (`workflow_dispatch` -> Node 22 -> `npm ci` -> `npm test`). The connected GitHub controls in this session do not expose workflow dispatch, and the local execution environment cannot resolve GitHub for a normal clone.

To avoid a false test claim, GAC modules/tests needed for the intelligence slice were reconstructed from the connected branch into a Node 22 validation workspace and executed directly, with branch-source/dependency-isolated fixtures used at source-contract boundaries.

Latest consolidated targeted result before the release UI layer:

- **91 tests/checks**
- **91 passed**
- **0 failed**
- **0 skipped**

The release UI JavaScript was additionally syntax-checked on Node 22. A dedicated `test/gac-intelligence-ui-release.test.mjs` source contract now protects the global load chain, all five command-deck destinations, responsive/focus requirements, and the additive professional styling layer.

This is a real GAC-targeted release result. It is **not represented as a complete repository-wide `npm test` run**.

## Defects found and fixed during validation

### Missing relic values becoming synthetic zero — FIXED

`Number(null) === 0` caused missing relic context to risk appearing as `+0` and could coerce absent historical win/banner/relic fields into zero-like values.

Fixes:
- null-aware finite parsing in `public/gac-relic-suitability-model.js`;
- null / undefined / empty relic delta renders `—`;
- missing historical win rate, banners and relic delta remain `null`;
- regression coverage added.

### Missing roster member incorrectly completing historical relic snapshot — FIXED

An unresolved member had `effectiveRelic: null`, but `Number(null)` made the prior completeness predicate pass.

Fixes:
- every historical battle member must resolve to a non-null effective relic value;
- incomplete snapshots remain incomplete;
- incomplete snapshots cannot generate historical relic delta evidence;
- supplemental battle/DC metadata remains UNKNOWN instead of inventing R0 context;
- explicit regression test added.

### Datacron team-signature test expected input order — FIXED

Runtime grouping correctly canonicalizes deduplicated team members so equivalent squad permutations share one evidence bucket while preserving leader identity. The stale test expected original input order.

Fix:
- contract now enforces ordering-insensitive squad identity and leader-sensitive identity.

### Scouting UI test omitted slot provenance — FIXED

Runtime scouting deliberately carries `exactSlot: true/false` to distinguish verified exact-slot evidence from zone-only fallback.

Fix:
- exact-slot test requires `exactSlot: true`;
- zone fallback requires `exactSlot: false`.

### Production Datacron role inherited excess privileges — FIXED

The production migration verification showed `service_role` inherited `REFERENCES` and `TRIGGER` table privileges even though the application only needs evidence SELECT/INSERT/UPDATE.

Fixes:
- production follow-up migration revoked all table privileges and re-granted only SELECT/INSERT/UPDATE;
- sequence privileges were similarly reset to USAGE/SELECT only;
- foundation migration was corrected for clean/fresh environments;
- additive `20260823012000_gac_datacron_battle_evidence_least_privilege.sql` protects environments that already created the table;
- schema regression contract now enforces the least-privilege shape.

## Professional release UI / reachability — COMPLETE

The release adds an explicit **GAC Intelligence Command Deck** so all release-critical functions are reachable without users discovering them by scrolling through a dense War Room.

Top-level destinations:

1. **Current Board** — enter the opponent defense actually visible in-game.
2. **Counter Matrix** — roster-aware historical counter evidence.
3. **Execution Plan** — numbered whole-board attack queue and blockers.
4. **Scouting Intel** — historical defense tendencies with exact-slot vs zone-fallback provenance.
5. **Datacrons** — readiness plus exact rolled-Datacron evidence.

Reachability chain is explicit:

`asset-resilience.js` -> `gac-manual-counter-planner.js` -> `gac-manual-counter-planner-model.js` -> `gac-manual-selection-guard.js` -> Counter Matrix / Optimizer / Relic / Scouting / Staging / Datacron Readiness / Datacron Matrix / Export modules.

Release styling adds:
- brighter Star Wars command-deck presentation using gold/cyan/violet/amber intelligence identities;
- stronger heading hierarchy and readable descriptions;
- 42–46px primary touch targets;
- 5 -> 3 -> 2 -> 1 column responsive command navigation;
- responsive intelligence cards and controls;
- visible keyboard focus states;
- reduced-motion support;
- additive styling only: no live-data, auth, evidence, roster, attack-plan or battle logic replaced.

## Validated GAC surfaces

Targeted Node 22 validation covers:

- 90% Wilson evidence floor;
- sample-quality / failure-risk bands;
- historical undersize / relic burden descriptors;
- roster-aware Counter Intelligence Matrix;
- exact-defense-first evidence matching;
- minimum battle / relic thresholds;
- own-defense / reserved / planned / consumed attacker exclusion;
- non-overlapping whole-board allocation;
- projected-banner boundaries;
- risk/scarcity board optimizer;
- numbered Battle Execution Queue and blockers;
- canonical server Attack Plan separation;
- 48-item player-facing faction/role taxonomy;
- Datacron ASSIGNED / NONE / UNKNOWN normalization;
- equivalent Datacron signature grouping without instance IDs;
- Datacron evidence maturity labels;
- Datacron evidence service aggregation;
- hardened Datacron migration schema/security/index contract;
- current relic suitability;
- historical relic enrichment;
- historical scouting/staging and exact-slot provenance;
- client-only matrix + execution-plan export;
- verified-battle API auth/origin/round/confirmation boundaries;
- supplemental relic enrichment fail-soft behavior after primary battle archival.

## Implemented War Room flow

### Current-board truth

- User-entered squads actually visible in-game remain the current-board truth source when hidden live placements cannot be pulled.
- Exact entered squad composition is preferred over leader-only historical aggregates.
- Full searchable player-facing faction/role taxonomy.

### Counter Intelligence Matrix

- Current-roster constrained counters.
- Exact-defense-first evidence with explicit leader fallback.
- Minimum battle/relic filters.
- Exact variant drilldown: battles, wins, historical win rate, banners, confidence and source context.
- Counter can be locked into the authoritative server Attack Plan.

### Whole-board optimizer / execution queue

- Non-overlapping whole-board counter allocation.
- Risk/scarcity-aware ordering.
- Projected banners only with complete unique allocation + banner evidence.
- Numbered queue order: active attempt -> locked server plan -> fresh proposal.
- Loss/abandoned -> cleanup blocker.
- Unsynced/uncovered -> unnumbered officer blocker.
- Locking a proposal recalculates remaining roster availability.
- Desktop/tablet/mobile responsive queue/blocker layout.

### Historical scouting

- Historical tendencies never become current hidden-board truth.
- Exact slot evidence carries `exactSlot: true`.
- Zone fallback carries `exactSlot: false`.
- Fleet territory is never staged through squad scouting.
- Review can prefill manual editor but never silently saves a current defense.

### Datacron intelligence

- Evidence groups by state + set/template/level/normalized affixes.
- Player-specific Datacron instance IDs do not fragment evidence.
- `DC:NONE` and `DC:UNKNOWN` remain distinct.
- Equivalent team permutations aggregate canonically.
- Current owned Datacron readiness + exact-defense signature matrix.
- Primary verified battle remains valid if supplemental Datacron/relic evidence storage is unavailable.

### Export

- Counter Matrix: COPY TSV / DOWNLOAD CSV.
- Battle Execution Plan: COPY PLAN / DOWNLOAD TXT.
- Export follows numbered execution queue.
- Officer blockers export separately as **NOT ATTACK NUMBERS**.
- Export is client-only.

## Startup / render-loop audit

- Removed former 5-second Counter Matrix interval.
- Intelligence refresh is event-driven / user-triggered.
- Optimizer, relic suitability, Datacron matrix and historical staging remain on-demand.
- Release source contract rejects recurring `setInterval` polling across these surfaces.
- Faction picker / export MutationObservers are idempotent.
- GAC command-deck target reveal uses bounded one-shot timeouts rather than recurring polling.
- No infinite GAC Intelligence render/polling loop identified.

## Datacron migration — DEPLOYED AND VERIFIED

Foundation migration:
`supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql`

Least-privilege follow-up:
`supabase/migrations/20260823012000_gac_datacron_battle_evidence_least_privilege.sql`

Connected production project: **SWGOH Command Center**.

Verified production state after migration/hardening:
- table `public.gac_datacron_battle_evidence` exists;
- RLS enabled;
- initial row count: **0**, as expected because prior archived battles did not contain compatible Datacron-specific metadata;
- anon/authenticated direct table grants: **none**;
- service role table grants: **SELECT / INSERT / UPDATE only**;
- service role sequence grants: **USAGE / SELECT only**;
- primary key + unique battle-key index present;
- enemy, defender-signature, counter, attacker-signature and exact-matchup indexes present.

Supabase security advisor reports RLS-with-no-policy as INFO for this and other server-only tables. For this warehouse that is intentional: direct client roles have no table grant and service-side access uses service_role. Performance advisor reports the new indexes as unused while the warehouse has zero rows, which is expected at initial deployment and is not a release blocker.

## Branch ownership / collision gate — CLEAN

Immediately before release, PR #318 was compared by exact changed filename against active workstreams:
- #321 TB/Guild completion hardening;
- #319 TB officer immutable-assignment parity;
- #316 ROTE Tactical Map v2;
- #286 professional styling refresh (GAC frozen there);
- #72 ROTE squad variants;
- #71 ROTE Squad Workbench mission context;
- #43 Bracca/Zeffo entry intelligence.

Result: **zero exact filename collisions with #318** at the release checkpoint. The new GAC release navigation/styles are owned only by #318.

## Release decision

The GAC release package is **100% complete and approved for production merge** under the explicit release instruction received on 2026-08-23.

Known validation boundary retained after release:
- the repository-wide manual `npm test` workflow could not be dispatched from the connected controls;
- the release therefore relies on the completed targeted 91/91 GAC validation, source contracts, Node syntax validation, production database verification, collision audit, and post-merge live surface verification;
- authenticated populated-board behavior should continue to be exercised during normal production use, but there is no known GAC blocker remaining from the release audit.

## Truth boundaries

- Historical evidence never claims current hidden-board truth.
- Historical rates / Wilson floors are not predicted current-battle probabilities.
- Missing relic/banner/win-rate evidence stays unknown, never synthetic zero.
- Incomplete historical roster snapshots cannot generate relic delta evidence.
- Exact entered defenses are preferred over leader aggregates.
- Current roster reservations/consumption constrain recommendations; server Attack Plan validation remains authoritative.
- `DC:UNKNOWN` is never coerced to `DC:NONE`.
- Projected banners are evidence summaries, not guaranteed scores.
- Battle Execution Queue ordering is a planning aid, not a guaranteed win sequence.
