# SWGOH Command Center — Territory Battle 2.0 Build Plan

Last updated: 2026-08-19

## Product objective

Turn Territory Battle from a collection of useful ROTE tools into a single operating system that answers three questions with minimum friction:

1. **Member:** What exactly do I need to do right now?
2. **Officer:** What does the Guild need everyone to do right now?
3. **Guild:** What should we improve before the next TB?

The primary product remains the website. Discord is an optional notification/publication adapter. Existing canonical roster, mission legality, Operations assignment, farming, Journey overlap, ROTE map, tactical recommendations, and Discord plumbing must be reused rather than reimplemented.

## Existing baseline to reuse

The current codebase already contains the difficult foundations:

- persisted/current Guild roster and shared Guild roster service;
- `/guild/tb` route and existing ROTE officer tools;
- exact ROTE mission rules and all 20 ROTE planet mission maps;
- mission-node resolution and roster legality;
- mission planning cockpit and roster-fit recommendation logic;
- tactical enemy/encounter names and `ROTE-*` squad presets;
- Operations assignment optimizer, GIVE/KEEP, ignores, reserves, preassignments and publish preview safety;
- mission-impact farming and `/guild/tb/farming`;
- tracked Journey goals and TB/Journey overlap;
- player and Guild Command feeds;
- verified Discord destinations and Discord TB member dashboard;
- source freshness, auditability and fail-closed evidence rules.

This plan extends those systems. It does not replace them.

---

# 1. Product information architecture

## Member surfaces

| Route / surface | Purpose |
| --- | --- |
| `/guild/tb/today` | Default member task queue: what to do now |
| `/guild/tb/map` | Full ROTE map with mission intelligence |
| `/guild/tb/missions` | Search/filter all missions and personal readiness |
| `/guild/tb/farming` | Existing TB development/farming view |
| `/guild/tb/history` | Personal and Guild mission attempt history |

## Officer surfaces

| Route / surface | Purpose |
| --- | --- |
| `/guild/tb` | Officer War Room dashboard |
| `/guild/tb/route` | Star/preload route planner and optimizer |
| `/guild/tb/operations` | Existing Operations assignment workflow plus impact graph |
| `/guild/tb/matrix` | Who-can-do-this mission/member matrix |
| `/guild/tb/simulator` | What-if planning sandbox |
| `/guild/tb/settings` | TB strategy defaults, notification policy, event mapping |

Mobile member experience should prioritize `/guild/tb/today`; desktop officer experience should prioritize `/guild/tb`.

---

# 2. Canonical TB event-state architecture

A new **TB Event State** layer is the foundation for all new live workflows. It must not infer live game event state from historical/reference map data.

```text
Game/Guild data + officer-confirmed event state
                 |
                 v
         tb-event-state-service
                 |
      +----------+-----------+
      |          |           |
      v          v           v
  Today Queue  War Room   Route Planner
      |          |           |
      +----------+-----------+
                 |
                 v
       durable event snapshots
                 |
        history / analytics
```

## Proposed durable tables

### `guild_tb_events`
One row per Guild TB instance.

Core fields:

- `id`
- `guild_id`
- `tb_key` (`rote` initially)
- `started_at`
- `ends_at`
- `current_phase`
- `phase_ends_at`
- `status` (`planned`, `active`, `completed`, `archived`)
- `strategy_plan_id`
- `source_fetched_at`
- `created_by`
- `created_at`
- `updated_at`

### `guild_tb_zone_states`
Current per-zone state for an event/phase.

- `event_id`
- `phase`
- `planet_id`
- `current_tp`
- `current_stars`
- `deployment_tp`
- `combat_tp`
- `operation_tp`
- `target_stars`
- `command_state` (`attack`, `preload`, `hold`, `deploy`, `stop`)
- `command_message`
- `locked_by_officer`
- `observed_at`

### `guild_tb_member_actions`
Durable member task queue generated from the event plan.

- `event_id`
- `phase`
- `ally_code`
- `action_type` (`operation`, `combat`, `special`, `fleet`, `deploy`, `acknowledge`)
- `planet_id`
- `mission_id`
- `operation_slot_id`
- `priority`
- `status` (`pending`, `acknowledged`, `completed`, `skipped`, `blocked`)
- `recommended_team_id`
- `deployment_target_tp`
- `explanation`
- `generated_from_fingerprint`
- `completed_at`

### `guild_tb_mission_attempts`
Evidence-backed battle history.

- `event_id`
- `phase`
- `planet_id`
- `mission_id`
- `ally_code`
- `team_id`
- `result` (`2_of_2`, `1_of_2`, `0_of_2`, `complete`, `failed`, `skipped`)
- `waves_completed`
- `waves_total`
- `reported_by`
- `report_source` (`member_web`, `officer_web`, `discord`, `import`)
- `notes`
- `created_at`

### `guild_tb_route_plans`
Officer-owned strategy plan.

- `guild_id`
- `name`
- `target_stars`
- `target_bonus_zones`
- `risk_mode` (`safe`, `balanced`, `aggressive`)
- `active`
- `created_by`
- `created_at`
- `updated_at`

### `guild_tb_route_plan_zones`
Per-phase target behavior.

- `route_plan_id`
- `phase`
- `planet_id`
- `target_stars`
- `max_stars`
- `preload_cap_tp`
- `deploy_allowed`
- `combat_allowed`
- `operation_priority`
- `notes`

### `guild_tb_phase_snapshots`
Immutable summary snapshots for projection and post-TB analysis.

- `event_id`
- `phase`
- `snapshot_at`
- `guild_gp`
- `zone_state_json`
- `member_completion_json`
- `operations_json`
- `projected_stars`
- `projection_inputs_json`
- `input_fingerprint`

## Non-negotiable data rules

- Reference map data is never labeled as live event state.
- Officer-entered state is visibly labeled as officer-entered until a canonical live source can verify it.
- Every optimizer result stores an input fingerprint.
- Historical attempt statistics never generate a percentage until a minimum sample threshold is met.
- Community recommendations remain separate from verified entry legality.
- All live Guild calculations require full current Guild hydration or fail closed.

---

# 3. Core service modules

Use server-side reusable services first, then expose website/Discord adapters.

| Service | Responsibility |
| --- | --- |
| `tb-event-state-service.mjs` | Read/write active event, phase, zone state and freshness |
| `tb-member-action-service.mjs` | Build ordered per-member task queues |
| `tb-war-room-service.mjs` | Aggregate event KPIs and blockers |
| `tb-route-optimizer.mjs` | Compute safe preload/star route recommendations |
| `tb-projection-service.mjs` | Deterministic TP/star projection from known inputs |
| `tb-attempt-history-service.mjs` | Store/query mission result history |
| `tb-operations-impact-service.mjs` | Connect Operation completion to affected missions/zones |
| `tb-guild-mission-matrix-service.mjs` | Guild-wide mission readiness matrix |
| `tb-development-impact-service.mjs` | Extend existing farming with star/currency/mission impact |
| `tb-simulator-service.mjs` | Isolated what-if state without changing the active plan |
| `tb-notification-service.mjs` | Generate web feed / Discord-ready alerts from canonical event state |

Existing mission, roster, Operations, Journey, publication and Discord services remain authoritative dependencies.

---

# 4. Build sequence

## Milestone A — TB Event State Foundation

**Goal:** create one authoritative event object that the rest of TB 2.0 can consume.

### Build

- Create migrations for event, zone-state, route-plan, member-action, attempt and snapshot tables.
- Add `tb-event-state-service.mjs`.
- Add active-event resolution to `/guild/tb`.
- Add officer controls for:
  - current phase;
  - phase end time;
  - current zone TP/stars;
  - temporary command state;
  - target route plan.
- Display source/freshness labels beside every live-state field.
- Persist immutable snapshots whenever materially relevant event state changes.

### Acceptance

- An officer can create/select one active ROTE event.
- Refreshing the page does not lose phase/zone/command state.
- Historical/reference map values cannot silently overwrite active event state.
- Every downstream service can request a single normalized event-state object.

---

## Milestone B — `TODAY IN TB` Member Task Queue

**Goal:** normal members should not need to study the entire officer interface.

### Task ordering

Default order:

1. mandatory/high-scarcity Operations assignment;
2. special missions and unlock missions;
3. combat/fleet missions with ready recommended squads;
4. remaining approved missions;
5. deployment instruction;
6. acknowledgement/completion cleanup.

### UI card example

```text
#1 OPERATION
Donate: Grand Inquisitor R8
Planet: Haven
Status: READY
[OPEN OPERATIONS] [MARK COMPLETE]

#2 COMBAT — REEK
Recommended: ROTE-P2-GEO-REEK-SEE-WAT
Roster fit: 5/5
Officer command: ATTACK
[VIEW TEAM] [LOAD SQUAD] [OPEN MISSION]

#3 DEPLOY
Deploy 8.42M GP to Bracca
DO NOT DEPLOY GEONOSIS
[VIEW MAP] [MARK DONE]
```

### Build

- Add `/guild/tb/today`.
- Generate tasks from active event + route plan + Operations assignments + mission readiness.
- Add large touch-safe actions.
- Add `ACKNOWLEDGED`, `DONE`, `BLOCKED` states.
- Deep-link mission cards into the existing planet mission inspector and Squad Workbench.
- Add optional `/tb me` Discord summary using the same generated task queue.

### Acceptance

- A linked Guild member sees only their own actionable queue by default.
- No officer-only controls appear for regular members.
- A member can complete the phase using the queue without navigating every TB tool.
- Task regeneration is deterministic for the same event/roster fingerprint.

---

## Milestone C — Officer TB War Room

**Goal:** one screen for event health and intervention.

### Top-line KPIs

- current phase and time remaining;
- current stars;
- deterministic projected stars;
- TP required for next planned star;
- remaining approved combat TP;
- remaining deployment capacity;
- Operations completion;
- special-mission attempts/completions;
- members not acknowledged;
- members with unfinished assignments;
- stale Guild-data warning.

### Command panels

- **CRITICAL NOW** — blockers that can cost the route;
- **MEMBERS TO CHASE** — pending high-impact actions;
- **ZONE ORDERS** — ATTACK / PRELOAD / HOLD / DEPLOY / STOP;
- **OPERATIONS SHORTAGES** — unfilled or unsafe slots;
- **MISSION OPPORTUNITY** — ready players who have not attempted valuable missions.

### Build

- Make `/guild/tb` the officer War Room landing screen.
- Keep existing map/Operations/farming tools as tabs/subroutes.
- Add deterministic projection from known TP, remaining legal mission capacity and deployment capacity.
- Do not expose probability language until attempt-history sample requirements are met.

### Acceptance

- An officer can identify the current top 5 TB risks within one screen.
- Every KPI is traceable to a source or stored event field.
- No hidden universal score is used for prioritization.

---

## Milestone D — Star Route + Preload Optimizer

**Goal:** translate Guild capability into explicit zone orders.

### Inputs

- current Guild GP/deployment capacity;
- active phase and zone TP;
- zone star thresholds;
- remaining mission/fleet/special TP;
- Operations expected TP;
- officer target stars;
- target bonus unlocks;
- allowed risk mode;
- members unavailable/ignored;
- reserved mission-critical units where relevant.

### Outputs

For every zone:

- target stars;
- maximum safe TP before accidental star;
- preload amount remaining;
- deploy allowed/blocked;
- combat allowed/blocked;
- exact short officer command;
- explanation of why that order protects the route.

### Map states

- green: `ATTACK`
- blue: `DEPLOY`
- amber: `PRELOAD`
- gray: `HOLD`
- red: `STOP`

Color must never be the only state indicator; always pair it with text/iconography.

### Acceptance

- The optimizer never recommends crossing an officer-defined preload cap.
- Manual officer overrides are preserved and visibly distinct.
- Re-running the optimizer cannot silently overwrite locked officer commands.
- The plan explains the limiting constraint for every unmet star target.

---

## Milestone E — Mission Attempt History + Guild Evidence

**Goal:** replace anecdotal team advice with our own accumulating evidence.

### Member reporting UX

At the end of each mission card:

- `2/2`
- `1/2`
- `0/2`
- `FAILED`
- `SKIPPED`

Team used is prefilled from the loaded/recommended squad where possible.

### Statistics layers

Every recommendation can eventually show:

- **COMMUNITY REFERENCE** — sourced external recommendation;
- **YOUR GUILD** — recorded Guild attempt history;
- **YOU** — personal historical results.

Example after adequate data:

```text
ROTE-P2-GEO-REEK-SEE-WAT
Guild history: 43 attempts
2/2: 39
1/2: 3
0/2: 1
Last 5 attempts: 5 successful
```

Do not label this a win probability unless the statistical model and minimum sample policy are explicitly implemented.

### Acceptance

- Duplicate reporting for the same member/mission/event is prevented or explicitly versioned.
- Officers can correct a mistaken report with audit history.
- Recommendations with no Guild history clearly remain community/reference-only.

---

## Milestone F — Operations Impact Graph

**Goal:** make Operations strategically understandable, not just assignable.

### Features

- Selecting an Operation highlights affected missions/zones.
- Selecting a mission shows Operations that affect it.
- Show `Operations affecting this battle: X/Y complete`.
- Show missing slots and assigned donor without exposing officer-only private controls to normal members.
- Add **MISSION SAFETY IMPACT** if donating a unit conflicts with a planned mission team.

### Acceptance

- A member can understand why an Operation donation matters.
- An officer can see when an assignment consumes a mission-critical unit.
- Existing scarcity/reserve protections remain authoritative.

---

## Milestone G — Guild Mission Matrix

**Goal:** answer “Who can do this?” instantly.

### Matrix dimensions

Rows: Guild members.

Columns/filter dimensions:

- mission entry ready;
- recommended squad ready;
- mandatory unit missing;
- relic shortfall;
- mod/speed warning where sourced;
- assigned to Operation conflict;
- unavailable/ignored;
- attempt already recorded;
- personal historical success count.

### Officer actions

- filter `READY + NOT ATTEMPTED`;
- filter `1 UPGRADE AWAY`;
- filter `MISSING ONLY <UNIT>`;
- open member Command profile;
- create a farm campaign from selected blockers;
- publish targeted reminder to linked members.

### Acceptance

- Mission readiness is generated from canonical mission rules.
- Recommended-team readiness is shown separately from entry readiness.
- No member is labeled unable merely because they lack one community recommendation if another legal team may exist.

---

## Milestone H — TB Development / Farm ROI Engine v2

**Goal:** extend the existing excellent farming system from “mission impact” into “Guild TB outcome impact.”

### Add explainable impact fields

- missions newly unlocked for this member;
- special mission/unlock opportunity created;
- Operations scarcity relieved;
- number of route-plan phases affected;
- tracked Journey overlap;
- number of Guild members already covering the same requirement;
- upgrade distance/cost class;
- target-star plan relevance.

### New officer workflow

**Guild Farm Campaign**

Officer selects target:

- increase Reva attempts;
- unlock Zeffo more reliably;
- unlock Mandalore;
- reach target star count;
- eliminate a specific Operation shortage.

The engine produces an explainable member/unit campaign. Members can **ACKNOWLEDGE**, **COMMIT**, or **DECLINE / NOT PLANNED**.

### Acceptance

- No opaque universal farm score.
- Every recommendation states exactly which Guild objective it improves.
- Existing tracked Journey goal logic remains reusable and visible.

---

## Milestone I — What-If Simulator

**Goal:** let officers experiment without mutating the active plan.

### Scenarios

- 5 members unavailable in P5;
- Operation 4 does not complete;
- 35 instead of 40 Reva attempts;
- preload one zone instead of taking a star;
- add/remove 100M deployment GP;
- selected members reach planned relic upgrades;
- target 31★ vs 32★;
- Mandalore or Zeffo path enabled/disabled.

### UX

Simulator clearly shows:

```text
ACTIVE EVENT: untouched
SIMULATION: modified assumptions
DIFFERENCE: +1 star / -72M TP / 4 additional farms required
```

### Acceptance

- Simulator writes no active event state.
- Every changed assumption is visible and resettable.
- Output uses the same deterministic route/projection services as the War Room.

---

## Milestone J — Automation + Notifications

**Goal:** reduce officer chasing without making Discord mandatory.

### Triggers

- phase starts;
- phase ending soon;
- member has high-priority incomplete task;
- Operations shortage becomes critical;
- route command changes from ATTACK to STOP;
- new assignment preview becomes publish-ready;
- Guild data is stale before scheduled planning run.

### Delivery adapters

1. website Command Feed;
2. optional Discord Guild channel;
3. optional linked-member DM;
4. future push/mobile.

### Safety

- notification deduplication key;
- delivery receipts;
- no repeated spam after acknowledgement;
- officer-configured quiet hours;
- route STOP alerts may override normal batching if explicitly enabled;
- scheduled planning forces a current Guild refresh before generating/publishing assignments.

---

# 5. API plan

Keep APIs thin over reusable services.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/guild/tb/active` | normalized active event state |
| `POST /api/guild/tb/events` | create/select event |
| `PATCH /api/guild/tb/events/:id/zones/:planetId` | officer zone-state update |
| `GET /api/guild/tb/today/:allyCode` | member task queue |
| `POST /api/guild/tb/actions/:actionId/ack` | acknowledge action |
| `POST /api/guild/tb/actions/:actionId/complete` | complete action |
| `POST /api/guild/tb/attempts` | report battle result |
| `GET /api/guild/tb/war-room` | officer aggregate |
| `POST /api/guild/tb/route/preview` | compute route without changing active plan |
| `POST /api/guild/tb/route/apply` | confirmed officer apply |
| `GET /api/guild/tb/matrix/:missionId` | Guild mission matrix |
| `POST /api/guild/tb/simulate` | isolated what-if run |

All write endpoints require verified account + current Guild officer authorization where applicable.

---

# 6. UI/UX design standard

## Member mode

- one-column task queue on mobile;
- large thumb-friendly buttons;
- minimum jargon until the detail drawer is opened;
- always show planet + enemy/mission + required action;
- one primary action per card;
- completion progress at top: `4 of 6 tasks complete`;
- no officer planning controls.

## Officer mode

- dense desktop War Room;
- sticky phase/time/source-freshness header;
- critical alerts first;
- map remains visually central;
- filters stay persistent across navigation;
- bulk actions always preview before publish/apply;
- every projection has an explanation drawer.

## Tactical mission drawer

Extend the current mission inspector in this order:

1. officer command;
2. enemy/encounter;
3. personal entry status;
4. recommended team fit;
5. squad preset/load button;
6. Operations impact;
7. mechanics/kill-order/mod guidance;
8. Guild history;
9. personal history;
10. source/evidence detail.

The default collapsed view must remain quick to scan even as detail expands.

---

# 7. Projection policy

## Deterministic projection v1

Allowed inputs:

- known current TP;
- known star thresholds;
- remaining legal mission rewards;
- remaining fleet/special rewards;
- known Operations reward plan;
- current Guild deployment capacity;
- explicit unavailable members;
- officer route constraints.

Output:

- minimum committed TP;
- maximum known available TP;
- target star reachable/not reachable under current assumptions;
- exact shortfall if not reachable.

## Historical projection v2

Only after mission-attempt history has accumulated:

- use observed Guild completion rates by mission/team;
- publish sample size beside every derived rate;
- require a documented minimum sample threshold;
- do not turn small-sample history into a fake precise probability.

---

# 8. Testing strategy

## Unit tests

- route optimizer preload caps;
- target-star shortfall calculation;
- member action priority ordering;
- mission-attempt aggregation;
- mission matrix legality separation;
- Operations conflict detection;
- simulator isolation;
- notification deduplication.

## Contract tests

- all 20 ROTE planets resolve;
- event-state planet IDs match canonical map IDs;
- zone thresholds match current ROTE data source layer;
- mission IDs remain canonical;
- recommended squad IDs never replace mission entry rules.

## Authorization tests

- members cannot edit Guild route state;
- officers cannot mutate another Guild;
- regular members cannot access officer-only assignment details;
- attempt correction requires authorized actor/audit record;
- Discord publication still requires verified destination.

## Browser tests

- mobile Today Queue completion flow;
- officer War Room → route preview → confirmed apply;
- mission card → load squad → report attempt;
- Operations assignment → task queue reflection;
- stale source warning and fail-closed behavior.

---

# 9. Release gates

## TB 2.0 Alpha

Ship after Milestones A + B + C.

Definition:

- active event state;
- Today in TB;
- officer War Room;
- existing map/Operations/farming linked into the new flow.

## TB 2.0 Beta

Add D + E + F + G.

Definition:

- star/preload optimizer;
- mission attempt history;
- Operations impact graph;
- Guild mission matrix.

## TB 2.0 Pro

Add H + I + J.

Definition:

- Guild farm campaigns;
- what-if simulator;
- scheduled/conditional notifications and planning automation.

---

# 10. First implementation slice

Do **not** begin with the simulator or predictive statistics. The first code slice should be:

```text
1. guild_tb_events + guild_tb_zone_states + guild_tb_member_actions migrations
2. tb-event-state-service.mjs
3. tb-member-action-service.mjs
4. /api/guild/tb/active
5. /api/guild/tb/today/:allyCode
6. /guild/tb/today member UI
7. War Room shell on /guild/tb
8. existing ROTE map/Operations links wired into the new event context
9. tests for authorization, source freshness and task ordering
```

This gives immediate visible value while establishing the data model needed by every later feature.

---

# 11. Definition of success

TB 2.0 is successful when:

- a normal member can open one screen and know exactly what to do;
- an officer can see event health and blockers without cross-referencing several tools;
- preload/stop/deploy commands are generated from an explicit route plan rather than memory;
- mission recommendations become increasingly informed by the Guild's own recorded history;
- Operations, combat missions, farming and deployment are treated as one connected planning problem;
- Guild improvement recommendations state exactly which future TB objective they advance;
- Discord is useful but never required to operate the product;
- every claim remains traceable to canonical game data, officer state, community reference, or recorded Guild evidence.
