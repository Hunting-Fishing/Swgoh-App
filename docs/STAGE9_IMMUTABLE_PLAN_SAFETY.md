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

## Planned persistence changes

Harden `guild_tb_assignment_runs` with:

- `rote_phase`
- `version_number`
- `plan_hash`
- `supersedes_run_id`
- `superseded_by_run_id`
- approval/cancellation metadata as appropriate

Add an append-only approval/decision history table so approval history is not overwritten.

Add a database trigger that rejects mutation of immutable assignment payload columns after insert.

## Planned service surface

A Stage 9 service should provide:

- create immutable TB assignment version
- read/list versions
- recompute/verify version hash
- approve exact version/hash
- cancel version
- compare version deltas
- assert a version is publishable

`assert publishable` must reject:

- missing approval
- approval hash mismatch
- stored payload hash mismatch
- cancelled version
- superseded version
- wrong Guild
- stale/current-plan mismatch where a newer authoritative version supersedes it

## Discord acceptance surface

Stage 9 should add officer-only, read/approval commands without enabling delivery. Recommended command shape:

```text
/tb plan-preview phase:P1..P6
/tb plan-status [phase:P1..P6]
/tb plan-approve version:<id> hash:<short confirmation>
/tb plan-cancel version:<id>
/tb plan-diff from:<id> to:<id>
```

Exact command naming may be adjusted to fit Discord schema limits, but approval must always identify an immutable version and hash.

## Acceptance sequence

1. Generate a P6 immutable preview from the current mission-safe planner.
2. Verify version number, SHA-256 hash, assigned/unfilled totals and HELP count.
3. Approve that exact version/hash.
4. Verify approval audit history.
5. Change a planning input in a reversible test (for example a hard reserve or availability exclusion) and generate a new version.
6. Verify the older approval does not authorize the new version.
7. Verify the old version is superseded / non-publishable.
8. Compare the two versions and surface the assignment delta.
9. Restore test state and create/approve a clean final version if needed.
10. Keep public publishing and DMs disabled; Stage 10 remains the delivery gate.
