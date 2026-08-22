# GAC Intelligence Batch Status

Development branch: `feature/gac-complete-faction-filter`

This batch remains a GitHub-only development checkpoint until explicitly approved for one production merge/deploy.

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

## Still required before production approval

1. Run the local Node regression suite / syntax validation against this branch.
2. Review the draft PR diff for accidental GAC startup/render-loop regressions.
3. Confirm the Supabase migration is safe and additive before applying it.
4. Visual review of matrix density at desktop widths and mobile fallback.
5. Decide whether to expose the Datacron matrix immediately when the warehouse is empty or keep it behind an `experimental` label until enough verified samples accumulate.
6. Production merge should be a single batch to minimize Railway rebuild/deploy cost.

## Truth boundaries

- Historical scouting never claims to know the opponent's hidden/current board.
- A counter matrix cell is historical evidence, not a guaranteed win probability for the user's exact battle.
- Sample thresholds are visible and configurable.
- Exact entered defense variants are preferred over leader-only aggregates.
- Counter availability is constrained by current roster and known round reservations/consumption, with server-side attack-plan validation remaining authoritative.
- Datacron-specific evidence is only shown when defender Datacron state is confirmed assigned or confirmed none; unknown is not coerced to none.
- Projected banners are an evidence summary, not a guaranteed round score.
