# SWGOH Command Center — Stage 9 Immutable Assignment-Plan Safety

Updated: 2026-08-19 (GMT+8)

## Objective

Stage 9 creates an immutable, officer-approvable ROTE assignment artifact that Stage 10 delivery can consume without ever publishing a changed or stale draft under an earlier approval.

Public Discord assignment publishing and member DMs remain disabled throughout Stage 9.

## Existing foundation

The repository already has two partial primitives:

1. `discord-state-store.mjs` can append lightweight `planVersions`, but those records currently contain only a phase, version ID and summary and are not consumed by the production planner/delivery path.
2. Supabase `guild_tb_assignment_runs` already persists the actual assignment and unfilled arrays plus an `input_fingerprint`. This is the correct durable artifact to harden for Stage 9.

The Stage 9 implementation should therefore treat `guild_tb_assignment_runs` as the authoritative immutable assignment version rather than creating a second competing full-plan store in Discord JSON state.

## Required invariants

### Immutable payload

After an assignment version is created, these fields may never change in place:

- Guild identity
- source TB plan identity
- ROTE phase/scope
- version number
- plan hash
- input fingerprint
- assignments
- unfilled slots
- planner diagnostics that participate in the approved artifact

A changed planner result must create a new version.

### Deterministic hash

Every version receives a SHA-256 digest over a stable canonical representation of the publish-relevant payload. The stored hash must be recomputable from the persisted payload.

### Explicit approval

An officer must approve one exact version/hash. Approval cannot be inherited by another version.

### Supersede / stale protection

Creating a newer version for the same plan/phase may supersede the prior version. A superseded, cancelled, hash-mismatched, or unapproved version must fail closed at the future Stage 10 publish gate.

### Auditability

Preview creation, approval, cancellation, supersede and any failed publishability assertion must be officer-readable and durably audited.

### Version deltas

Officers must be able to compare two assignment versions and see at minimum:

- added assignments
- removed assignments
- changed donor assignments for the same Operation slot
- newly filled slots
- newly unfilled slots
- change in HELP/risk count

## Persistence implementation

The authoritative Stage 9 artifact is `guild_tb_assignment_runs`, hardened with:

- `rote_phase`
- `version_number`
- `plan_hash`
- `supersedes_run_id`
- `superseded_by_run_id`
- approval/cancellation metadata

`guild_tb_assignment_decisions` provides append-only lifecycle history. Database triggers reject in-place mutation of immutable assignment payload fields and mutation/truncation of decision history.

Production RPCs provide atomic version creation, exact-hash approval and cancellation. Public/client roles cannot invoke those service-role-only RPCs.

## Service surface

Stage 9 provides:

- create immutable TB assignment version
- read/list versions
- recompute/verify version hash
- approve exact version/hash
- cancel version
- compare version deltas
- assert a version is publishable

`assert publishable` rejects:

- missing approval
- approval hash mismatch
- stored payload hash mismatch
- cancelled version
- superseded version
- wrong Guild
- stale/current-plan mismatch where a newer authoritative version supersedes it

## Discord acceptance surface

Officer-only commands are designed around:

```text
/tb plan-preview phase:P1..P6
/tb plan-status [phase:P1..P6]
/tb plan-approve phase:P1..P6 version:<version> hash:<hash confirmation>
/tb plan-cancel phase:P1..P6 version:<version> [reason]
/tb plan-diff phase:P1..P6 from:<version> to:<version>
```

There is deliberately no Stage 9 publish command.

## Persisted-plan parity guard

An immutable Discord preview must never reference a persisted web ROTE plan while silently ignoring that plan's configuration.

Until the Discord preview path materializes the same web-plan configuration, preview creation fails closed when the active persisted plan contains any of:

- non-empty phase layout
- requirement overrides
- ignored missions
- ignored platoons
- ignored slots
- enabled grouping rules
- preassignments

The baseline/default persisted plan with empty customization remains supported by the verified Stage 8 mission-safe planner path. This defect was tracked as #174 and fixed by PR #175.

## Production checkpoint — 2026-08-19

Verified production baseline plan for Ludus Venatus:

```text
Plan ID: 1881ad2f-1394-4209-9409-bb8498e09138
Name: Ludus Venatus ROTE Operations Plan
Status: draft
Phase layout: empty
Requirement overrides: empty
Ignored missions/platoons/slots: 0
Enabled grouping rules: 0
Preassignments: 0
Delivery: preview only; published=false; memberDms=false
```

The baseline plan has a durable Guild Operations audit row and is owned by an active Command Center officer account linked to Warm Bacon.

Production Stage 9 migrations/RPCs are applied. A transaction/rollback database acceptance exercised:

1. create immutable P6 assignment version;
2. reject an attempted in-place assignment payload mutation;
3. approve the exact stored hash;
4. reject attempted mutation of assignment decision history;
5. cancel the immutable version;
6. roll the entire test transaction back.

No test version remained persisted after rollback.

PR #175 GitHub Actions jobs again terminated before executing any job steps (`steps: null`). This is recorded as CI infrastructure failure, not as a test pass or code-test failure.

## Remaining signed live acceptance

1. Run `/tb plan-preview phase:P6` after the current Stage 9 deployment/schema patch reaches the pilot Discord server.
2. Verify immutable version number/hash and approximately the previously accepted P6 assignment/unfilled/HELP totals if the roster has not changed.
3. Run `/tb plan-status phase:P6` and verify the unapproved immutable version is visible.
4. Approve the exact displayed hash/version.
5. Verify approval state and the fail-closed Stage 10 publishability assertion, while delivery remains disabled.
6. Make one reversible planning-input change, create a newer immutable version, and verify the earlier approval does not transfer.
7. Verify the prior version becomes superseded/non-publishable.
8. Compare the two versions with `/tb plan-diff` and verify donor/fill/HELP deltas.
9. Restore the test control and create a clean final version if needed.
10. Keep public publishing and DMs disabled; Stage 10 remains the delivery gate.
