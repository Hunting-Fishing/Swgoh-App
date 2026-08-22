# GAC Intelligence Refresh Status

Updated: 2026-08-23 (GMT+8)
Development branch: `feature/gac-intelligence-refresh-20260822`
Draft PR: #318
Supersedes: #306
Original refresh bridge: #317
Current-main sync bridge: #322

## Completion

- Feature / implementation completion: **100% code-side**
- Production release readiness: **~94%**
- Targeted GAC validation: **91 / 91 passing**
- Failures: **0**
- Skipped: **0**
- Production deployment: **NOT performed**
- Datacron warehouse migration: **NOT applied to production**

The GAC War Room feature build is complete on this branch. Remaining work is production acceptance: repository-wide test execution when a normal runner is available, authenticated browser smoke, visual acceptance, migration, final collision check and one controlled merge/deploy.

## Validation boundary

The repository Node workflow is manual-only (`workflow_dispatch` -> Node 22 -> `npm ci` -> `npm test`). The connected GitHub controls in this session cannot dispatch a new run, and the local environment cannot resolve GitHub for a normal clone.

To avoid a false test claim, the GAC modules/tests needed for the intelligence slice were reconstructed from the connected GitHub branch into a Node 22 validation workspace. Functional modules were executed directly; branch source/dependency-isolated fixtures were used for source-contract boundaries where required.

Latest consolidated targeted result:

- **91 tests/checks**
- **91 passed**
- **0 failed**
- **0 skipped**

This is a real targeted GAC executable result. It is **not represented as a complete repository-wide `npm test` run**.

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
- exact-slot test now requires `exactSlot: true`;
- zone fallback requires `exactSlot: false`.

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
- No infinite GAC Intelligence render/polling loop identified.

## Datacron migration — HARDENED / NOT DEPLOYED

`supabase/migrations/20260822070000_gac_datacron_battle_evidence.sql`

Includes:
- squad JSON array checks;
- Datacron / metadata JSON object checks;
- ASSIGNED / NONE / UNKNOWN state checks;
- unique idempotent battle key;
- enemy / defender signature / counter / attacker signature / exact-matchup indexes;
- RLS enabled;
- anon/authenticated direct access revoked;
- service role SELECT / INSERT / UPDATE only;
- service role DELETE / TRUNCATE revoked;
- identity sequence usage/select privileges.

Migration remains **NOT applied to production**.

## Remaining production gates

1. Run complete repository `npm test` through the normal workflow/repository-capable runner when available. The targeted GAC slice is 91/91 green; a full-repository pass is not falsely claimed.
2. Authenticated populated-board smoke: real verified owner roster + manually entered visible opponent defenses -> matrix -> exact variant -> plan lock -> optimizer queue -> remaining-roster reallocation.
3. Real desktop/mobile visual acceptance for matrix, execution queue, blockers, optimizer and Datacron matrix.
4. Apply the additive Datacron migration through the normal production migration path only when release is accepted, then recheck schema/security state.
5. Recheck latest GAC diff against current `main` and every active TB/ROTE/Guild/styling branch immediately before merge.
6. Take #318 out of draft and perform one production merge/deploy only after gates 1-5 are accepted.

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
