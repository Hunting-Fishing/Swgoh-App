# SWGOH Command Center — TB Officer Assignment Parity

Updated: 2026-08-22 (GMT+8)
Branch: `feature/tb-officer-assignment-parity-20260822`

## Problem closed by this branch

The website Operations parity planner already supports officer-owned ROTE plan controls including:

- phase layout;
- requirement overrides;
- ignored missions;
- ignored platoons;
- ignored slots;
- grouping rules;
- preassignments / hard locks;
- member availability;
- GIVE / KEEP donation preferences;
- hard reservations;
- mission-safety protections.

Before this branch, the Stage 9 immutable Discord preview rejected any persisted plan using the first seven web-plan controls with `TB_ASSIGNMENT_PLAN_CUSTOMIZATION_UNSUPPORTED`. A sophisticated plan could therefore exist on the website but could not continue through immutable officer approval and Stage 10 Discord delivery.

## Implemented in branch

Stage 9 now keeps Stage 8 as the authoritative live hydration path for:

- current Guild roster;
- current Operation requirements;
- mission-safety protections;
- source freshness / Guild binding context.

It then reruns the shared `planGuildTbOperationsParity()` engine using the exact persisted website plan configuration and normalized durable controls.

### Persisted web-plan parity

The immutable preview now materializes:

- `phase_layout`;
- `requirement_overrides`;
- `ignored_missions`;
- `ignored_platoons`;
- `ignored_slots`;
- enabled `guild_tb_grouping_rules` with `when_spec` / `then_spec`;
- `guild_tb_plan_preassignments`.

### Shared control normalization

The Stage 9 snapshot also normalizes:

- Discord member preferences;
- canonical `guild_unit_donation_preferences`;
- Discord unavailable-member state;
- canonical `guild_member_operation_controls`;
- Discord hard reservations;
- database player UUIDs to SWGOH player/Ally Code identity.

Canonical database donation preferences replace duplicate Discord-state preference keys. Hard reservations require the stored Discord user link to resolve to the same SWGOH member identity before they are honored.

### Fail-closed behavior retained

Immutable preview creation is rejected when:

- the source plan is missing or archived;
- durable planning controls mutate while live source hydration is running;
- the shared parity planner reports unresolved requirement overrides.

No publish or Discord send occurs during preview creation.

## Immutable fingerprint

The new `stage9-web-discord-parity-v2` fingerprint binds:

- Guild roster snapshot;
- Operation requirements;
- mission-safety protections;
- durable planning-control snapshot;
- normalized effective planning controls;
- persisted source-plan controls;
- grouping rules;
- preassignments;
- final parity output.

Any material change therefore produces a different immutable artifact fingerprint/version.

## Downstream safety audit

No Stage 9 parity change weakens the existing approval/delivery gates.

`tb-assignment-version-service.mjs` hashes assignments, unfilled rows and diagnostics generically, independent of planner origin.

`tb-assignment-publishability-service.mjs` still requires:

- deterministic persisted hash verification;
- exact officer approval;
- approved hash equal to current immutable plan hash;
- non-cancelled / non-superseded artifact;
- current authoritative source plan;
- latest immutable version for the exact plan + phase.

`tb-stage10-discord-delivery-service.mjs` still consumes only a publishability-approved immutable artifact, requires a verified Discord destination, uses explicit hash confirmation, and preserves idempotent delivery receipts. Stage 10 does not call the parity planner directly.

## Regression coverage added/updated

- Stage 9 custom web-plan controls now assert pass-through rather than rejection.
- database/Discord identity and preference normalization.
- control-mutation fail-closed behavior.
- unresolved requirement fail-closed behavior.
- fingerprint changes for live Operations requirements, saved plan controls, rules and preassignments.
- source contract preventing return of the old unsupported-customization gate.
- cross-layer source contract from parity materialization through immutable approval/publishability/Stage 10 delivery.

The existing shared parity-planner tests on `main` already cover phase/ignore scoping, requirement overrides, unresolved clears, preassignment locks and grouping-rule constraint passes.

## Validation state

The branch is based on current `main` and is isolated from active ROTE #316 and GAC #318 changed-file sets.

Executable `npm test` has **not** been claimed. The current execution environment cannot resolve `github.com` for a local clone, so test execution remains a release gate.

## Production gate

Do not merge/deploy until:

1. manual `npm test` passes against the complete branch;
2. a persisted plan containing every supported customization produces the expected immutable preview;
3. preassignment / rule / ignore / override behavior is compared against the website preview for parity;
4. exact-hash officer approval succeeds for the generated custom artifact;
5. publishability rejects a tampered, stale, superseded or unapproved custom artifact;
6. Stage 10 preview renders the exact approved custom artifact to a verified staging/test destination without duplicate sends;
7. active branch ownership is rechecked immediately before merge.
