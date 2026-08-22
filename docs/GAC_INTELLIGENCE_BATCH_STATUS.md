# GAC Intelligence Refresh Status

Updated: 2026-08-23 (GMT+8)
Development branch: `feature/gac-intelligence-refresh-20260822`
Draft PR: #318
Supersedes: #306 / `feature/gac-complete-faction-filter`
Original refresh bridge: #317
Current-main sync bridge: #322

This batch remains an isolated GitHub development checkpoint until explicit approval for one production merge/deploy.

## Current completion

- Feature / implementation completion: **~99%**
- Production release readiness: **~87%**
- Draft PR #318: **mergeable** at this checkpoint
- Branch baseline: **0 commits behind current `main`** after sync bridge #322
- Production deployment: **NOT performed**
- Datacron warehouse migration: **NOT applied to production**

The remaining work is release verification, authenticated visual acceptance, and the controlled production migration/merge gate rather than missing core GAC War Room capability.

## Baseline / branch safety

- Preserved GAC Intelligence work was originally reconciled onto production `main` at `9ba43d7` through isolated bridge PR #317.
- Production `main` later advanced through TB/Guild work to `a1a63ac38a4ad91cc80e1e05f38bd8da88d7c5f2`, leaving the GAC refresh branch 37 commits behind.
- Sync-only bridge PR #322 merged the new `main` into the isolated GAC branch; it did **not** merge GAC into production.
- After #322, the GAC branch was 0 commits behind `main` and PR #318 returned to a mergeable state.
- The 30 files brought in by sync PR #322 were TB/Guild files and did not overlap the GAC-specific changed-file set at that checkpoint.
- Superseded PR #306 is closed with history preserved.
- No Railway deployment was triggered by the GAC branch sync.

## Implemented in branch

### Current-board intelligence

- Full player-facing faction/role taxonomy and searchable multi-column picker.
- Manual entry of the opponent squads actually visible in-game remains the current-board truth source when hidden live board data is unavailable.
- Roster-aware counter matrix for entered current-board defenses.
- Exact-defense-first evidence matching with leader aggregate fallback.
- Minimum battle and minimum relic filters.
- Current-roster availability filtering.
- Round-consumed / own-defense / reserved attacker exclusion before recommendations.
- Exact counter variant drilldown with samples, win rate, average banners, confidence and source context.
- Matrix-to-authoritative attack-plan lock path; the server remains the final roster/overlap/context guard.

### Whole-board planning and execution

- Non-overlapping whole-board counter allocation.
- Projected banners shown only when every entered defense has a unique qualifying counter and banner evidence.
- Risk/scarcity-aware planning priority.
- Numbered **Battle Execution Queue** derived from current server plan state, current-board defense state, counter scarcity and historical evidence quality.
- Existing `attempted` attacks are ordered before locked server plans, then fresh non-overlap proposals.
- Loss/abandoned states become explicit cleanup-review blockers rather than silently becoming new attack numbers.
- Unsynced/uncovered defenses remain unnumbered officer blockers.
- Fresh optimizer proposals can be locked through canonical `POST /api/gac/attack-plan/:owner` and the queue is recalculated from the remaining roster.
- Queue reason tags explain exact-vs-fallback evidence, sample risk, scarcity, undersize evidence and relic burden.
- Responsive Battle Execution Queue / blocker styling now covers desktop, tablet and narrow mobile breakpoints including 650px and 420px layouts.

### Historical scouting

- Historical opponent scouting UI and defense prediction review flow.
- Historical scouting is explicitly labeled as non-current-board truth.
- Historical squad review can prefill the manual current-board editor but still requires user confirmation/save.
- Historical evidence is never silently written as a current visible defense.

### Datacron intelligence

- Datacron evidence normalization by ASSIGNED / NONE / UNKNOWN state.
- Equivalent Datacron evidence groups by set/template/level/normalized affixes rather than player-specific instance ID.
- Verified owner battles can archive supplemental attacker/defender Datacron evidence without blocking the primary verified battle record when the supplemental warehouse is unavailable.
- Existing counter batch response carries supplemental Datacron evidence so the browser does not require a second evidence request.
- Current owned Datacron readiness analysis for non-overlapping evidence counters.
- Datacron evidence matrix matching exact entered defense squad + confirmed defender Datacron signature.
- Datacron matrix marks current counter-roster ownership and equivalent attacker Datacron signature ownership.
- UNKNOWN defender Datacron state remains distinct from confirmed NONE.

### Export / officer utility

- Client-side counter matrix TSV copy + CSV download.
- Client-side whole-board plan copy + TXT download.
- No export server write/network path is required.

## Risk-aware intelligence slice — COMPLETE IN BRANCH

The pure `gac-evidence-risk-v1` model upgrades counter ranking from raw observed win rate to sample-aware historical evidence quality.

Implemented:

- 90% Wilson lower confidence bound for recorded win evidence;
- explicit sample-quality bands;
- descriptive failure-risk bands;
- undersize count from historical attacker/defender squad sizes;
- historical relic-burden labels using attacker-minus-defender average relic evidence;
- ranking score that prioritizes conservative evidence quality before banner/undersize value;
- risk metadata carried through non-overlap whole-board allocation;
- board-level evidence floor, high-risk/caution counts, undersize totals and relic-burden counts;
- risky/scarce defenses raised earlier in planning priority;
- UI labels explicitly distinguish historical observed rate from the conservative evidence floor.

Truth boundary: the confidence bound and risk band summarize historical evidence. They are **not** a predicted probability for the user's exact current battle.

## Startup / render-loop review — COMPLETE IN CODE AUDIT

The GAC Intelligence startup/render path was reviewed after the current-main sync.

Changes / findings:

- Removed the counter matrix's former `window.setInterval(..., 5000)` background tick.
- Counter matrix refresh is now event-driven / user-triggered: initial active render, `DOMContentLoaded`, hash change, visible-board render, evidence update, War Room update and explicit Refresh Evidence action.
- Optimizer, relic suitability, Datacron matrix and historical staging remain user-triggered/on-demand rather than recurring analyzers.
- Release-contract coverage now rejects recurring `setInterval` polling in these intelligence surfaces.
- Existing MutationObservers used by the canonical faction picker and export insertion are idempotent: installed controls are marked/presence-checked before additional DOM mutation.
- No infinite render/polling loop was identified in the GAC Intelligence diff during this source audit.

This closes the source-level startup/render-loop gate. Authenticated browser smoke is still required before production approval.

## Responsive density review — IMPLEMENTATION COMPLETE / BROWSER ACCEPTANCE PENDING

Source-level responsive coverage exists for:

- counter matrix horizontal table behavior and narrow-screen filters/details;
- whole-board optimizer summaries and controls;
- numbered Battle Execution Queue / officer blockers at desktop, tablet, 650px and 420px breakpoints;
- Datacron matrix single-column/narrow-screen layout.

A real authenticated desktop/mobile browser pass is still required before declaring visual acceptance complete.

## Datacron warehouse migration review — COMPLETE IN BRANCH / NOT DEPLOYED

Connected production Supabase was previously confirmed to contain 43 archived GAC battle rows and 37 aggregate counter observations, while existing battle metadata contained no Datacron-specific evidence. The Datacron warehouse will therefore begin empty when first deployed unless additional compatible evidence is introduced before then.

Migration hardening includes:

- JSON array checks for enemy/counter squads;
- JSON object checks for assigned Datacrons and metadata;
- explicit service-role `SELECT, INSERT, UPDATE` for upsert + relic enrichment;
- explicit `DELETE` / `TRUNCATE` revocation;
- explicit identity-sequence privileges;
- RLS enabled with no direct anon/authenticated access.

The migration `supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql` remains **NOT applied to production**. Apply it only through the normal production migration path when the GAC batch is explicitly approved.

## Datacron evidence maturity UX — COMPLETE IN BRANCH

The Datacron Matrix automatically labels warehouse maturity from verified Datacron battle sample totals:

- `WAREHOUSE NOT READY` when storage is unavailable;
- `EXPERIMENTAL · NO VERIFIED DC SAMPLES` at zero;
- `EXPERIMENTAL · LOW SAMPLE` below 25 verified battles;
- `GROWING EVIDENCE` from 25–99;
- `VERIFIED EVIDENCE` at 100+.

Per-matchup sample counts remain visible regardless of maturity label.

## Regression / release contracts

Branch coverage now includes contracts for:

- current-board matrix generation and exact-defense preference;
- risk-aware ranking and whole-board non-overlap allocation;
- projected-banner boundaries;
- Battle Execution Queue ordering, blockers and cleanup behavior;
- canonical server-plan queue locking and responsive queue CSS wiring;
- runtime-module/bootstrap existence;
- no recurring `setInterval` polling across the intelligence surfaces;
- historical scouting truth boundaries;
- Datacron signature NONE vs UNKNOWN behavior;
- Datacron service/schema/maturity behavior;
- relic evidence enrichment and roster-fit labeling;
- client-only intelligence exports.

**No executable full-suite pass is claimed for the latest head yet.** The repository's Node workflow is manual-only (`workflow_dispatch` -> Node 22 -> `npm ci` -> `npm test`), and no workflow run exists for the current GAC head at this checkpoint.

## Remaining production approval gates

1. **Run the complete executable Node regression/syntax suite** against the latest GAC head and resolve any failure.
2. **Authenticated populated-board smoke:** verified owner roster + manually entered visible opponent defenses; exercise matrix, variant drilldown, plan lock, optimizer queue and reallocation.
3. **Desktop/mobile visual acceptance:** verify current-board matrix, Battle Execution Queue, blockers, optimizer summaries and Datacron matrix interaction/density in a real browser.
4. **Migration gate:** when explicitly approved, apply the hardened additive Datacron evidence migration through the normal production migration path and recheck the resulting schema/security state.
5. **Final ownership/collision check:** compare the latest GAC diff against all still-active TB/ROTE/Guild work immediately before merge.
6. **Single production merge/deploy:** take PR #318 out of draft and merge only after gates 1–5 are accepted, minimizing Railway rebuild/deploy churn.

## Truth boundaries

- Historical scouting never claims to know the opponent's hidden/current board.
- A counter matrix cell is historical evidence, not a guaranteed win probability for the user's exact battle.
- The 90% evidence floor is a lower confidence bound on historical observations, not a prediction.
- Sample thresholds and maturity labels remain visible.
- Exact entered defense variants are preferred over leader-only aggregates.
- Counter availability is constrained by the current roster and known round reservations/consumption, with server-side attack-plan validation remaining authoritative.
- Datacron-specific evidence is only shown when defender Datacron state is confirmed assigned or confirmed none; unknown is not coerced to none.
- Projected banners are an evidence summary, not a guaranteed round score.
- Battle Execution Queue ordering is a deterministic planning aid from known server-plan state + historical evidence descriptors; it is not a guarantee that an attack will win.
