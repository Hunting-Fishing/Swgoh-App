# SWGOH Command Center — Stage 9 Implementation Checkpoint

Updated: 2026-08-19 (GMT+8)

## Status

Stage 9 immutable ROTE assignment-plan safety is implemented in application code and live Supabase persistence. Public assignment publishing and member DMs remain disabled. Stage 10 is still the delivery gate.

## Implemented safety chain

1. Stage 8 live mission-safe planner remains the authoritative Discord planning engine.
2. `/tb plan-preview phase:P1..P6` captures one requested phase from that exact planner into a new immutable version.
3. Planner capture is bracketed by durable-control snapshots. If Discord member preferences/availability/links, hard reservations, or canonical Guild Operations controls change while the planner is running, no immutable version is persisted.
4. The Stage 9 input fingerprint is SHA-256 over planner-relevant source fingerprints including the live Guild snapshot, actual Operation requirements, mission protections and durable planning controls.
5. The immutable artifact receives a deterministic SHA-256 plan hash over Guild, plan, phase, version, input fingerprint, assignments, unfilled slots and approval-participating diagnostics.
6. Creating a newer version for the same plan/phase atomically supersedes the older version.
7. `/tb plan-status [phase]` lists only Stage 9 immutable versions and verifies each persisted hash.
8. `/tb plan-diff phase:<phase> from:<version/id> to:<version/id>` compares verified versions from the same plan/phase and reports donor swaps, assignment adds/removals, newly filled/unfilled slots and HELP delta.
9. `/tb plan-approve phase:<phase> version:<version/id> hash:<12+ hex>` requires a matching hash confirmation, then binds approval to the full verified 64-character hash.
10. `/tb plan-cancel phase:<phase> version:<version/id> [reason]` changes only lifecycle metadata. The immutable payload and hash remain unchanged.
11. `assertPublishable()` fails closed for missing approval, approval-hash mismatch, payload-hash mismatch, cancellation, supersede, wrong Guild/current plan/phase, archived source plan, or a newer authoritative version.
12. Failed publishability assertions are durably audited. Audit failure itself fails closed.

## Authorization

Stage 9 Discord commands require both:

- the existing Discord Guild officer authorization gate (Manage Guild/Administrator/configured officer role), and
- a Discord OAuth identity linked through `user_social_identities` to a real Command Center user UUID with an active `owner` or `officer` membership in the same bound SWGOH Guild.

A Discord snowflake is never stored in UUID approval/cancellation actor columns.

## Discord routing isolation

The pre-Stage-9 router is preserved byte-for-byte as `discord-interaction-router-core.mjs`.

The public `discord-interaction-router.mjs` wrapper intercepts only:

```text
/tb plan-preview
/tb plan-status
/tb plan-diff
/tb plan-approve
/tb plan-cancel
```

Every other existing interaction is replayed into the preserved core router.

The base `/tb` schema currently has 19 subcommands. Stage 9 adds 5 for 24/25 Discord subcommand slots.

Startup registration runs the existing base registrar first, then `scripts/patch-discord-stage9-plan-commands.mjs`. The Stage 9 patch is idempotent, retries transient Discord failures, soft-fails startup, and verifies that all five Stage 9 subcommands are present in Discord's returned schema.

## Live Supabase verification

Project: `SWGOH Command Center`

Verified live on 2026-08-19:

- project status `ACTIVE_HEALTHY`
- Stage 9 columns exist on `guild_tb_assignment_runs`
- `guild_tb_assignment_decisions` exists
- create/approve/cancel assignment-version RPCs exist
- assignment payload immutability triggers are active
- approval/cancellation lifecycle fields are not part of the immutable payload guard
- assignment decision history is append-only at the database boundary
- UPDATE/DELETE/TRUNCATE are rejected for assignment decision history
- `service_role` has no UPDATE/DELETE/TRUNCATE privilege on assignment decision history
- anon/authenticated have no direct table access to Stage 9 operations tables

## Pilot prerequisites

Live pilot Guild: **Ludus Venatus**

Verified:

- Discord-linked Command Center officer identity exists and is active for Ludus Venatus.
- A persisted ROTE plan now exists:
  - `Ludus Venatus ROTE Operations Plan`
  - status `draft`
  - preview-only delivery metadata
  - delivery locked
  - no public publishing or member DM permission
  - creation audit written

## Pilot acceptance sequence

After the Railway deployment containing this checkpoint is online:

```text
/tb plan-preview phase:P6
```

Expected:

- creates immutable P6 version
- prints version number
- prints 64-character payload hash
- prints input fingerprint
- prints assigned/unfilled/HELP totals
- deterministic verification PASS
- controls stable YES
- status AWAITING OFFICER APPROVAL
- no public assignment message
- no member DM

Then:

```text
/tb plan-status phase:P6
```

Confirm the same version/hash and counts.

Approve using the 12-character confirmation shown by preview/status:

```text
/tb plan-approve phase:P6 version:<version> hash:<first-12-hash-chars>
```

Then create a second preview after a reversible planning-input change and verify:

```text
/tb plan-preview phase:P6
/tb plan-diff phase:P6 from:<old-version> to:<new-version>
/tb plan-status phase:P6
```

Required result:

- old version becomes SUPERSEDED
- old approval does not authorize new version
- diff reports the actual assignment delta
- new version requires its own approval

Cancellation verification:

```text
/tb plan-cancel phase:P6 version:<test-version> reason:Stage 9 pilot cancellation test
/tb plan-status phase:P6
```

Required result:

- version shows CANCELLED
- persisted payload hash still verifies
- version is non-publishable

## Stage 10 boundary

Do not enable public Discord assignment publishing, webhook delivery, or member DMs until Stage 9 pilot acceptance is complete and Stage 10 explicitly integrates delivery through `assertPublishable()`.
