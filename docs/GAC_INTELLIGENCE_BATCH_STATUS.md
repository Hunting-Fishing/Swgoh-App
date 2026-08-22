# GAC Intelligence Refresh Status

Updated: 2026-08-22 (GMT+8)
Development branch: `feature/gac-intelligence-refresh-20260822`
Draft PR: #318
Supersedes: #306 / `feature/gac-complete-faction-filter`
Refresh bridge: #317

This batch remains a GitHub-only development checkpoint until explicitly approved for one production merge/deploy.

## Refresh result

- Preserved GAC Intelligence work reconciled onto production `main` at `9ba43d7`.
- Refresh bridge #317 merged into the isolated refresh branch only.
- The refreshed branch was 0 commits behind `main` at reconciliation.
- Superseded PR #306 is closed with history preserved.
- No Railway deployment or production merge occurred.
- TB/ROTE PR #316 was not modified by the GAC refresh.

## Implemented in branch

- Full player-facing faction/role taxonomy and searchable multi-column picker.
- Roster-aware counter matrix for entered current-board defenses.
- Exact-defense-first evidence matching with leader aggregate fallback.
- Minimum battle and minimum relic filters.
- Current-roster availability filtering.
- Round-consumed / own-defense / reserved attacker exclusion before recommendations.
- Non-overlapping whole-board counter allocation summary.
- Projected banners shown only when every entered defense has a unique qualifying counter and banner evidence.
- Exact counter variant drilldown with samples, win rate, average banners, confidence, league/season source context.
- Matrix-to-authoritative attack-plan lock path; server remains the final overlap guard.
- Historical opponent scouting UI and defense prediction review flow.
- Historical scouting is explicitly labeled as non-current-board truth.
- Historical squad review can prefill the manual current-board editor but still requires user confirmation/save.
- Datacron evidence normalization by state, set/template/level and normalized affixes without player-specific instance IDs.
- Verified owner battles can archive supplemental attacker/defender Datacron evidence without blocking the primary verified battle record if the supplemental warehouse is unavailable.
- Existing counter batch response carries supplemental Datacron evidence so the browser does not need a separate matrix request.
- Current owned Datacron readiness analysis for non-overlapping evidence counters.
- Datacron evidence matrix matching exact entered defense squad + confirmed defender Datacron signature.
- Datacron matrix marks current counter-roster ownership and equivalent attacker Datacron signature ownership.
- UNKNOWN defender Datacron state remains distinct from confirmed NONE.

## Risk-aware intelligence slice — COMPLETE IN BRANCH

A new pure `gac-evidence-risk-v1` model upgrades counter ranking from raw observed win rate to sample-aware historical evidence quality.

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

Truth boundary: the confidence bound and risk band summarize historical evidence. They are not a predicted probability for the user's exact current battle.

## Datacron warehouse migration review — COMPLETE IN BRANCH / NOT DEPLOYED

Connected production Supabase currently has 43 archived GAC battle rows and 37 aggregate counter observations, but the existing battle metadata has no Datacron-specific evidence. Therefore the Datacron warehouse will begin empty when deployed.

Migration hardening added before deployment:

- JSON array checks for enemy/counter squads;
- JSON object checks for assigned Datacrons and metadata;
- explicit service-role `SELECT, INSERT, UPDATE` for upsert + relic enrichment;
- explicit `DELETE` / `TRUNCATE` revocation;
- explicit identity-sequence privileges;
- RLS remains enabled with no direct anon/authenticated access.

The migration has NOT been applied to production.

## Datacron evidence maturity UX — COMPLETE IN BRANCH

The Datacron Matrix now automatically labels warehouse maturity from verified Datacron battle sample totals:

- `WAREHOUSE NOT READY` when storage is unavailable;
- `EXPERIMENTAL · NO VERIFIED DC SAMPLES` at zero;
- `EXPERIMENTAL · LOW SAMPLE` below 25 verified battles;
- `GROWING EVIDENCE` from 25–99;
- `VERIFIED EVIDENCE` at 100+.

Per-matchup sample counts remain visible regardless of maturity label.

## Still required before production approval

1. Run the local/manual Node regression suite / syntax validation against this refreshed branch.
2. Review the complete draft PR diff for accidental GAC startup/render-loop regressions.
3. Apply the hardened additive Datacron evidence migration only through the normal production migration path when this batch is approved.
4. Desktop/mobile visual review of counter matrix, board optimizer and Datacron matrix density.
5. Authenticated populated-board smoke with a real verified roster and manually entered opponent defenses.
6. One final production merge/deploy should remain a single batch to minimize Railway rebuild/deploy cost.

## Truth boundaries

- Historical scouting never claims to know the opponent's hidden/current board.
- A counter matrix cell is historical evidence, not a guaranteed win probability for the user's exact battle.
- The 90% evidence floor is a lower confidence bound on historical observations, not a prediction.
- Sample thresholds and maturity labels remain visible.
- Exact entered defense variants are preferred over leader-only aggregates.
- Counter availability is constrained by current roster and known round reservations/consumption, with server-side attack-plan validation remaining authoritative.
- Datacron-specific evidence is only shown when defender Datacron state is confirmed assigned or confirmed none; unknown is not coerced to none.
- Projected banners are an evidence summary, not a guaranteed round score.
