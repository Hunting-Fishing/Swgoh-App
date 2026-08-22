# SWGOH Command Center — TB Officer Assignment Parity

Updated: 2026-08-22 (GMT+8)
Branch: `feature/tb-officer-assignment-parity-20260822`
Draft PR: `#319`

## Current completion

- Feature implementation: **98%**
- Release / production readiness: **75%**
- Branch position: **33 commits ahead / 0 behind `main`** at the latest comparison
- Changed files: **18**
- Active-branch overlap: **0 files with ROTE #316; 0 files with GAC #318**
- Production deployment: **none**

The remaining release percentage is intentionally held back for executable regression tests and authenticated staging smoke. No test pass is inferred from source inspection.

## Product rule now enforced

**SWGOH Command Center is the primary officer application. Discord is an optional planning-control and publication integration.**

The immutable ROTE workflow is now separated into two trust boundaries:

```text
Authenticated website officer
  -> saved ROTE plan
  -> canonical Guild / Operations hydration
  -> parity planner
  -> immutable version + full hash
  -> website review / approve / cancel

Optional verified Discord binding
  -> durable Discord preferences / availability / hard reserves join planning
  -> generate a fresh Discord-aware immutable version
  -> verified Discord destination
  -> Stage 10 exact-message preview
  -> explicit PUBLISH + hash confirmation
  -> idempotent delivery receipts
```

A Guild **does not need Discord** to generate, inspect, approve, cancel, or list immutable assignment versions.

A Guild **does need a verified Discord binding and a Discord-aware immutable snapshot** for Stage 10 Discord preview/publication.

If a Discord binding exists, its durable planning controls remain fail-closed rather than being silently ignored.

## Original parity problem closed by this branch

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

Before this branch, Stage 9 rejected persisted plans using supported website customizations with `TB_ASSIGNMENT_PLAN_CUSTOMIZATION_UNSUPPORTED`. A sophisticated website plan therefore could not continue through immutable approval and controlled Stage 10 delivery.

Stage 9 now reruns the shared `planGuildTbOperationsParity()` engine using the exact persisted website plan configuration instead of rejecting or discarding those controls.

## Website-first immutable context

`tb-immutable-web-context.mjs` owns the server-side split between planning and Discord delivery.

### Planning context

The website:

1. validates a signed-in account;
2. authorizes the officer against the requested Guild through `requireOfficer()`;
3. uses the authorized 9-digit Ally Code for canonical live hydration when no Discord binding exists;
4. checks for a verified Discord binding server-side;
5. includes trusted Discord identity/control context only when that binding exists.

Browser-submitted Discord Guild IDs or substitute Ally Codes are not authoritative planning identity.

### Delivery context

Stage 10 uses the stricter `deliveryContext()` path.

Without verified Discord it rejects with `TB_STAGE10_VERIFIED_BINDING_REQUIRED`, while explicitly leaving the already-created immutable website artifact valid for review/approval.

## Stage 9 planning modes

The immutable fingerprint/diagnostics record one of two explicit planning modes:

- `website-only`
- `website-plus-discord-controls`

### Website-only

Stage 9 reads:

- canonical Guild player identity rows;
- canonical Guild member availability / ignore controls;
- canonical GIVE / KEEP donation preferences;
- persisted website plan controls;
- canonical live Guild roster;
- current Operation requirements;
- mission-safety protections.

It does **not** read Discord state or hard reservations.

### Website + Discord controls

When a verified binding exists, Stage 9 also includes:

- Discord member preferences;
- Discord member availability;
- verified linked-member hard reservations.

If that configured durable Discord state is unavailable, immutable planning fails closed instead of producing a plan that silently omits those controls.

## Persisted web-plan parity

Immutable preview materializes:

- `phase_layout`;
- `requirement_overrides`;
- `ignored_missions`;
- `ignored_platoons`;
- `ignored_slots`;
- enabled `guild_tb_grouping_rules` with `when_spec` / `then_spec`;
- `guild_tb_plan_preassignments`.

Database player UUIDs are normalized to canonical SWGOH player/Ally Code identity before parity planning. Canonical database donation preferences replace duplicate Discord-state preference keys. Discord hard reservations are honored only when the stored Discord user link resolves to the same SWGOH member identity.

## Website officer workflow

`/guild/operations` exposes an **IMMUTABLE OFFICER ASSIGNMENT REVIEW** panel.

The website path is:

```text
Select saved ROTE plan
 -> choose P1-P6
 -> Generate Immutable Version
 -> inspect assignments / risk summary
 -> inspect full 64-character plan hash
 -> explicitly mark exact artifact reviewed
 -> Approve Exact Artifact
```

Without Discord, the UI reports:

- `WEB PLAN READY · DISCORD OFF`
- `Website planning + approval ready`

An approved web-only artifact remains visible and valid for website review. It is **not** immediately Discord-publishable if Discord is connected later.

### Re-plan after connecting Discord

A critical transition guard now prevents this unsafe sequence:

```text
website-only artifact
 -> approve
 -> connect Discord later
 -> publish old artifact without newly available Discord controls
```

`tb-stage10-discord-delivery-service.mjs` now rejects a newly fingerprinted `website-only` artifact with:

`STAGE10_REPLAN_AFTER_DISCORD_BINDING_REQUIRED`

The officer must generate and approve a fresh immutable version after Discord is connected so the current Discord preferences, availability and hard reservations are fingerprinted into the artifact.

This guard lives in the shared Stage 10 service, so it protects both website publication and Discord-command publication.

Legacy immutable artifacts without the new planning-mode metadata remain backward-compatible instead of being rejected solely because they predate this branch.

The website proactively reflects the same rule:

- `DISCORD RE-PLAN REQUIRED` appears for an approved website-only artifact after Discord is connected;
- Stage 10 preview/status controls are withheld for that artifact;
- a fresh immutable version must be generated and approved.

## Stage 10 exact delivery UX

For a Discord-aware approved artifact:

```text
Preview Stage 10 Delivery
 -> inspect exact Discord message chunks
 -> inspect destination / mention coverage
 -> choose mention policy
 -> type PUBLISH
 -> final browser confirmation
 -> Stage 10 controlled delivery
```

Changing the mention policy invalidates the previously rendered delivery preview so an officer cannot review one audience and publish another without re-previewing.

Stage 10 preview also reports whether network delivery is enabled by server configuration. When `deliveryEnabled` is false, the website remains **preview-only** and exposes no PUBLISH control.

## Immutable fingerprint

Planner contract: `stage9-web-discord-parity-v2`.

The immutable fingerprint binds:

- planning mode / Discord-bound state;
- Guild roster snapshot;
- Operation requirements;
- mission-safety protections;
- durable planning-control snapshot;
- normalized effective planning controls;
- persisted source-plan controls;
- grouping rules;
- preassignments;
- final parity output.

Any material planning change therefore creates a different immutable artifact fingerprint/version.

## Fail-closed behavior retained

Immutable preview creation rejects:

- missing or archived source plans;
- incomplete configured Discord bindings;
- configured Discord planning state that cannot be read safely;
- planning controls that mutate while live source hydration is running;
- unresolved requirement overrides reported by the shared parity planner.

Stage 10 rejects:

- no verified Discord binding / destination;
- a new website-only artifact created before Discord controls were bound;
- unapproved / cancelled / superseded / stale / tampered artifacts;
- mismatched explicit hash confirmation;
- changed mention audiences during delivery;
- changed verified destinations during delivery;
- disabled server-side network delivery;
- ambiguous failed delivery receipts without manual review.

Immutable preview never publishes or sends member DMs.

## Downstream approval / delivery safety

No web-first change bypasses existing immutable controls.

`tb-assignment-version-service.mjs` still hashes assignments, unfilled rows and diagnostics independent of planner origin.

Website approval still requires the **full exact 64-character plan hash**.

`tb-assignment-publishability-service.mjs` still requires:

- deterministic persisted hash verification;
- exact officer approval;
- approved hash equal to current immutable plan hash;
- non-cancelled / non-superseded artifact;
- current authoritative source plan;
- latest immutable version for the exact plan + phase.

`tb-stage10-web-delivery-service.mjs` is deliberately thin. It translates authenticated website requests into the existing Stage 10 service contract; it does not duplicate delivery logic.

Stage 10 still requires:

- a verified Discord Guild / destination;
- a Discord-aware immutable snapshot for newly fingerprinted artifacts;
- a publishability-approved immutable artifact;
- stored artifact phase/version resolved server-side rather than trusted from browser input;
- explicit `PUBLISH` confirmation;
- hash confirmation;
- stable linked-member mention audience;
- idempotent durable delivery receipts.

Stage 10 never calls the parity planner directly.

## Regression coverage added / updated

Contracts now cover:

- supported web-plan customizations flow into shared parity planning rather than rejection;
- preassignment database UUID -> canonical SWGOH identity normalization;
- canonical database preference precedence;
- unavailable-member normalization;
- website-only Stage 9 does not read Discord state;
- website-only planning succeeds even if an unused Discord store is unavailable;
- configured Discord planning remains fail-closed if durable state is unavailable;
- server-side planning context ignores client-supplied Discord/Ally identity substitutions;
- immutable approval / cancellation do not require Discord;
- Stage 10 preview/status/publish require verified Discord;
- Stage 10 web adapter rejects website-only context before constructing delivery;
- Stage 10 derives phase/version from the stored immutable artifact rather than browser body;
- Stage 10 rejects website-only fingerprints after Discord is connected;
- Stage 10 accepts explicit Discord-aware fingerprints;
- legacy artifacts without planning-mode metadata remain compatible;
- website suppresses Stage 10 controls until both current Discord destination and artifact snapshot are eligible;
- website suppresses PUBLISH when Stage 10 network delivery is disabled;
- control-mutation rejection;
- unresolved requirement rejection;
- fingerprint changes for live requirements, saved plan controls, grouping rules and preassignments;
- source guard preventing return of `TB_ASSIGNMENT_PLAN_CUSTOMIZATION_UNSUPPORTED`;
- website UX guard preventing return of the old `BINDING REQUIRED` planning message;
- cross-layer website context -> Stage 9 -> immutable hash -> approval/publishability -> Stage 10 ownership.

The shared parity-planner tests on `main` already cover phase/ignore scoping, requirement overrides, unresolved clears, preassignment locks and grouping-rule constraint passes.

## Validation state

Latest source audit:

- PR #319 is open, draft and mergeable;
- branch is **33 commits ahead / 0 behind `main`**;
- **18 files changed**;
- zero changed-file overlap with active ROTE #316;
- zero changed-file overlap with active GAC #318;
- GitHub combined status for the latest checked head contains no statuses;
- GitHub reports no pull-request workflow run for that head;
- repository contains a manual-only `.github/workflows/node-test.yml` using `workflow_dispatch` -> `npm ci` -> `npm test`;
- the connected GitHub controls in this session can read/re-run existing workflow runs but cannot start a new manual dispatch;
- no production deployment occurred.

Executable `npm test` has **not** been claimed. The available local execution environment could not resolve `github.com` for a repository clone, and no branch workflow run exists to rerun, so executable testing remains a release gate.

## Production gate

Do not merge/deploy until:

1. complete `npm test` passes against the branch in an environment with repository access or through the manual Node regression workflow;
2. an authenticated website-only officer creates and approves an immutable test artifact with no Discord binding;
3. a persisted plan containing every supported customization produces expected website vs Stage 9 parity;
4. exact-hash officer approval succeeds and tampered/stale/superseded/unapproved artifacts still fail closed;
5. connect a verified test Discord binding and confirm the old website-only artifact is rejected for Stage 10 with re-plan required;
6. generate and approve a fresh Discord-aware immutable version;
7. Stage 10 exact rendered chunks / mention coverage are officer-reviewed;
8. verify delivery-disabled mode remains preview-only;
9. controlled test publication confirms idempotent receipts / replay behavior;
10. active branch ownership is rechecked immediately before merge;
11. merge/deploy occurs only with explicit production approval.
