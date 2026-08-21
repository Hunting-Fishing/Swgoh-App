# GAC War Room — Final Build Status

## Release state

**Feature implementation: 100% code complete.**

The manual GAC War Room now covers the full round lifecycle using verified-owner/server-backed state:

- League-aware 3v3 / 5v5 board capacities and exact territory slots
- Manual opponent-defense entry for the lineup actually visible in-game
- Persistent current-round attack plans
- Own-defense and previously consumed attacker exclusion
- Whole-board non-overlapping counter allocation
- Attacker Datacron matching and exact lock persistence
- Pre-battle identity / roster / Datacron revalidation
- Begin-attempt transition
- Win/loss and optional banner capture
- Confirmed-survivor loss state
- Survivor-specific cleanup planning and cleanup lock
- Source-gated cleanup Attack Brief
- Territory-aware attack order and front-to-back unlock routing
- Canonical Fleet Territory state in the same route
- Fleet role confirmation, attack lifecycle, result capture, attempt history and cleanup handoff

## Truth boundaries

The release deliberately fails closed where SWGOH does not expose reliable live battle state.

- Unknown post-battle state remains unknown.
- Character cleanup requires confirmed surviving defender identities.
- No Turn Meter / Health / Protection / cooldown values are fabricated by character cleanup.
- Tactical opener / target-order guidance is shown only when an approved exact strategy record exists.
- Fleet historical evidence does not invent starter/reinforcement roles; the user confirms starters before lock.
- Datacrons are not applicable to fleet attacks.
- Attack order is an operational route, not a claimed win probability.

## Source-of-truth hierarchy

1. Verified owner + confirmed current event/opponent/round
2. Canonical current-board and current-fleet-board records
3. Server attack-plan / fleet-attack-plan reservations and attempt history
4. Live owner/opponent roster snapshots
5. Approved historical counter evidence where exact evidence gates pass
6. Roster-fit heuristic only where clearly labeled and never presented as a probability
7. User-confirmed post-battle observations for cleanup

Browser state is not the canonical attack-plan reservation store.

## Final authenticated production smoke

This is the remaining external acceptance procedure; it is not an unfinished feature implementation.

1. Sign in as the verified roster owner.
2. Confirm the active GAC opponent and current round.
3. Select the correct league/format and enter the enemy squads currently visible in-game.
4. Sync the verified board and confirm the saved zone/slot identity.
5. Verify the Tactical Route highlights only currently accessible territories.
6. Lock a recommended counter and confirm its attackers disappear from other allocations.
7. Where eligible, confirm the exact recommended owned Datacron is included in the lock.
8. Open Pre-Battle Checklist and verify the exact defense, enemy Datacron state, attackers and attacker Datacron.
9. Begin an attempt and record a win; confirm the defense clears and the route replans.
10. On another defense, record a loss with confirmed survivors; confirm original-full-defense retry is blocked and cleanup candidates use only those survivors.
11. Lock a cleanup counter and verify the residual B11 Attack Brief plus B08 execution path.
12. Clear Front Top and verify Fleet Territory changes from locked to unlocked.
13. Enter/verify the enemy fleet in canonical Fleet Territory.
14. Lock an evidence-backed fleet after manually confirming exactly three starters.
15. Record fleet attempt/result; on a loss, open Fleet Cleanup Control and verify cleanup requires explicit post-loss observations.
16. Complete remaining territories and verify the route reaches round-complete state.

## CI infrastructure note

At final build time the repository's GitHub Actions jobs were failing before execution. The Node regression job metadata reported **zero executed steps**, matching the same repository-wide failure pattern seen on earlier GAC pull requests. Therefore this document does not claim that GitHub Actions passed.

The release contract records:

- source-contract closure: complete
- GAC feature implementation: 100%
- GitHub Actions execution: blocked before steps
- authenticated production click-through: external final smoke
