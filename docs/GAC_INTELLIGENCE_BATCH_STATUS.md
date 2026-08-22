# GAC Intelligence Refresh Status

Updated: 2026-08-23 (GMT+8)
Development branch: `feature/gac-intelligence-refresh-20260822`
Draft PR: #318
Supersedes: #306 / `feature/gac-complete-faction-filter`
Original refresh bridge: #317
Current-main sync bridge: #322

This branch is the canonical GAC War Room / Intelligence completion path. It remains isolated from production until the final authenticated acceptance, migration and single merge/deploy gate.

## Current completion

- Feature / implementation completion: **100% code-side**
- Production release readiness: **~94%**
- Draft PR #318: **mergeable at the latest checked head**
- Branch baseline: **0 commits behind current `main` at the latest comparison before final collision recheck**
- Targeted reconstructed GAC validation: **90 / 90 passing, 0 failed, 0 skipped**
- Production deployment: **NOT performed**
- Datacron warehouse migration: **NOT applied to production**

The remaining work is release acceptance and controlled production change, not missing GAC War Room capability.

## Validation method and boundary

The repository Node workflow is intentionally manual-only (`workflow_dispatch` -> Node 22 -> `npm ci` -> `npm test`). The connected GitHub controls available in this session can inspect/rerun existing workflow runs but cannot dispatch a new one, and the local execution environment cannot resolve GitHub for a normal clone.

To avoid claiming a test pass that did not occur, the GAC branch modules/tests needed for the current intelligence slice were reconstructed from the connected GitHub branch into a Node 22 validation workspace. Functional modules were executed directly; source-contract checks used the connected branch source/dependency-isolated fixtures where required.

Latest consolidated targeted result:

- **90 tests/checks**
- **90 passed**
- **0 failed**
- **0 skipped**

This is a real executable targeted GAC validation result. It is **not represented as a complete repository-wide `npm test` run**.

## Defects found and fixed during executable validation

### 1. Missing relic delta displayed as synthetic `+0` — FIXED

`formatRelicDelta(null)` previously passed through `Number(null) === 0`, which could render missing relic context as a false neutral `+0`.

Fix:
- added null-aware finite parsing in `public/gac-relic-suitability-model.js`;
- `null`, `undefined` and empty-string relic deltas now remain unknown and render `—`;
- missing historical win rate / average banners / relic delta remain `null` rather than synthetic zeroes;
- regression coverage expanded.

### 2. Unresolved historical roster member could be treated as complete R0 evidence — FIXED

`teamRelicSnapshot()` previously used `Number.isFinite(Number(row.effectiveRelic))`; because `Number(null) === 0`, a missing roster member could incorrectly make a historical relic snapshot look complete.

Fix:
- completeness now requires a non-null effective relic value for every resolved battle member;
- incomplete snapshots cannot generate historical relic delta evidence;
- supplemental metadata remains UNKNOWN/incomplete instead of inventing R0 context.

### 3. Datacron team-signature test contradicted canonical grouping — FIXED

The Datacron service intentionally sorts deduplicated team members so equivalent squad permutations share one evidence key, while leader identity remains a separate dimension. The old test expected input order.

Fix:
- updated the contract to require ordering-insensitive team identity;
- added explicit permutation-equivalence coverage;
- runtime grouping behavior was retained because it is the correct evidence model.

### 4. Scouting UI test omitted exact-slot provenance — FIXED

The scouting model deliberately returns `exactSlot: true/false` so verified exact-slot evidence is distinguishable from zone-only fallback. An older test expected the pre-provenance shape.

Fix:
- exact verified slot targets now explicitly test `exactSlot: true`;
- zone fallback explicitly tests `exactSlot: false`;
- no provenance information was removed from runtime behavior.

## Executed GAC coverage

The targeted Node 22 validation covers the major GAC Intelligence logic and safety boundaries, including:

- evidence-risk / 90% Wilson lower-bound model;
- sample-quality and descriptive failure-risk bands;
- relic burden and historical undersize descriptors;
- roster-aware counter matrix;
- exact-defense-first evidence matching;
- minimum battle / relic gates;
- consumed, own-defense and reserved attacker exclusion;
- non-overlapping whole-board counter allocation;
- projected-banner boundaries;
- risk/scarcity-aware board optimization;
- Battle Execution Queue ordering and blocker classification;
- canonical attack-plan separation;
- Datacron signature normalization;
- ASSIGNED / NONE / UNKNOWN distinction;
- Datacron evidence maturity labels;
- hardened Datacron migration schema/security/index contract;
- Datacron evidence aggregation and canonical team signatures;
- current relic suitability;
- historical relic evidence enrichment;
- historical scouting/staging and slot provenance;
- canonical 48-item player-facing faction/role taxonomy;
- client-only matrix and Battle Execution Queue exports;
- verified-battle API confirmation/auth/origin/round boundaries;
- supplemental relic enrichment fail-soft behavior after primary battle archival.

## Baseline / branch safety

- Preserved GAC Intelligence work was originally reconciled onto production `main` at `9ba43d7` through isolated bridge PR #317.
- Production `main` later advanced through TB/Guild work to `a1a63ac38a4ad91cc80e1e05f38bd8da88d7c5f2`, leaving the GAC refresh branch 37 commits behind.
- Sync-only bridge PR #322 merged the new `main` into the isolated GAC branch; it did **not** merge GAC into production.
- After #322, the GAC branch was 0 commits behind `main` and PR #318 returned to a mergeable state.
- The files imported by #322 were TB/Guild files and had no exact filename overlap with the GAC-specific changed-file set at that checkpoint.
- Superseded PR #306 remains closed with history preserved.
- No Railway deployment was triggered by GAC branch reconciliation or subsequent validation fixes.

## Implemented GAC War Room flow

### Current-board truth

- Manual entry of squads actually visible in-game remains the current-board truth source when hidden live board placement cannot be pulled.
- Full player-facing faction/role taxonomy with searchable picker.
- Current owner roster / current opponent roster context.
- Exact entered defense composition preferred over leader-only aggregate evidence.

### Counter Intelligence Matrix

- Roster-aware counter matrix for entered defenses.
- Exact-defense-first evidence matching with explicit leader fallback.
- Minimum battle and minimum relic controls.
- Current roster ownership / relic availability checks.
- Own-defense, reserved, planned and consumed attacker exclusion.
- Exact variant drilldown with samples, wins, historical win rate, banners, confidence and source context.
- Evidence variant can be locked into the authoritative server Attack Plan.

### Whole-board optimizer and Battle Execution Queue

- Non-overlapping counter allocation across the entered board.
- Risk/scarcity-aware prioritization.
- Projected banners only when complete unique allocation + banner evidence exists.
- Numbered execution queue:
  1. active attempt;
  2. locked server plan;
  3. fresh non-overlap proposal.
- Loss/abandoned states become cleanup-review blockers.
- Unsynced/uncovered rows remain unnumbered officer blockers.
- Locking a proposal recalculates from the remaining roster.
- Queue reasons expose scarcity, exact/fallback evidence, sample risk, undersize evidence and relic burden.
- Responsive execution layout covers desktop/tablet/mobile including 650px and 420px breakpoints.

### Historical scouting

- Historical opponent defense tendencies remain explicitly historical.
- Exact historical slot tendencies carry `exactSlot: true`.
- Zone fallback carries `exactSlot: false` and requires explicit fallback behavior where staging uses it.
- Fleet territory is not staged through squad scouting.
- Review flow can prefill the manual editor but does not silently save a current defense.

### Datacron intelligence

- Datacron evidence normalized by state + set/template/level/affixes, excluding player-specific instance ID.
- `DC:NONE` and `DC:UNKNOWN` stay distinct.
- Equivalent squad member permutations + equivalent Datacron rolls aggregate into the same evidence group.
- Current owned Datacron readiness analysis.
- Exact entered defense + confirmed defender Datacron signature matrix.
- Supplemental verified-battle Datacron evidence warehouse.
- Primary verified battle save remains valid if supplemental Datacron/relic enrichment is unavailable.

### Export / officer utility

- Counter Matrix: COPY TSV / DOWNLOAD CSV.
- Battle plan: COPY PLAN / DOWNLOAD TXT.
- Plan export follows the numbered Battle Execution Queue, not deprecated optimizer priority cards.
- Officer blockers export separately as **NOT ATTACK NUMBERS**.
- Export remains client-only and makes no API write/query.

## Startup / render-loop review — COMPLETE IN CODE

- Removed the Counter Matrix's former 5-second `setInterval` background tick.
- Intelligence refresh is now event-driven / user-triggered.
- Optimizer, relic suitability, Datacron matrix and historical staging remain on-demand.
- Release source contract rejects recurring `setInterval` polling across these intelligence surfaces.
- Existing faction-picker/export MutationObservers are idempotent through installed/presence markers.
- No infinite GAC Intelligence render/polling loop was identified in the source audit.

## Datacron warehouse migration — HARDENED / NOT DEPLOYED

Migration:
`supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql`

Hardening includes:

- enemy/counter squad JSON array checks;
- Datacron/metadata JSON object checks;
- ASSIGNED / NONE / UNKNOWN state checks;
- idempotent unique battle key;
- enemy, defender signature, counter, attacker signature and exact-matchup indexes;
- RLS enabled;
- no direct anon/authenticated access;
- service-role `SELECT, INSERT, UPDATE` only for required evidence operations;
- service-role `DELETE` / `TRUNCATE` revoked;
- explicit identity-sequence usage/select privileges.

The migration remains **NOT applied to production**.

## Datacron evidence maturity UX

- warehouse unavailable -> `WAREHOUSE NOT READY`
- 0 samples -> `EXPERIMENTAL · NO VERIFIED DC SAMPLES`
- <25 samples -> `EXPERIMENTAL · LOW SAMPLE`
- 25-99 samples -> `GROWING EVIDENCE`
- 100+ samples -> `VERIFIED EVIDENCE`

These are evidence-maturity labels, not current-battle win guarantees.

## Remaining production approval gates

1. **Repository-wide executable suite:** run the normal complete `npm test` workflow when a repository-capable runner / workflow dispatch is available. The targeted GAC slice is 90/90 green, but a full-repository pass is not falsely claimed.
2. **Authenticated populated-board smoke:** verified owner roster + manually entered visible opponent defenses; exercise matrix -> exact variant -> plan lock -> optimizer queue -> remaining-roster reallocation.
3. **Desktop/mobile visual acceptance:** verify matrix, execution queue, blockers, optimizer summaries and Datacron matrix in a real authenticated browser.
4. **Migration gate:** apply the hardened additive Datacron evidence migration through the normal production migration path only when production release is accepted, then recheck schema/security state.
5. **Final collision/head check:** compare the latest GAC diff against current `main` and all active TB/ROTE/Guild/styling branches immediately before merge.
6. **Single production merge/deploy:** take #318 out of draft and merge once only after gates 1-5 are accepted, minimizing Railway rebuild/deploy churn.

## Truth boundaries

- Historical scouting never claims current hidden-board truth.
- Historical win rates and Wilson evidence floors are descriptors, not predicted current-battle probabilities.
- Missing relic / banner / win-rate evidence remains unknown rather than synthetic zero.
- Incomplete historical roster snapshots cannot generate relic delta evidence.
- Exact entered defense variants are preferred over leader aggregates.
- Current roster reservations/consumption constrain availability, with server-side Attack Plan validation authoritative.
- `DC:UNKNOWN` is never coerced to `DC:NONE`.
- Projected banners are historical allocation evidence, not a guaranteed round score.
- Battle Execution Queue order is a deterministic planning aid, not a guarantee that an attack will win.
