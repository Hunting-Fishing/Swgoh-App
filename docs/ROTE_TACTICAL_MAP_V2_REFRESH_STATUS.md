# SWGOH Command Center — ROTE Tactical Map v2 Refresh Status

Updated: 2026-08-22 (GMT+8)
Branch: `feature/rote-tactical-map-v2-refresh-20260822`
Draft PR: #316
Supersedes: #184 / `feature/rote-tactical-map-v2`

## Refresh result

The preserved ROTE Tactical Map v2 implementation has been reconciled onto the current production baseline instead of merging the old 500+ commit-behind branch directly into `main`.

- Refresh base: `main` at `9ba43d7394e18673c9c5b98a22c6ac5045f3baa0`
- Reconciled ROTE merge tree: `23a4893f6d1178678a217d85074057ed39e2121e`
- Original PR #184 closed as superseded; branch history remains preserved
- Current GAC Intelligence work continues independently on draft PR #318
- ROTE #316 and GAC #318 have zero shared changed filenames at the latest ownership check
- No ROTE/TB refresh changes from this branch have been merged or deployed to production

## Completed since the original checkpoint

### N1 — synchronize to current `main` — COMPLETE

The ROTE work now sits on top of the current production baseline. New production TB-readiness, onboarding, TW and router fixes remain in the refreshed branch ancestry.

### N2 — activate Tactical Map v2 prototype — COMPLETE

`public/guild-tw-router.js`, already loaded as a global Guild/TB module from the main application entrypoint, now imports:

`./rote-tactical-map-integration.js`

The integration module automatically:

- observes active `.rote-planet-zoom[data-rote-zoom-planet]` overlays;
- builds tactical planet models from the existing canonical mission/map data;
- hydrates the existing mission-node buttons instead of replacing map geometry;
- loads Tactical Map v2 node/readiness styles only when needed;
- re-hydrates after workspace changes and roster submissions.

### N3 — selected-mission readiness inspector activation — COMPLETE

The same integration module wires `hydrateSelectedMissionReadiness()` into the selected mission inspector and keeps official entry legality separate from tactical readiness.

A regression contract `test/rote-tactical-map-loader.test.mjs` verifies that the global Guild/TB entrypoint continues to activate the Tactical Map v2 integration and that browser auto-install/readiness wiring remains present.

### N4 — Guild readiness matrix per visible mission — COMPLETE IN BRANCH

The tactical Guild matrix now exposes mission-level readiness intelligence instead of only cell-level status:

- cumulative official entry-ready members;
- cumulative minimum-ready members, including safer-ready members;
- safer-target-ready members;
- blocked members;
- unknown-evidence members;
- active-event outstanding entry-ready members when matching event + mission attempt evidence is loaded.

Important truth boundaries:

- `UNKNOWN EVIDENCE` remains distinct from `BLOCKED`.
- A member can be officially entry-ready while tactical evidence is still unknown.
- Outstanding is calculated only from entry-ready members for the exact active event and mission.
- If active-event attempt evidence is absent, outstanding remains `UNKNOWN / NOT LOADED`; it is never inferred from missing records.
- The browser integration accepts an optional `window.__swgohTbMissionAttemptSnapshot` contract and refresh event `swgoh:tb-mission-attempts-updated`, allowing the durable attempt-history slice to hydrate outstanding counts without creating a second readiness model.

Focused model/UI regression coverage was expanded for cumulative readiness semantics, event scoping, mission scoping, identity matching and unavailable-evidence behavior.

### N5 — durable evidence and migration review — CODE AUDIT COMPLETE / PRODUCTION HARDENING PENDING

Connected production Supabase already contains the earlier mission-attempt and Operation-ledger evidence migrations. The four ROTE evidence tables currently contain zero rows, making this the safest point to harden retention semantics before history accumulates.

Production audit confirmed:

- RLS is enabled on mission attempts, Operation slots, assignments and contributions;
- anon/authenticated direct table access is disabled;
- mission attempts and contribution evidence are service-role insert/read surfaces rather than general client tables;
- immutable-history/update-delete guards are active where expected;
- idempotent attempt/contribution evidence contracts are preserved.

The audit also found five historical `ON DELETE CASCADE` relationships that could silently erase evidence through parent deletion. New additive migration `20260822124500_tb_evidence_delete_hardening.sql` changes those relationships to `ON DELETE RESTRICT` for:

- mission attempt → player;
- mission attempt → event/guild;
- Operation slot → event/guild;
- Operation assignment → slot/unit context;
- Operation contribution → slot/event/guild/phase context.

A focused schema regression contract verifies that these historical evidence relationships cannot cascade-delete. The hardening migration has **not** been applied to production from this branch.

### N6 — active-event observed-results UI — COMPLETE IN BRANCH

The selected Tactical Mission inspector now renders recorded result evidence for the exact active event and selected mission.

The new observed-results surface shows:

- recorded and countable attempt totals;
- complete / partial / failed / skipped / unknown distributions;
- observed completion rate only when the configured minimum sample is met;
- `RAW ATTEMPTS ONLY`, `LOW SAMPLE — OBSERVED RATE`, or `OBSERVED RATE` evidence labels;
- signed-in player's recorded attempts where identity evidence is available;
- top recorded squad signatures with attempt counts and sample labels.

Evidence rules:

- skipped and technical/unknown interruptions are excluded from countable completion-rate evidence;
- a missing active-event attempt snapshot renders `UNKNOWN / ACTIVE EVENT EVIDENCE NOT LOADED`, never zero attempts;
- old events and other missions are excluded from the selected mission panel;
- tactical hydration signatures include attempt-snapshot identity so newly recorded evidence can refresh the inspector;
- `swgoh:tb-mission-attempts-updated` triggers re-hydration;
- the observed completion rate is explicitly descriptive Guild evidence and is never labeled as a predicted win probability.

New responsive Star Wars-styled presentation, model tests, loader contracts and inspector integration regression contracts are included in the branch.

## Existing preserved capabilities

The refreshed branch retains the implementation from the original ROTE workstream:

- Readiness Contract v2 and policy model
- canonical tactical mission-node model
- tactical asset resolver
- mission-node renderer and styling
- tactical mission intelligence/readiness inspector
- Guild tactical readiness matrix
- mission attempt evidence/history
- active-event observed-results panel
- Operation contribution ledger/API/service/UI
- event bootstrap UI
- additive Supabase migrations for mission attempts and Operation contribution evidence
- focused Node regression/source-contract tests for the above contracts

## Validation state

GitHub has reported PR #316 as cleanly mergeable against `main` during this refresh stream. Mergeability should be rechecked immediately before production approval.

The repository's Node regression workflow is intentionally `workflow_dispatch` only. No automatic CI result should be inferred from the absence of a workflow run. The current execution environment cannot resolve `github.com` for a local clone, so executable Node regression remains a production-gate item rather than being falsely marked complete.

## Next build slice

### N7 — populated-state/canonical-node visual acceptance — NEXT

Verify canonical mission nodes, portraits, readiness and observed evidence in a real authenticated loaded roster/TB workspace, including at minimum:

- Hondo/Felucia;
- Cere + Cal / JKCK Zeffo requirements;
- Grand Inquisitor / Reva-shard context;
- Jabba mission context;
- an active-event mission with recorded attempt evidence;
- an active-event mission with no recorded evidence;
- desktop and mobile/readability behavior without removing existing information.

N7 should also confirm that Guild Matrix mission counts, selected-member drilldowns and selected mission observed-results panels refresh from the same attempt snapshot without stale or contradictory state.

## Production gate

Do not merge #316 to `main` until:

1. manual `npm test` / relevant focused tests have executed successfully;
2. the new evidence-retention hardening migration is approved/applied through the normal production migration path and constraints are rechecked;
3. authenticated TB/ROTE populated-state visual smoke passes N7;
4. no active parallel branch has introduced a new ownership collision;
5. evidence boundaries remain explicit: GAME DATA, COMMUNITY REFERENCE, GUILD EVIDENCE and PLAYER EVIDENCE;
6. one final production merge/deploy is explicitly approved.
