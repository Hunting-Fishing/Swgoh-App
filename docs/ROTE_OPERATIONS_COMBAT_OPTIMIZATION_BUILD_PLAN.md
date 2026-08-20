# SWGOH Command Center — ROTE Operations + Combat Optimization Build Plan (A–F)

Last updated: 2026-08-20
Status: implementation plan
Target branch: `feature/rote-tactical-map-v2`
Primary product: website
Discord role: controlled publication/notification adapter only

---

# 1. Product objective

Build one evidence-backed ROTE decision system that answers, for every Guild member and every active phase:

1. **Who owns the characters required for Operations?**
2. **Who was assigned to each Operation slot?**
3. **Who actually filled each Operation slot?**
4. **What combat/special-mission capability is lost if that member donates that character?**
5. **Which donor creates the best overall Guild ROTE outcome?**
6. **What squads did members actually use, and what happened?**
7. **What does our own Guild evidence say after enough real attempts exist?**

The optimizer must stop treating an Operation character as an isolated inventory item. A character belongs to a player roster, and donating it can destroy or weaken a mission squad. The target system therefore optimizes **Operations and Combat together**.

Core objective:

> **Fill valuable Operation slots while sacrificing the least possible Guild battle capability, special-mission opportunity, and route value.**

This plan covers:

- **A — Operation Contribution Ledger**
- **B — Guild Operation Inventory**
- **C — Mission Preservation Engine**
- **D — Joint Operations Optimizer v2**
- **E — Mission Attempt Reporting**
- **F — Guild Evidence Engine**

---

# 2. Non-negotiable evidence rules

The Command Center must preserve three independent evidence classes:

- **GAME DATA** — authoritative game/gateway/canonical roster/event evidence.
- **COMMUNITY** — sourced recommendations, mod targets, squad guidance, kill order, strategy.
- **GUILD DATA** — actual Ludus Venatus assignments, contributions, attempts, results, and observed outcomes.

They may be presented together, but they must never be silently merged into one unlabeled statistic.

## 2.1 Entry legality is not tactical readiness

Always preserve:

- **ENTRY LEGAL / ENTRY BLOCKED / ENTRY UNKNOWN**
- **TACTICAL BATTLE READINESS**

A legal R7 character can still be tactically poor because of missing Level, ability tiers, Zetas, active TB Omicrons, mods, Speed, Health, Protection, Offense, Potency, Tenacity, or safer progression targets.

## 2.2 Unknown is never zero

Missing evidence remains `UNKNOWN`.

Do not convert missing:

- ability tiers to 0;
- Zetas to absent;
- Omicrons to absent;
- stats to 0;
- Operation contribution identity to unfilled;
- mission result to failed;
- absence of a report to skipped.

## 2.3 Assignment is not contribution

These are different facts:

- **ASSIGNED** — Command Center/officer intended a member to donate a unit.
- **FILLED/CONTRIBUTED** — evidence says the unit was actually donated.

An assignment must never become proof of contribution.

## 2.4 Technical failure is not battle failure

GitHub issue #209 remains a hard acceptance gate.

Railway deploy/restart, server failure, API timeout, browser/network interruption, page reload, failed save, or transport error must never become:

- `FAILED`
- `0/2`
- `SKIPPED`

Technical failure creates either no battle row or a separate technical/audit event outside battle-result analytics.

## 2.5 No fabricated win percentage

Until a validated predictive model exists:

- show readiness states;
- show sample-safe observed results;
- keep `predictiveProbability: null`.

Allowed:

> **Observed Completion Rate — 80% · 25 recorded attempts**

Not allowed without a validated model:

> **80% win probability**

---

# 3. Existing architecture to reuse

This program extends existing systems. It must not create parallel sources of truth.

## 3.1 Guild roster and unit evidence

Reuse:

- `canonical-roster-service.mjs`
- `persisted-guild-roster-service.mjs`
- `guild-roster-service.mjs`
- persisted `players`, `guild_members_current`, `player_units_current`
- ability/progression/stat evidence already produced by the canonical roster pipeline

Do not build a second Guild roster store.

## 3.2 Existing Operations planning

Reuse:

- `rote-operations.mjs`
- `guild-operations-service.mjs`
- `guild-member-operations-service.mjs`
- `guild-operations-api.mjs`
- `public/guild-rote-operation-safety.js`
- `public/guild-rote-safe-planner.js`
- `discord-tb-live.mjs`
- member availability controls
- GIVE/KEEP preferences
- hard reservations
- officer audit history

Current `public/guild-rote-operation-safety.js` protects mission units primarily from **entry-coverage scarcity**. It is the bridge to upgrade: v2 adds full tactical readiness and donor-removal mission deltas.

## 3.3 Tactical readiness

Reuse:

- `public/tb-mission-readiness-v2.js`
- `public/tb-mission-readiness-policy-v2.js`
- `public/guild-rote-tactical-readiness-matrix.js`
- `public/guild-rote-mission-coverage-model.js`
- `public/rote-tactical-mission-intelligence.js`

The Operations optimizer must consume these contracts. It must not implement a second readiness formula.

## 3.4 Immutable assignment publication pipeline

Reuse Stage 9:

- `tb-assignment-version-service.mjs`
- `tb-assignment-version-diff.mjs`
- `tb-assignment-version-compare-service.mjs`
- `tb-assignment-publishability-service.mjs`
- immutable `guild_tb_assignment_runs`
- exact version/hash approval and cancellation

Joint Optimizer v2 produces a proposed assignment artifact. It does **not** bypass Stage 9 approval/version/hash safety.

## 3.5 Active TB state

Reuse:

- `tb-event-state-service.mjs`
- `tb-event-state-api.mjs`
- `guild_tb_events`
- durable phase/zone state

Every contribution and attempt must be attached to an actual event identity when known. Static ROTE reference data is not live event state.

## 3.6 Attempt evidence foundation

Already built/live:

- `public/tb-mission-attempt-evidence.js`
- `tb-mission-attempt-history-service.mjs`
- `guild_tb_mission_attempts`

Keep append-only/idempotent evidence semantics.

---

# 4. Unified domain model

The final model is:

```text
ACTIVE ROTE EVENT
      |
      +--> PHASE
              |
              +--> OPERATION SLOTS
              |      |
              |      +--> required unit
              |      +--> eligible Guild owners
              |      +--> assigned donor
              |      +--> actual contributor evidence
              |
              +--> MISSIONS
                     |
                     +--> legal entry rules
                     +--> recommended squads
                     +--> player tactical readiness
                     +--> donor-removal readiness delta
                     +--> observed Guild attempts

                           |
                           v
                 JOINT GUILD OPTIMIZER
                           |
                    immutable preview
                           |
                 Stage 9 approval/version
                           |
                      publication
```

---

# 5. Data model

All migrations must be additive and RLS/service-role safe.

## 5.1 A — `guild_tb_operation_slots`

One durable logical row per event Operation slot.

Core columns:

- `id uuid`
- `event_id uuid -> guild_tb_events`
- `guild_id uuid -> guilds`
- `phase text`
- `planet_id text`
- `operation_id text`
- `operation_name text`
- `slot_id text`
- `slot_index integer`
- `required_base_id text`
- `required_relic smallint/null`
- `required_rarity smallint/null`
- `source_kind text`
- `source_ref text/null`
- `source_fetched_at timestamptz/null`
- `metadata jsonb`
- `created_at`
- `updated_at`

Unique logical identity:

`(event_id, phase, operation_id, slot_id)`

This is event state, not historical contribution evidence, so current state may be updated when authoritative game state refreshes.

## 5.2 A — `guild_tb_operation_assignments`

Append-safe history of who was assigned to a slot.

Core columns:

- `id uuid`
- `slot_id uuid -> guild_tb_operation_slots`
- `assignment_run_id uuid/null -> guild_tb_assignment_runs`
- `assigned_player_id uuid -> players`
- `assigned_ally_code text`
- `assigned_base_id text`
- `assignment_state text`
- `assignment_source text`
- `plan_hash text/null`
- `input_fingerprint text/null`
- `assigned_by_user_id uuid/null`
- `assigned_at timestamptz`
- `superseded_at timestamptz/null`
- `metadata jsonb`

Assignment history must remain auditable. A new assignment does not rewrite the old one.

## 5.3 A — `guild_tb_operation_contributions`

Append-only evidence of actual contribution.

Core columns:

- `id uuid`
- `contribution_key text unique`
- `evidence_fingerprint text`
- `slot_id uuid -> guild_tb_operation_slots`
- `event_id uuid`
- `guild_id uuid`
- `phase text`
- `contributor_player_id uuid/null`
- `contributor_ally_code text/null`
- `contributed_base_id text`
- `contributed_relic smallint/null`
- `contributed_rarity smallint/null`
- `status text`
- `evidence_class text`
- `source_kind text`
- `source_ref text/null`
- `observed_at timestamptz`
- `reported_by_user_id uuid/null`
- `unit_snapshot jsonb`
- `metadata jsonb`
- `created_at`

Allowed contribution status:

- `filled`
- `verified`
- `mismatch`
- `unknown`

`vacant` and `assigned` are slot/assignment state, not contribution evidence rows.

Contribution evidence must be append-only. Corrections create a new evidence record or explicit correction relation, never a silent UPDATE of history.

## 5.4 C/D — optional materialized optimizer artifacts

Do not initially persist every calculated donor score. First generate deterministic preview artifacts. Persist only when useful for audit/reproduction:

### `guild_tb_optimizer_previews`

- `id uuid`
- `guild_id`
- `event_id`
- `phase`
- `algorithm_version`
- `input_fingerprint`
- `roster_fetched_at`
- `operation_state_fetched_at`
- `proposal jsonb`
- `diagnostics jsonb`
- `created_by_user_id`
- `created_at`

This can later feed Stage 9 version creation.

## 5.5 Existing attempt table remains authoritative

Do not create a second battle result table for A–F.

Use `guild_tb_mission_attempts` and extend only if a missing normalized field is proven necessary.

---

# 6. Shared roster evidence contract

Create one normalized server-side projection for Operations + Combat decisions, tentatively:

`tb-guild-unit-evidence-service.mjs`

For each current Guild member/unit expose:

```js
{
  guildId,
  playerId,
  allyCode,
  playerName,
  rosterFetchedAt,
  baseId,
  unitName,
  level,             // null if unknown
  stars,             // null if unknown
  gear,              // null if unknown
  relic,             // null if unknown
  galacticPower,     // null if unknown
  zetaCount,         // null if unknown
  omicronCount,      // null if unknown
  abilities: [
    { id, name, tier, hasZeta, hasOmicron, omicronMode }
  ],
  stats: {
    speed,
    health,
    protection,
    offense,
    physicalDamage,
    specialDamage,
    potency,
    tenacity,
    criticalChance,
    criticalDamage,
    defense,
    armor,
    resistance,
    accuracy,
    criticalAvoidance
  },
  evidence: {
    progressionKnown,
    abilitiesKnown,
    modsStatsKnown,
    source,
    fetchedAt
  }
}
```

Rules:

- preserve `null` for unknown values;
- never invent stat values from GP;
- separate TB-active Omicron from owned-but-inactive Omicrons;
- attach source/freshness metadata;
- use one snapshot timestamp in optimizer inputs so decisions are reproducible.

---

# 7. A — Operation Contribution Ledger

## Goal

Know the complete lifecycle of every Operation slot:

```text
VACANT
  -> ASSIGNED
  -> FILLED
  -> VERIFIED
```

Exceptional states:

- `MISMATCH` — contributor/unit differs from assignment or slot requirement.
- `UNKNOWN` — contribution appears present but identity/evidence is incomplete.

## A1 — schema foundation

Build:

- `guild_tb_operation_slots`
- `guild_tb_operation_assignments`
- `guild_tb_operation_contributions`
- indexes by event/phase/operation/slot/player/base_id
- append-only guards for contribution history
- service-role least privileges
- no anonymous/authenticated direct table access

Tests:

- schema constraints;
- duplicate logical slot prevention;
- duplicate `contribution_key` prevention;
- contribution UPDATE/DELETE/TRUNCATE rejected;
- assignment history preserved.

## A2 — Operation state ingestion service

Create:

- `tb-operation-contribution-service.mjs`

Responsibilities:

1. Resolve verified/current Guild + active event.
2. Normalize Operation slot definitions from existing `rote-operations.mjs` source.
3. Resolve game/gateway contribution evidence when contributor identity exists.
4. Accept explicit member/officer confirmation only through authenticated server API.
5. Attach evidence class/source/freshness.
6. Detect assignment/contribution mismatch.
7. Never infer contribution from assignment.

Preferred source precedence:

1. canonical/game contributor identity;
2. verified game-derived event payload;
3. officer-confirmed contribution;
4. member self-confirmation for their own verified player;
5. unknown.

## A3 — API

Tentative routes:

- `GET /api/tb/operations/event/current`
- `GET /api/tb/operations/event/current/ledger?phase=P3`
- `POST /api/tb/operations/contributions`

Permissions:

- normal verified Guild member: read Guild-safe ledger, self-confirm own contribution only;
- officer/owner: Guild-wide read, confirm/mismatch resolution, assignment audit access;
- no cross-Guild access.

## A4 — UI

Officer table:

```text
P3 · Tatooine · Operation 2
Slot  Required        Assigned      Actual         State
1     Seventh Sister  DarthBob      DarthBob       VERIFIED
2     Fifth Brother   PlayerA       PlayerB         MISMATCH
3     Ninth Sister    PlayerC       —               ASSIGNED
4     GI              —             —               VACANT
```

Member card shows only actionable relevant details plus Guild-safe status.

## A acceptance

- assignment never proves fill;
- actual contributor can be recorded with provenance;
- mismatches are visible;
- every contribution is tied to event/phase/slot;
- historical contribution evidence cannot be silently rewritten.

---

# 8. B — Guild Operation Inventory

## Goal

For any Operation-required unit, instantly answer:

> **Who in the Guild owns this unit, at what progression/stat quality, and what is their current donation/combat status?**

## B1 — inventory projection service

Create:

- `tb-operation-inventory-service.mjs`

Inputs:

- canonical Guild roster;
- active event/phase;
- Operation slot requirements;
- member availability;
- GIVE/KEEP preferences;
- hard reservations;
- existing assignments;
- actual filled contributions.

Output per required base ID:

```js
{
  baseId,
  unitName,
  requiredBy: [...slots],
  owners: [
    {
      player,
      unitEvidence,
      operationEligibility,
      relicDelta,
      preference,       // give / keep / default
      hardReserved,
      available,
      alreadyAssigned,
      alreadyContributed,
      rosterFreshness
    }
  ]
}
```

## B2 — Relic Delta

Use explicit semantics:

`relicDelta = playerRelic - requiredRelic`

Examples:

- R9 vs R7 = `+2`
- R7 vs R7 = `0`
- R6 vs R7 = `-1` and not eligible
- unknown relic = `UNKNOWN`, not `-7`

Relic Delta is a feature, not the final donor decision.

## B3 — ability/Omicron detail

Inventory must display specific abilities when known:

- Zeta applied to which ability;
- Omicron applied to which ability;
- Omicron mode;
- **TB active** vs **owned but inactive in TB**.

Never count a GAC/TW Omicron as active TB combat power.

## B4 — stats/mod evidence

Expose mission-relevant known stats, not a generic hidden mod score.

At minimum:

- Speed
- Health
- Protection
- Offense
- Potency
- Tenacity

Keep the wider stat snapshot for future segmentation.

## B5 — UI

Officer inventory view:

```text
GRAND INQUISITOR · required R7 · 3 open slots

Member        Relic Δ  Speed  Zetas  TB Omi  Preference  Combat Risk
Player A      +2       356    3/3    YES     KEEP        HIGH
Player B      +1       331    3/3    YES     GIVE        MEDIUM
Player C       0       297    2/?    NO      DEFAULT     LOW
```

Every `?` or unknown must remain explicit.

## B acceptance

- every Operation requirement can be mapped to all known Guild owners;
- roster freshness is visible;
- progression, specific abilities and known stats are preserved;
- unknown evidence never masquerades as a low value;
- officers can drill into the existing Guild member profile rather than duplicate it.

---

# 9. C — Mission Preservation Engine

## Goal

For every possible donor candidate, calculate:

> **What missions/squads become worse or impossible if this exact player donates this exact unit?**

This is the critical bridge between Operations and Combat.

## C1 — donor-removal readiness delta engine

Create:

- `tb-mission-preservation-service.mjs`
- shared pure model where practical: `public/tb-mission-preservation-model.js`

Algorithm for `(player, phase, baseId)`:

1. Evaluate all relevant phase missions with the real roster.
2. Enumerate supported/legal recommended teams and mission-required structures.
3. Record baseline official entry + tactical readiness.
4. Remove/reserve the candidate unit from available battle roster.
5. Re-evaluate each mission/team.
6. Record exact delta.
7. Search legal alternatives before declaring a mission blocked.

Output example:

```js
{
  playerId,
  baseId: 'GRANDINQUISITOR',
  phase: 'P3',
  missionImpacts: [
    {
      missionId: 'tatooine-reva',
      before: 'SAFER READY',
      after: 'BLOCKED — ENTRY',
      entryBefore: true,
      entryAfter: false,
      reason: 'Required mission unit reserved for Operation',
      alternativesEvaluated: 0
    }
  ],
  summary: {
    specialMissionsLost: 1,
    saferReadyLost: 1,
    minimumReadyLost: 0,
    legalEntryLost: 1,
    combatCostClass: 'CRITICAL'
  }
}
```

## C2 — preserve alternatives

A unit must **not** be labeled mission-critical merely because it appears in one community recommendation.

Before downgrade/blocking:

- check mandatory mission rule;
- check legal flex slots;
- check alternate recommended teams;
- check other roster units satisfying the same slot;
- preserve community recommendation vs official legality distinction.

## C3 — tactical features included

Mission preservation consumes existing readiness evidence:

- Level
- Stars
- Gear
- Relic
- Relic Delta
- required/safer progression
- ability tiers
- specific Zetas
- active TB Omicrons
- known mod-derived stats
- mission stat targets

No separate opaque readiness score replaces the current verdicts.

## C4 — mission value classes

Use explicit, explainable mission classifications rather than one hidden universal number:

- Special/unlock/shard mission
- Currency mission
- High TP combat mission
- Normal combat mission
- Fleet mission
- Community-only recommendation

Officer route/phase priorities may add explicit weights, but diagnostics must show why.

## C acceptance

- donating a required unit correctly shows entry loss;
- donating a core tactical unit can show SAFER -> MINIMUM/ENTRY downgrade;
- legal alternatives prevent false blocking;
- specific Zeta/TB Omicron/stat evidence affects tactical delta when sourced;
- unknown evidence remains unknown;
- every impact can be explained in plain language.

---

# 10. D — Joint Operations Optimizer v2

## Goal

Replace isolated donation ranking with a deterministic constrained optimizer that considers both:

- Operation completion value;
- combat opportunity cost.

## D1 — optimizer input contract

Create one frozen input object:

```js
{
  algorithmVersion,
  guildId,
  eventId,
  phase,
  rosterFetchedAt,
  operationsFetchedAt,
  operationSlots,
  ownersByBaseId,
  tacticalReadiness,
  missionPreservation,
  strategicAbilityContext,
  routeContext,
  controls: {
    unavailableMembers,
    givePreferences,
    keepPreferences,
    hardReservations,
    manualLocks
  }
}
```

Generate a deterministic `inputFingerprint` over normalized inputs.

Same inputs + same algorithm version must produce the same proposal.

## D2 — hard constraints

The optimizer may never violate:

1. member unavailable/ignored;
2. hard reservation;
3. officer manual locked assignment;
4. explicit KEEP where configured as hard protection;
5. Operation unit ownership/entry requirement;
6. already verified contribution conflicts;
7. one physical roster unit assigned incompatibly more than allowed by game rules;
8. active event/phase scope;
9. stale/incomplete Guild roster fail-closed thresholds.

GIVE is a preference boost, not permission to violate a hard combat reservation.

## D3 — objective decomposition

Do not expose one mysterious “win score.”

Internally the solver can minimize/maximize a deterministic cost function, but return decomposed diagnostics.

Candidate dimensions:

### Operation benefit

- fills otherwise unfilled slot;
- completes Operation group;
- advances strategic ability threshold;
- affects officer route priority;
- resolves scarce requirement;

### Combat opportunity cost

- required mission entry lost;
- Special Mission/unlock/shard attempt lost;
- SAFER READY -> lower state;
- MINIMUM READY -> ENTRY READY;
- ENTRY READY -> BLOCKED;
- rare leader/core removed;
- alternative squad depth reduced;
- relic/stat/ability quality removed from best available squad;

### Scarcity

- number of eligible Guild owners;
- number of owners after availability/reservations;
- redundancy target;
- whether donor is sole/near-sole mission-ready owner.

### Player controls

- GIVE preference;
- KEEP preference;
- hard reserve;
- unavailable;
- officer lock.

## D4 — deterministic comparison order

When proposals are otherwise equivalent, use stable tie-breakers such as:

1. fewer special/required mission losses;
2. fewer tactical readiness downgrades;
3. lower scarcity cost;
4. honor GIVE over default;
5. lower combat-quality sacrifice;
6. stable player ID / Ally Code ordering.

Do **not** prefer a stronger R9 donor merely because R9 > R7. Often the stronger character should be preserved for battle.

## D5 — preview diagnostics

For each proposed assignment expose:

```text
ASSIGN Player B · Cere Junda R7
Operation: P2 Bracca · Slot 4

Why:
+ Meets R7 gate
+ Fills scarce Operation slot
+ GIVE preference
+ 6 alternate battle-ready Cere/UFU owners remain

Combat impact:
- No legal mission entry lost
- No SAFER READY squad lost

Alternative rejected:
Player A · Cere R9
- Would downgrade Bracca team SAFER READY -> ENTRY READY
```

## D6 — Stage 9 integration

The v2 optimizer output becomes the proposed assignment artifact consumed by existing Stage 9 versioning.

Required flow:

```text
Optimizer v2 preview
      -> input fingerprint
      -> immutable Stage 9 assignment version
      -> officer review/diff
      -> exact version/hash approval
      -> existing controlled publication path
```

Never mutate an approved Stage 9 version in place.

Re-running after roster/Operation changes produces a new version.

## D7 — rollout mode

First release is **preview only**.

No automatic publishing.
No automatic Discord sends.
No automatic replacement of an approved assignment run.

## D acceptance

- all hard controls are respected;
- same inputs are deterministic;
- donor-removal combat cost changes assignments when appropriate;
- R9/better mods can cause preservation rather than naive selection;
- diagnostics explain every selection/rejection;
- Stage 9 immutable approval/version/hash flow remains authoritative.

---

# 11. E — Mission Attempt Reporting

## Goal

Capture real ROTE outcomes during the active event with exact squad/progression/stat evidence, safely enough to become Guild evidence.

The append-only persistence foundation already exists. E exposes it safely.

## E1 — authenticated API

Create:

- `tb-mission-attempt-api.mjs`

Tentative endpoints:

- `GET /api/tb/attempts?event=current&phase=P3&mission=<id>`
- `GET /api/tb/attempts/me?event=current`
- `POST /api/tb/attempts`

POST requirements:

- same-origin validation;
- authenticated Command Center session;
- verified linked player;
- active/current Guild membership;
- event/guild/player consistency;
- bounded JSON body;
- exact mission identity;
- stable logical attempt ID;
- explicit user action for result;
- normalized result semantics;
- exact team snapshot when an actual battle outcome is reported;
- server-side roster snapshot verification/enrichment where possible.

## E2 — transport safety

Issue #209 acceptance is mandatory:

- request timeout -> no attempt row;
- Railway restart -> no attempt row;
- server 5xx -> no attempt row;
- client abort -> no attempt row unless transaction fully committed and idempotent retry returns existing evidence;
- failed JSON/body validation -> no attempt row;
- retry with same attempt/evidence -> existing row, no duplicate;
- same logical attempt with changed evidence -> 409 conflict, no overwrite.

## E3 — result semantics

Buttons:

- `2/2`
- `1/2`
- `0/2`
- `FAILED`
- `SKIPPED`

Rules:

- `FAILED` = confirmed battle attempt loss, not generic technical failure;
- `SKIPPED` = explicit intentional non-attempt;
- no report = `NOT REPORTED`, not a database outcome;
- technical labels normalize to `UNKNOWN` and remain non-countable if they somehow reach evidence normalization.

## E4 — mission inspector UI

Add reporting beneath selected tactical mission intelligence.

Prefill team from, in order:

1. actual Squad Workbench selection/loaded squad;
2. selected recommendation if explicitly loaded;
3. user-selected manual team.

Do not silently claim a recommendation was the used team.

Before submit show:

- mission;
- result;
- squad portraits/names;
- Relics;
- relevant Zetas/TB Omicrons when known;
- key stats snapshot status;
- evidence source.

## E5 — officer capability

Officers may view Guild attempts.

Correction model:

- no direct history rewrite;
- record correction/superseding evidence with audit link;
- analytics select latest valid evidence under explicit correction rules.

## E acceptance

- real member can report a mission in a few clicks;
- exact squad snapshot is captured;
- technical failures cannot become losses/skips;
- retries are idempotent;
- personal/Guild evidence is clearly separated;
- corrections are auditable.

---

# 12. F — Guild Evidence Engine

## Goal

Turn accumulating real Guild attempts into useful descriptive evidence, and only later into a validated predictive model if the dataset supports it.

## F1 — normalized evidence query service

Create:

- `tb-guild-evidence-service.mjs`

Read only valid attempt evidence for the same mission identity and appropriate game context.

Core aggregations:

- by mission;
- by player;
- by squad signature;
- by leader;
- by fifth slot;
- by progression profile;
- by Relic Delta;
- by specific Zeta state;
- by TB Omicron state;
- by ability tier profile;
- by stat bands;
- by Strategic Ability context;
- by Operation completion context.

## F2 — sample-safe descriptive statistics

Initial outputs:

- recorded attempts;
- countable attempts;
- 2/2 count;
- partial count;
- failed count;
- skipped count;
- unknown count;
- observed completion rate only after minimum sample threshold;
- confidence/sample label;
- `predictiveProbability: null`.

Skipped/unknown/not-reported/technical events stay out of the denominator.

## F3 — segmentation policy

Avoid misleading tiny slices.

For every segmented statistic define:

- minimum sample to display a percentage;
- adequate sample threshold;
- recency window if used;
- exact mission identity;
- squad signature normalization;
- whether strategic ability / Operation context is comparable.

A 1/1 squad is shown as:

> `1 recorded attempt · raw evidence only`

not:

> `100% success rate`

## F4 — Guild and personal views

Mission inspector:

```text
GUILD DATA
Observed Completion Rate 80% · 25 countable attempts
Complete 20 · Partial 3 · Failed 2

This squad
17 recorded attempts · 14 complete

YOUR DATA
3 attempts · 2 complete · 1 partial
```

Officers can drill into anonymization-appropriate member evidence and exact roster snapshots where Guild permissions allow.

## F5 — prediction maturity stages

### Stage 0 — readiness + observed evidence

Current/default.

- tactical readiness verdicts;
- observed Guild results;
- no probability.

### Stage 1 — sample-safe descriptive segmentation

After sufficient data:

- observed rates by stable squad/leader/relic/stat bands;
- confidence/sample labeling;
- no claim that correlations are causal.

### Stage 2 — predictive model candidate

Only begin when enough data exists across missions and outcomes.

Candidate features:

- mission ID;
- leader;
- squad members;
- fifth slot;
- Level/Gear/Relic profile;
- Relic Delta;
- specific Zetas;
- active TB Omicrons;
- ability tiers;
- Speed;
- Health;
- Protection;
- Offense;
- Potency;
- Tenacity;
- Strategic Ability state;
- Operation completion context.

Requirements before any user-visible probability:

- train/validation split by event/time to avoid leakage;
- calibration check;
- minimum mission-specific sample;
- uncertainty bounds/confidence category;
- baseline comparison;
- holdout performance acceptance;
- model version and training data cutoff displayed;
- fallback to observed/readiness if confidence is inadequate.

Only then may the UI use a label such as:

> **Estimated Completion Probability — 78% · Model v1 · adequate evidence**

Never use a model probability to rewrite authoritative entry legality.

## F acceptance

- descriptive statistics remain evidence-backed;
- tiny samples do not produce misleading percentages;
- squad/leader/fifth/relic/ability/stat segmentation works;
- Operation/Strategic Ability context can be compared when known;
- no predictive percentage exists before model gates pass.

---

# 13. Joint officer workflow

Final officer workflow:

```text
1. Refresh full Guild roster
2. Resolve active ROTE event + phase
3. Refresh/confirm Operation slot state
4. Review already-filled contributions
5. Build Guild Operation Inventory
6. Compute Mission Preservation deltas
7. Generate Joint Optimizer preview
8. Review WHY each donor was selected
9. Lock/override if needed
10. Create immutable Stage 9 version
11. Diff against prior version
12. Approve exact version/hash
13. Publish through existing controlled channel flow
14. Members complete Operations + battles
15. Capture actual contributions and mission attempts
16. Feed real evidence back into later recommendations
```

No optimizer action skips officer review/approval in initial rollout.

---

# 14. Member workflow

A normal verified member sees:

## Operations

```text
YOUR OPERATION
Seventh Sister R7
P3 · Operation 2 · Slot 4

GIVE — SAFE
No known legal/tactical mission team is lost.

[CONFIRM CONTRIBUTION]
```

or:

```text
Grand Inquisitor R8

KEEP — MISSION CRITICAL
Needed for Reva Special Mission
Current: SAFER READY
Guild alternative donors: 3

DO NOT DONATE
```

## Combat

After battle:

```text
REPORT RESULT
[2/2] [1/2] [0/2] [FAILED] [SKIPPED]
```

The member can inspect why Command Center recommended GIVE/KEEP without seeing unauthorized officer-only controls.

---

# 15. Permission model

## Verified member

Can:

- see own roster evidence;
- see own Operation assignments/reservations;
- see Guild-safe Operation status;
- confirm own contribution;
- report own mission attempts;
- see permitted Guild aggregate evidence;
- set own supported GIVE/KEEP/availability controls through existing safe paths.

Cannot:

- alter another member's evidence;
- approve assignment versions;
- override hard officer reservations;
- publish Guild assignments.

## Officer/owner

Can additionally:

- see Guild-wide Operation inventory;
- inspect donor combat opportunity cost;
- confirm contribution mismatches;
- create/lock assignment previews;
- create Stage 9 versions;
- approve/cancel exact versions;
- inspect Guild attempt evidence;
- record audited corrections.

All authorization resolves against current verified Guild membership.

---

# 16. Freshness and fail-closed rules

The optimizer requires a complete enough Guild snapshot.

Before generating a publishable proposal, validate:

- current Guild identity;
- current member list;
- roster hydration coverage;
- unit progression evidence freshness;
- ability evidence freshness;
- active event/phase identity;
- Operation definition/state freshness;
- officer controls freshness;
- contribution ledger freshness.

If required evidence is stale/incomplete:

- allow read-only inspection where safe;
- mark specific fields `UNKNOWN/STALE`;
- downgrade optimizer to preview/non-publishable;
- do not guess donors from partial evidence.

---

# 17. Optimizer explainability contract

Every candidate decision must return decomposed factors, not merely `score: 82`.

Example:

```js
{
  playerId,
  baseId,
  eligible: true,
  operation: {
    slotValue: 'HIGH',
    scarcityOwners: 3,
    strategicAbilityImpact: 'ADVANCES_5_OF_6'
  },
  combat: {
    specialMissionLost: false,
    entryMissionsLost: 0,
    saferReadyLost: 0,
    minimumReadyLost: 1,
    affectedMissions: [...]
  },
  controls: {
    preference: 'give',
    hardReserved: false,
    available: true,
    manuallyLocked: false
  },
  decision: 'SELECTED',
  reasons: [...]
}
```

An internal numeric optimization cost may be stored for reproducibility, but UI truth is the decomposed evidence.

---

# 18. Testing plan

## Schema tests

- slot identities unique;
- contribution history append-only;
- RLS/privileges correct;
- cross-Guild foreign-key relationships valid;
- correction history cannot overwrite source evidence.

## Identity/auth tests

- member cannot report for another Guild/player;
- officer Guild scope enforced;
- stale former member denied mutation;
- unverified account cannot submit evidence.

## A tests

- assigned != filled;
- correct actual contributor verified;
- assignment/contribution mismatch detected;
- unknown contributor remains unknown;
- duplicate game observation idempotent.

## B tests

- all known owners returned;
- negative Relic Delta blocks eligibility;
- unknown relic remains unknown;
- GAC/TW Omicron does not count as active TB Omicron;
- specific abilities preserved;
- stale roster visibly flagged.

## C tests

- removing mandatory unit blocks entry;
- removing a tactical core downgrades readiness;
- alternative team prevents false block;
- flex-slot replacement works;
- Zeta/TB Omicron/stat target deltas propagate;
- unknown stat evidence does not become a false failure.

## D tests

- KEEP respected;
- GIVE influences tie-break without bypassing hard safety;
- hard reservation respected;
- unavailable member excluded;
- officer manual lock respected;
- verified already-filled slot excluded from reassignment;
- stronger R9 donor can be preserved when R7 donor has lower combat cost;
- same fingerprint -> deterministic same proposal;
- changed roster -> new fingerprint/version;
- Stage 9 immutable version/approval pipeline unchanged;
- no automatic Discord publication.

## E tests

- same-origin/auth required;
- actual 2/2/1/2/0/2 persisted;
- `failure` technical label not battle FAILED;
- `not_attempted` not automatically SKIPPED;
- Railway/server/network timeout creates no attempt;
- retry idempotency;
- conflicting retry fails 409;
- exact squad/progression snapshot captured;
- correction creates audited new evidence.

## F tests

- skipped/unknown excluded denominator;
- not-reported absent from denominator;
- minimum sample prevents percentage;
- adequate sample exposes observed rate;
- squad signature preserves leader and fifth-slot distinctions;
- stat/relic/ability segmentation stable;
- `predictiveProbability === null` until explicit model gate;
- UI wording never calls observed rate a probability.

---

# 19. Build slices / execution order

Keep implementation slices deliberately small.

## Foundation checkpoint

- **FND1** — verify current main sync and active-event schema state.
- **FND2** — freeze shared A–F evidence contracts and naming.

## A — Contribution Ledger

- **A1** — contribution/slot/assignment schema migration + schema tests.
- **A2** — read-only contribution ledger service.
- **A3** — game/canonical contribution ingestion adapter where source supports contributor evidence.
- **A4** — authenticated self/officer confirmation API.
- **A5** — officer/member ledger UI.

## B — Inventory

- **B1** — normalized Guild unit evidence projection.
- **B2** — required-unit owner inventory service.
- **B3** — Relic Delta + ability/TB Omicron/stat evidence.
- **B4** — Guild Operation Inventory UI/drilldown.

## C — Mission Preservation

- **C1** — pure donor-removal readiness delta for one member/mission.
- **C2** — evaluate all relevant phase missions.
- **C3** — alternate squad/flex-slot protection.
- **C4** — special/currency/unlock/TP impact classification.
- **C5** — officer/player combat-impact UI.

## D — Joint Optimizer v2

- **D1** — frozen input contract + fingerprint.
- **D2** — preview-only candidate evaluator.
- **D3** — deterministic assignment optimizer with hard constraints.
- **D4** — explainable diagnostics and alternatives.
- **D5** — Stage 9 immutable version integration.
- **D6** — officer preview/diff UI; still no automatic publication.

## E — Attempt Reporting

Because the Guild is currently in active ROTE, E can be pulled forward after A1/A2 if needed without coupling it to unfinished optimizer work.

- **E1** — authenticated attempt API + transport safety tests.
- **E2** — selected mission result buttons.
- **E3** — Squad Workbench/recommendation prefill with explicit confirmation.
- **E4** — personal/Guild attempt history views.
- **E5** — correction/audit workflow.

## F — Guild Evidence

- **F1** — mission/player/squad aggregate service.
- **F2** — sample-threshold policy and tests.
- **F3** — Relic/Zeta/TB Omicron/stat segmentation.
- **F4** — Strategic Ability/Operation-context segmentation.
- **F5** — Guild mission inspector evidence UI.
- **F6** — prediction-readiness dataset audit only; no model percentage yet.

---

# 20. Recommended near-term priority during the active ROTE

The active event creates a limited opportunity to collect real evidence.

Recommended implementation sequence for the current event:

1. **A1** contribution schema.
2. **A2** contribution read model.
3. **E1** authenticated attempt API.
4. **E2** result controls.
5. **B1/B2** Guild inventory.
6. **C1** donor-removal mission delta.
7. Continue A/B/C/D while real E/F evidence accumulates.

This order captures tomorrow's real mission data without rushing the optimizer into production.

---

# 21. Rollout gates

## Gate 1 — read-only truth

Before any new mutation:

- inventory can show roster owners;
- contribution ledger can show source/freshness;
- mission-preservation preview is explainable.

## Gate 2 — evidence mutation

Enable contribution/attempt writes only after:

- auth/Guild scope tests;
- idempotency;
- append-only history;
- technical interruption safety;
- audit trail.

## Gate 3 — optimizer preview

Joint Optimizer v2 may generate previews after:

- full Guild roster hydration check;
- A/B/C inputs complete enough;
- deterministic fingerprinting;
- hard constraints covered by tests.

## Gate 4 — Stage 9 integration

Only after preview validation:

- create immutable Stage 9 version from v2 proposal;
- require exact version/hash approval;
- no inherited approval after recompute.

## Gate 5 — publication

Use the already-controlled Stage 10/website publication paths.

No new automatic Discord behavior is introduced by A–F.

## Gate 6 — observed analytics

Only after real attempts exist:

- enforce minimum sample thresholds;
- label descriptive evidence correctly.

## Gate 7 — predictive probability

Future only. Requires explicit model validation acceptance described in F5.

---

# 22. Performance / scale requirements

The app is expected to support many Guilds and thousands of users. Avoid per-cell network calls.

Rules:

- hydrate Guild roster once and project locally/server-side in batches;
- batch database queries by Guild/event/phase/base IDs;
- do not make one DB/API request per matrix cell;
- cache immutable/reference mission data;
- key dynamic cache entries by roster/event/controls fingerprint;
- invalidate on Guild roster refresh, event phase change, Operation contribution update, or officer control change;
- preserve existing shared fetch/cache infrastructure in the browser.

Optimizer complexity should be bounded by precomputing:

- eligible owners by required unit;
- member mission readiness;
- donor-removal deltas only for units actually requested by current-phase Operations.

Do not calculate every player/unit/mission permutation when it is irrelevant.

---

# 23. Observability and audit

For each optimizer preview/version record:

- algorithm version;
- input fingerprint;
- Guild roster timestamp;
- active event/phase;
- Operation source timestamp;
- controls/reservations timestamp;
- number of eligible owners;
- number of unknown/stale evidence items;
- unfilled slots and reasons;
- protected missions and reasons;
- selected/rejected candidate diagnostics.

For each evidence write record:

- actor;
- source;
- event;
- player;
- timestamp;
- deterministic key/fingerprint;
- correction/supersession relationship where applicable.

---

# 24. Definition of done for A–F

A–F is complete when an officer can open the active ROTE workspace and:

1. see every current Operation slot;
2. distinguish planned assignment from actual contribution;
3. see who in the Guild owns every required unit;
4. inspect Relic, Relic Delta, specific Zetas, active TB Omicrons, abilities, mods/stats and freshness;
5. see exactly which battle/special missions each potential donation would damage;
6. generate an explainable Guild-wide donor plan that protects the best combat opportunities;
7. review alternate donors and reasons;
8. create an immutable Stage 9 version from that proposal;
9. approve/publish only through the existing controlled workflow;
10. allow members to report real mission results safely;
11. accumulate append-only Guild evidence tied to exact squad/progression/stat context;
12. view sample-safe observed completion evidence;
13. never confuse missing/technical evidence with battle loss or skipped mission;
14. never show a fabricated predictive win percentage.

A normal member can:

1. see what they should GIVE/KEEP and why;
2. see their Operation assignment and contribution state;
3. confirm their own contribution safely;
4. see protected battle teams;
5. report their actual mission result;
6. see personal and permitted Guild observed evidence.

---

# 25. First implementation slice after this plan

Start with **A1 — Operation Contribution Ledger schema**, in a small isolated migration/test slice.

Do not combine A1 with inventory, optimizer, UI, Discord, or attempt API changes.

After A1 passes schema review, implement **A2 read-only ledger service**, then pull **E1/E2 forward** so real current-ROTE attempts can begin accumulating while B/C/D are built safely.
