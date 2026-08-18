# SWGOH Command Center — Stage 8 Discord ROTE Acceptance

Updated: 2026-08-19 (GMT+8)

This document is the durable acceptance record for the private Ludus Venatus Discord pilot. It records what was actually exercised live, what was discovered, what was fixed in code, and what remains deferred. It must not be used to claim unexercised live behavior as accepted.

## Pilot safety mode

- Discord interactions are signed and guild-scoped.
- Responses remain ephemeral/read-only during this acceptance block.
- Public assignment publishing is disabled.
- Member DMs are disabled.
- Test member state is returned to clean defaults after each mutation test.

## Stage 7 member controls — live evidence carried forward

Accepted live:

- `/tb availability` own-status read.
- `UNAVAILABLE` write with bound-Guild membership verification.
- `AVAILABLE` cleanup.
- `/tb preference` GIVE / KEEP / DEFAULT lifecycle on Warm Bacon's Jedi Knight Revan.
- `/tb preferences` persistence checks.
- `/tb controls member:@Warm Bacon`.
- `/tb controls` all-linked-member officer view.
- Cleanup ended with Warm Bacon AVAILABLE, GIVE 0, KEEP 0.

Deferred, not failed:

- Cross-member normal-user denial cannot be exercised live yet because this private pilot currently has no second linked normal-member tester. Code-level authorization regression exists, but that does not count as signed live acceptance.

## Stage 8 live ROTE results

### P1 healthy-path evidence

`/tb phase phase:P1`

- Hydrated: 50/50.
- Mission exact coverage: 100%.
- Zero-owner missions: 0.
- Single-owner missions: 0.
- Two-owner redundancy: 100%.
- Operations: 270/270.
- Unfilled: 0.
- Risky donors: 0.
- Phase protected units: 287.
- Farm priorities: 0.

`/tb assignments phase:P1`

- Assigned: 270/270.
- Unfilled: 0.
- HELP/risk: 0.
- Live defect discovered: Discord displayed all-phase protection totals (`956`, critical `6`) instead of P1 totals. Tracked as #135.

`/tb farms phase:P1`

- No mission-impact farm targets, consistent with 100% exact/redundant coverage.

### Hard-reserve enforcement — accepted live

Target: Warm Bacon / Jedi Knight Revan / P1.

1. `/tb reserve` set HARD RESERVED.
2. `/tb reserves` confirmed one durable reservation.
3. Before reserve, P1 draft assigned Jedi Knight Revan to Warm Bacon.
4. After reserve, P1 draft reassigned Jedi Knight Revan to Czonka while remaining 270/270.
5. `/tb reserve` CLEAR removed the reservation.
6. `/tb reserves` confirmed zero active reservations.

Conclusion: hard reservations are durable, consumed by the planner as absolute donor exclusions, and reversible without publishing or DM delivery.

### Availability enforcement — accepted live

1. Baseline AVAILABLE; P1 draft showed `Unavailable: 0` and assigned Jedi Knight Revan to Warm Bacon.
2. Warm Bacon set UNAVAILABLE.
3. P1 draft showed `Unavailable: 1`, remained 270/270, and moved Jedi Knight Revan to zentropy.
4. Warm Bacon restored AVAILABLE.
5. P1 draft returned to `Unavailable: 0` and Jedi Knight Revan returned to Warm Bacon.

Conclusion: availability state is durably consumed by the planner and cleanup restores normal candidacy.

### P6 stressed-path evidence

`/tb phase phase:P6`

- Hydrated: 50/50.
- Exact mission coverage: 66.7%.
- Zero-owner missions: 5.
- Two-owner redundancy: 66.7%.
- Operations: 112/270.
- Unfilled: 158.
- Risky donors: 3.
- Phase protected units: 99.
- Farm priorities: 43.
- Critical mission-entry and Operation-shortage alerts were surfaced.
- Officer burden identified Fahey, Aaron and The Revanchist with one risky assignment each.

`/tb assignments phase:P6`

- Assigned: 112/270.
- Unfilled: 158.
- HELP/risk: 3.
- First 12 preview rows did not expose the three risky rows even though aggregate detection was correct. Tracked as #139.
- Protection display again leaked all-phase `956 / critical 6` instead of P6 phase totals.

`/tb farms phase:P6`

- 43 total targets (10 displayed + 33 more).
- Actionable unit/relic deltas included Cassian Andor, K-2SO, Baze Malbus, Darth Vader and Doctor Aphra.
- Farm count matched the P6 phase board.

### P5 stressed-path evidence

`/tb phase phase:P5`

- Hydrated: 50/50.
- Exact mission coverage: 78.6%.
- Zero-owner missions: 3.
- Two-owner redundancy: 78.6%.
- Operations: 112/270.
- Unfilled: 158.
- Risky donors: 1.
- Phase protected units: 35.
- Farm priorities: 27.
- Partial-evidence missions: 0.
- Fahey was the one high-burden member marked risky.

P5 did not provide a live fleet partial-evidence case, so fleet fail-closed semantics cannot be claimed from Discord live evidence alone.

## Defects discovered during live acceptance

### #135 — phase-scoped assignments leaked all-phase protection totals

Observed:

- P1 phase board: 287 protected units; assignments showed 956.
- P6 phase board: 99 protected units; assignments showed 956.

Cause: Discord assignment formatting consumed `safety.summary` all-phase totals after filtering assignment rows by phase.

Feature-branch fix:

- Added `shapeDiscordPlanningSnapshot()`.
- A phase-scoped Discord plan now receives phase-scoped `safety.protections` and recomputed `protectedUnits` / `criticalProtections` counters.
- Underlying planner decisions are not changed.

### #139 — HELP/risky assignments were buried below SAFE preview rows

Observed:

- P6 correctly detected `HELP/risk: 3`.
- The first 12 Discord preview rows were SAFE, hiding the three risky donor decisions in the remaining 100 rows.

Feature-branch fix:

- Discord plan shaping now prioritizes risky/HELP/non-SAFE assignments before ordinary SAFE rows for the requested phase.
- Existing Discord assignment labels already append non-SAFE status, so this makes the detected HELP rows immediately visible without changing assignment decisions.

## Automated regression work added on `fix/stage8-discord-rote-acceptance`

New coverage verifies:

1. Phase-scoped Discord protection totals do not leak other phases.
2. Risky HELP rows sort before SAFE rows in the requested phase.
3. Equal-safety Operation donor selection uses real, non-zero Galactic Power as the final tie-break and selects the higher-GP candidate.
4. A generic verified fleet gate without authoritative selectable-ship identity remains `gate-only`; even a roster that clears generic ship thresholds is never marked `exactReady`.

## Remaining gates

- CI must pass for the feature branch/PR.
- After deployment, rerun `/tb assignments phase:P6` and confirm:
  - phase-scoped protection total is 99 rather than 956;
  - the three risky/HELP assignments appear at the top of the preview with non-SAFE status.
- Keep public publishing and DMs disabled.
- Live cross-member Stage 7 denial remains deferred until a second normal linked tester exists.
- A live fleet partial-evidence case is optional if one naturally appears; automated fail-closed regression is the acceptance safeguard until then.

## Clean pilot state at end of current live tests

- Warm Bacon: AVAILABLE.
- GIVE/KEEP overrides: 0.
- P1 hard reserves for Warm Bacon: 0.
- No test assignments were published.
- No test DMs were sent.
