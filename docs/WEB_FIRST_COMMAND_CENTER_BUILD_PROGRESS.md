# SWGOH Command Center — Web-First Build Progress & Dual-Use Roadmap

Last updated: 2026-08-19

## Product rule

SWGOH Command Center is the primary application. Discord is an optional identity, notification, and publication integration.

Every useful command-style capability should be implemented as a reusable Command Center function first:

```text
Canonical Command Center function
        |
        +-- Website button / form
        +-- Player page
        +-- Guild page
        +-- Discord slash command
        +-- Scheduled automation
        +-- Future mobile surface
```

A Discord command must not be the only way to use a feature unless the operation is inherently Discord-specific.

When reproducing EchoBase, WookieeBot, C-3PO Bot, SWGoHBot, Omegabot, DSRBot, HotUtils, EchoStation, SWGoH Event Bot, or similar functionality:

1. Identify the actual game/business function behind the command.
2. Implement the reusable service/model once.
3. Add a normal website action or Guild/Player UI.
4. Add Player/Guild publication when useful.
5. Add Discord only as an adapter to the same result.
6. Add scheduling/mobile as additional adapters.
7. Never duplicate the core logic separately for Discord and the website.

## Current implementation baseline

### Guild / Operations

- [x] Canonical persisted Guild roster
- [x] Guild Command Center routes
- [x] Guild members and individual member Command profiles
- [x] ROTE/TB mission coverage and mission-impact farming queue
- [x] TB Roster Farming Guide with Journey overlap
- [x] Personal TB Farm Plan website action
- [x] ROTE Operations assignment tooling
- [x] Guild member Operations control drawer
- [x] GIVE / KEEP preferences
- [x] Availability / timed ignores
- [x] Hard-reserve visibility
- [x] Scheduled planner-run visibility
- [x] Discord Guild binding and verified destinations
- [x] Manual Discord <-> SWGOH player linking
- [x] Guild integration intelligence
- [x] Guild/player language preferences
- [x] Safe Guild unregister lifecycle

### Web-first Action Center

- [x] `/actions` authenticated website workspace
- [x] Reusable action registry
- [x] Generic registry-driven integer/select action controls
- [x] Execute and publish are separate operations
- [x] Durable `web_action_runs`
- [x] Durable `web_action_publications`
- [x] Player Command Feed
- [x] Guild Command Feed
- [x] Optional verified Discord publication
- [x] Raid Max / `/raid max` / `/raidmax` as website-native action
- [x] Personal TB Farm Plan / future `/tb farms` / `/tb farm` aliases as website-native action

### Historical Guild Intelligence

- [x] 29/29 workbook modules accounted for
- [x] 0 source-pending workbook modules
- [x] Guild/member historical archive
- [x] Ticket/Raid/ROTE/Reva historical trend tables
- [x] GL/Inquisitor milestone archive
- [x] ROTE/EchoBase platoon reference archive

## Current checkpoint — TB Farming Guide v1

Guild Command exposes `/guild/tb/farming` as a normal member-readable website page.

Implemented:

- [x] Persistent **TB Farming** Guild navigation
- [x] TB Command callout
- [x] Guild Overview capability card
- [x] Existing exact ROTE mission-coverage engine reused
- [x] Existing Journey preset graph reused
- [x] SWGOH Base ID is the cross-system join key
- [x] Member-specific recommendation rows
- [x] All-Guild and individual-member filters
- [x] Phase / mandatory / selectable-pool filters
- [x] Search by member, unit, mission, or Journey target
- [x] TB-impact / Journey-overlap / closest-upgrade sorting
- [x] **DIRECT DOUBLE-USE**
- [x] **PARTIAL DOUBLE-USE**
- [x] **MULTI-UNLOCK**
- [x] **TB ONLY**
- [x] Already-satisfied prerequisites do not count as new double-use value
- [x] Gear/star advancement can count as partial progress toward a later relic prerequisite
- [x] Player Farm-tool deep link
- [x] Guild Unit Ownership deep link
- [x] No Discord requirement

Truth boundary:

> Journey overlap means the proposed TB farm advances or satisfies a prerequisite. It does **not** mean one prerequisite automatically unlocks the Journey target.

## Current checkpoint — Personal TB Farm Plan v1

The TB/Journey model is now reusable from the authenticated Action Center.

### Execution

- [x] Action key: `tb-farm-plan`
- [x] Website label: **TB Farm Plan**
- [x] Future command aliases reserved: `/tb farms`, `/tb farm`
- [x] Verified website identity required
- [x] Active Guild membership required
- [x] Discord is **not** required to execute
- [x] Execution does not publish automatically
- [x] Result is saved privately to `web_action_runs`
- [x] Existing `web_action_publications` is reused for optional sharing
- [x] No new database table/migration required

### Canonical Guild-impact calculation

A Personal TB Farm Plan is not calculated from the member roster in isolation.

It uses the current Guild baseline so its statement that a farm helps the Guild has real redundancy context:

```text
Verified website player
       |
       +-- canonical current Guild member list
       +-- one batched current-Guild player_units_current read
       +-- canonical static game-unit catalog
       +-- verified ROTE mission rules
       +-- Journey preset requirement graph
       |
       +-- member-specific TB Farm Plan
```

Safety rules:

- [x] Full current Guild hydration is required
- [x] Verified player must still be in the current Guild roster
- [x] Current Guild member persistent identities must all be present
- [x] Guild units are loaded with one bounded paged/batched read rather than one server request per member
- [x] Each member's returned owned-unit count is compared with the expected character + ship count
- [x] A truncated member roster fails closed instead of understating Guild redundancy
- [x] Static definitions come from the canonical game-unit catalog

This batching decision is important for the intended multi-user scale of Command Center.

### Member controls

The normal website form supports:

**Prioritize by**

- Guild TB impact
- Journey overlap
- Closest upgrade

**Recommendations**

- minimum 5
- maximum 25
- default 12

The result shows:

- current progression
- TB target
- TB gap
- affected verified TB missions
- mandatory mission impact
- selectable-pool impact
- Journey / GL / Fleet prerequisite overlaps
- direct / partial / multi-unlock / TB-only classification
- Guild exact coverage
- Guild redundancy coverage

No opaque universal farm score is generated.

### Publication

After the action completes, the member can choose:

```text
Keep private
Share to My Player Page
Share to Guild Command Feed
Share to Discord (only when existing Guild officer/verified-destination permission allows it)
```

Implemented:

- [x] Personal TB Farm Plan card in Player Command Feed
- [x] Personal TB Farm Plan card in Guild Command Feed
- [x] Optional compact Discord publication from the same saved result
- [x] Discord mentions disabled by default
- [x] Normal members can use the website action without Discord
- [x] Discord publication retains the existing Officer/Owner + verified-channel gate

The `/tb farms` Discord slash adapter itself remains future work; the aliases currently document the intended dual-use command mapping.

## Website action roadmap

### Raid action pack

- [x] Raid Max — roster-based non-overlapping Order 66 attempt planner
- [ ] Raid Roster — eligible roster and progression bands
- [ ] Raid Teams — selectable/optimized teams by strategy profile
- [ ] Raid Readiness — progression/mod readiness and missing requirements
- [ ] Raid Score / History — historical performance and current-run comparison
- [ ] Guild Raid Report — member participation, score, readiness and farm needs
- [ ] Broader Raid + Journey overlap

### Territory Battle / ROTE action pack

- [x] Mission coverage
- [x] Mission-impact upgrade queue
- [x] Operations assignment engine
- [x] Member availability / ignores / reserves
- [x] TB Roster Farming Guide with Journey overlap
- [x] Personal TB Farm Plan in Action Center
- [x] Personal TB Farm Plan -> Player Page
- [x] Personal TB Farm Plan -> Guild Command Feed
- [x] Personal TB Farm Plan -> optional officer Discord delivery
- [ ] `/tb farms` Discord slash adapter using the same service/model
- [ ] Guild-wide farm campaign / officer target list
- [ ] Farm acknowledgement / member commitment workflow
- [ ] Phase readiness website action/report
- [ ] Mission assignment website report
- [ ] Platoon/Operations readiness website report

### Territory War action pack

- [ ] Defense builder
- [ ] Offense roster allocator
- [ ] Opponent scouting
- [ ] Counter recommendations
- [ ] Datacron-aware recommendations
- [ ] Member assignment sheets
- [ ] TW + Journey farm overlap
- [ ] Player/Guild publication and optional Discord adapter

### Farming / Journey action pack

- [x] Journey presets and Journey Map
- [x] Player farming tools
- [x] Journey overlap classification v1
- [x] TB + Journey overlap v1
- [ ] Cross-Mode Farm Value engine across all supported modes
- [ ] Personally tracked Journey weighting
- [ ] TW + Journey overlap
- [ ] Raid + Journey overlap
- [ ] Ship / Fleet cross-mode overlap beyond Journey prerequisites
- [ ] GAC investment overlap
- [ ] Multi-goal farm optimizer
- [ ] Guild-recommended farm campaigns

## Future feature — Cross-Mode Farm Value

The TB/Journey guide is the first implementation of the broader question:

> **If I invest in this unit, what else does it help?**

Future dimensions:

- ROTE/TB missions
- ROTE Operations/platoons
- Journey Guide
- Galactic Legends
- capital ships / fleets
- current Raid
- TW offense/defense
- GAC teams/counters
- Assault Battles / recurring events
- Conquest feats when versioned evidence exists

Potential website actions / future command aliases:

```text
/farm value
/farm overlap
/tb farms
/tb farm @member
/journey overlap <unit>
```

These aliases must call the **same web-first service** used by normal website buttons.

## Data-quality rules

- Real/canonical roster data only; no mock player or Guild output.
- Static game definitions may be versioned in GitHub and refreshed with game updates.
- Base IDs are the primary cross-system join key.
- Exact TB mission claims only where mission evidence is verified.
- Gate-only/partial evidence remains visibly partial and cannot create stronger claims.
- Journey overlap is prerequisite progress, not a guaranteed unlock.
- Do not fabricate material cost, ETA, farming time, raid damage, TW value, GAC value, or unlock probability without trustworthy evidence.
- Do not invent an opaque "best" score unless the visible component weights are documented.

## Member UX target

A normal Guild member should not need to know slash syntax.

```text
Guild Command
  -> Territory Battles
     -> TB Farming Guide

or

Action Center
  -> TB Farm Plan
     -> Prioritize by Guild TB impact / Journey overlap / closest upgrade
     -> Run privately
     -> Review recommendations
     -> Keep private OR Share to Player / Guild / optional Discord
```

## Near-term build order

1. [x] Guild TB Farming Guide.
2. [x] Member filter and loaded-player focus.
3. [x] Direct / partial / multi-unlock classification.
4. [x] Deep links to Farm tools / Guild Unit Ownership.
5. [x] Personal TB Farm Plan website action.
6. [x] Player/Guild feed publication for Personal TB Farm Plan.
7. [x] Optional officer Discord publication adapter for the saved result.
8. [ ] Add actual `/tb farms` Discord slash adapter using the same model.
9. [ ] Add personally tracked Journey weighting.
10. [ ] Add officer Guild farm campaigns only after the read/action model remains stable.
11. [ ] Add member acknowledgement / committed / completed workflow.
12. [ ] Add material-cost and ETA estimates only after trustworthy resource-cost evidence is integrated.
