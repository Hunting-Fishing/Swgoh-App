# SWGOH Command Center — ROTE Tactical Map v2 Refresh Status

Updated: 2026-08-22 (GMT+8)
Branch: `feature/rote-tactical-map-v2-refresh-20260822`
Draft PR: #316
Supersedes: #184 / `feature/rote-tactical-map-v2`

## Refresh result

The preserved ROTE Tactical Map v2 implementation has been reconciled onto the current production baseline instead of merging the old 500+ commit-behind branch directly into `main`.

- Refresh base: `main` at `9ba43d7394e18673c9c5b98a22c6ac5045f3baa0`
- Reconciled ROTE merge tree: `23a4893f6d1178678a217d85074057ed39e2121e`
- Original ROTE scope preserved: 47 changed files / 8,900 additions
- Original PR #184 closed as superseded; branch history remains preserved
- Active GAC Intelligence PR #306 was not modified
- GAC #306 and ROTE #316 had zero changed-file overlap at the refresh checkpoint

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

## Existing preserved capabilities

The refreshed branch retains the implementation from the original ROTE workstream:

- Readiness Contract v2 and policy model
- canonical tactical mission-node model
- tactical asset resolver
- mission-node renderer and styling
- tactical mission intelligence/readiness inspector
- Guild tactical readiness matrix
- mission attempt evidence/history
- Operation contribution ledger/API/service/UI
- event bootstrap UI
- additive Supabase migrations for mission attempts and Operation contribution evidence
- focused Node regression tests for the above contracts

## Validation state

GitHub reports PR #316 as cleanly mergeable against `main` at the current checkpoint.

The repository's Node regression workflow is intentionally `workflow_dispatch` only. No automatic CI result should be inferred from the absence of a workflow run. The current execution environment cannot resolve `github.com` for a local clone, so executable Node regression remains a production-gate item rather than being falsely marked complete.

## Next build slices

### N5 — durable evidence and migration review — NEXT

Review both additive Supabase migrations against the current production schema before application. Preserve append-only/idempotent mission-attempt and contribution evidence semantics.

Required review:

- uniqueness/idempotency keys;
- account/guild/event ownership boundaries;
- row-level security and officer/member write separation where applicable;
- indexes for event + mission + player aggregation;
- compatibility with current production Supabase tables and naming;
- no destructive alteration of existing Guild/TB evidence.

### N6 — observed-results UI

Expose recorded attempts and result distributions with sample counts and evidence labels. Do not present observed completion as predictive win probability.

### N7 — populated-state/canonical-node visual acceptance

Verify canonical mission nodes and portraits in a real loaded roster/TB workspace, including at minimum Hondo, Cere + Cal/JKCK Zeffo requirements, Grand Inquisitor/Reva-shard context and Jabba. Confirm mobile/readability behavior without removing existing information.

## Production gate

Do not merge #316 to `main` until:

1. manual `npm test` / relevant focused tests have executed successfully;
2. migrations are reviewed as additive against current production;
3. authenticated TB/ROTE populated-state smoke passes;
4. no active parallel branch has introduced a new ownership collision;
5. evidence boundaries remain explicit: GAME DATA, COMMUNITY REFERENCE, GUILD EVIDENCE and PLAYER EVIDENCE.
