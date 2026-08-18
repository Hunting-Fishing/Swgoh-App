# SWGOH Command Center — Web-First Build Progress & Dual-Use Roadmap

Last updated: 2026-08-19

## Product rule

SWGOH Command Center is the primary application. Discord is an optional identity, notification, and publication integration.

Every useful command-style capability should be designed as a reusable Command Center function first:

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

## Current implementation baseline

### Guild / Operations

- [x] Canonical persisted Guild roster
- [x] Guild Command Center routes
- [x] Guild members and individual member Command profiles
- [x] ROTE/TB mission coverage and mission-impact farming queue
- [x] TB Farming Guide with Journey / GL / Fleet overlap
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
- [x] Execute and publish are separate operations
- [x] Durable `web_action_runs`
- [x] Durable `web_action_publications`
- [x] Player Command Feed
- [x] Guild Command Feed
- [x] Optional verified Discord publication
- [x] Raid Max / `/raid max` / `/raidmax` as first website-native action

### Historical Guild Intelligence

- [x] 29/29 workbook modules accounted for
- [x] 0 source-pending workbook modules
- [x] Guild/member historical archive
- [x] Ticket/Raid/ROTE/Reva historical trend tables
- [x] GL/Inquisitor milestone archive
- [x] ROTE/EchoBase platoon reference archive

## Dual-use command migration rule

When reproducing functionality from EchoBase, WookieeBot, C-3PO Bot, SWGoHBot, Omegabot, DSRBot, HotUtils, EchoStation, SWGoH Event Bot, or similar tools:

1. Identify the actual game/business function behind the slash command.
2. Implement that function in a reusable service/model.
3. Add a website action or normal clickable Guild/Player UI.
4. Add optional Player/Guild publication where useful.
5. Add Discord delivery only as an adapter to the same result.
6. Keep scheduling as another adapter to the same function.
7. Do not duplicate logic separately in Discord and the website.

## Website action roadmap

### Raid action pack

- [x] Raid Max — roster-based non-overlapping Order 66 attempt planner
- [ ] Raid Roster — eligible roster and progression bands
- [ ] Raid Teams — selectable/optimized teams by strategy profile
- [ ] Raid Readiness — progression/mod readiness and missing requirements
- [ ] Raid Score / History — historical performance and current run comparison
- [ ] Guild Raid Report — member participation, score, readiness and farm needs
- [ ] Website result -> Player Page / Guild Page / Discord

### Territory Battle / ROTE action pack

- [x] Mission coverage
- [x] Mission-impact upgrade queue
- [x] Operations assignment engine
- [x] Member availability / ignores / reserves
- [x] TB Roster Farming Guide with Journey overlap — v1 read-only Guild page
- [ ] Personal TB Farm Plan in Action Center
- [ ] Guild-wide farm campaign / officer target list
- [ ] Farm acknowledgements / member commitments
- [ ] Phase readiness report
- [ ] Mission assignment report
- [ ] Platoon/Operations readiness report
- [ ] TB report publication to Player Page / Guild Page / Discord

### Territory War action pack

- [ ] Defense builder
- [ ] Offense roster allocator
- [ ] Opponent scouting
- [ ] Counter recommendations
- [ ] Datacron-aware recommendations
- [ ] Member assignment sheets
- [ ] Guild publication / optional Discord delivery

### Farming / Journey action pack

- [x] Journey presets and Journey Map
- [x] Player farming tools
- [ ] Cross-mode Farm Value engine
- [x] Journey overlap classification v1
- [x] TB + Journey overlap v1
- [ ] TW + Journey overlap
- [ ] Raid + Journey overlap
- [ ] Ship / Fleet cross-mode overlap beyond Journey prerequisites
- [ ] Multi-goal farm optimizer
- [ ] Guild-recommended farm campaigns

## Current checkpoint — TB Farming Guide v1

Implemented on the `feat/guild-tb-farming-overlap-guide` build:

- [x] Dedicated `/guild/tb/farming` Guild page
- [x] Persistent **TB Farming** navigation entry across Guild Command
- [x] TB Command callout linking to the guide
- [x] Guild Overview card linking to the guide
- [x] Uses the existing exact ROTE mission-coverage engine
- [x] Uses the existing Journey preset requirement graph
- [x] Joins systems by SWGOH Base ID
- [x] Member-specific recommendation rows
- [x] Defaults to the loaded member when that member exists in the Guild roster
- [x] All-Guild / individual-member filtering
- [x] Phase filtering
- [x] Mandatory vs selectable-pool filtering
- [x] Search by member, unit, mission or Journey target
- [x] TB-impact sorting
- [x] Journey-overlap sorting
- [x] Closest-upgrade sorting
- [x] **DIRECT DOUBLE-USE** classification
- [x] **PARTIAL DOUBLE-USE** classification
- [x] **MULTI-UNLOCK** classification
- [x] **TB ONLY** classification
- [x] Already-satisfied Journey prerequisites are shown but do not count as new double-use value
- [x] Gear/star progress can count as partial progress toward a later relic prerequisite
- [x] Player Farm-tool deep link
- [x] Guild Unit Ownership deep link
- [x] No Discord dependency for reading or using the guide
- [x] No new database migration

Still future work:

- [ ] Rank overlaps using the member's personally tracked Journey targets
- [ ] Personal **TB Farm Plan** website action
- [ ] Save/share a TB Farm Plan to Player Command Feed
- [ ] Publish member/guild TB farm plans to Guild Command Feed
- [ ] Optional `/tb farms` Discord adapter using the same model
- [ ] Officer-created Guild farm campaigns
- [ ] Member acknowledge / commit / complete workflow
- [ ] Material-cost and ETA estimates only after trustworthy resource-cost evidence is integrated

## Feature design — TB Roster Farming Guide

### Goal

Give every Guild member an easy answer to:

> "What should I farm for Territory Battles, and which of those farms also advance a Journey Guide, Galactic Legend, capital ship, or other major unlock?"

This feature belongs in **Guild Command -> Territory Battles** and must be readable by normal Guild members, not only officers.

### Canonical inputs

Do not maintain a separate manual farm list.

The guide joins two existing data systems by SWGOH Base ID:

1. **TB Mission Impact**
   - `buildGuildRoteMissionCoverage(...)`
   - exact verified ROTE mission entry requirements
   - member-specific farm gaps
   - mandatory mission impact
   - selectable-pool impact
   - mission/phase references

2. **Journey Requirement Graph**
   - `JOURNEY_PRESETS`
   - Galactic Legends
   - Journey Guide characters
   - Journey Guide fleets / capital ships
   - advanced Journey events
   - required unit and required star/gear/relic target

### Required row model

Each farm recommendation should support:

```text
Member
Unit
Current progression
TB target / gap
TB mission impact count
Mandatory mission count
Pool-option mission count
Affected TB phases / planets / missions
Journey overlap count
Journey targets using this unit
Required Journey level for each target
Double-use indicator
```

Example presentation:

```text
Aayla Secura
Member: Example Player
TB: upgrade to R7 for 2 verified ROTE mission entries
Journey overlap:
  - Jedi Master Kenobi -> Aayla Secura R3

Result: farming Aayla to the TB target also completes/exceeds the JMK requirement.
```

The application must calculate the overlap from Base IDs and requirement tiers. Examples are explanatory only; displayed results must come from the current versioned data.

### Double-use classifications

A TB farm can be classified as:

- **DIRECT DOUBLE-USE** — TB target reaches or exceeds a Journey requirement.
- **PARTIAL DOUBLE-USE** — TB farm advances the unit toward a higher Journey requirement but does not finish it.
- **MULTI-UNLOCK** — the same unit is required by more than one Journey/GL/Fleet target.
- **TB ONLY** — no current active Journey preset overlap.

An already-satisfied prerequisite may still be displayed as context, but it must not be counted as new double-use value from the proposed TB farm.

Do not imply that a Journey character itself is unlocked only by upgrading one prerequisite. The UI should say the farm **advances** or **satisfies that prerequisite**, not that it automatically unlocks the Journey target.

### Guild view

The Guild TB Farming Guide should provide:

- All Guild recommendations
- Member selector
- default focus on the loaded/verified member when possible
- search by member/unit/Journey target
- filters for phase
- filters for mandatory vs pool impact
- filter for Journey overlap only
- sort by TB impact
- sort by double-use value
- Journey overlap chips on each row
- direct links to the existing player Farm/Journey tools
- direct links to Guild unit ownership

### Member view

A member should be able to see:

- their own TB farm queue
- which farm helps the Guild most
- which farm also advances Journey goals
- current -> TB target
- current -> Journey requirement
- whether the TB target satisfies the Journey prerequisite
- mission(s) affected by the TB upgrade

Future enhancement: combine the member's tracked Journey targets with the Guild TB queue so farms for Journeys the player actually tracks rank above unrelated overlaps.

### Officer view

Future officer layer:

- aggregate farms by unit
- number of members near-ready
- cheapest member to raise for coverage
- redundancy target impact
- choose a Guild farm campaign
- assign/request a farm to selected members
- member acknowledgement / committed / completed states
- due date / target phase
- publish campaign to Guild Command Feed
- optional Discord delivery

### Ranking model — future

Do not create a fake universal score without explainable components.

A future ranking can expose separate dimensions:

```text
TB impact
Gap cost
Redundancy value
Journey overlap count
Journey prerequisite completion
Tracked Journey relevance
Raid overlap
TW overlap
```

A composite "Best Value" sort may be added only if the individual component values remain visible and the weighting is documented.

## Future feature — Cross-Mode Farm Value

The TB/Journey overlap guide is the first example of a broader system.

For any unit farm, Command Center should eventually answer:

> "If I invest in this unit, what else does it help?"

Potential overlap dimensions:

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

This engine should be reusable by both website actions and Discord-style commands.

Possible future command aliases:

```text
/farm value
/farm overlap
/tb farms
/tb farm @member
/journey overlap <unit>
```

These aliases must call the same web-first service used by normal website buttons.

## Data-quality rules

- Real/canonical roster data only; no mock player or Guild output.
- Static game definitions may be versioned in GitHub and refreshed with game updates.
- Use Base IDs as the primary cross-system join key.
- Exact TB mission claims only where mission evidence is verified.
- Partial/gate-only fleet evidence must remain visibly partial.
- Journey overlap means a prerequisite relationship, not a guaranteed unlock.
- Do not fabricate material cost, farming time, raid damage, TW value, or unlock probability when evidence is unavailable.

## UX rule

A normal Guild member should not need to know a slash command.

Preferred flow:

```text
Guild Command
  -> Territory Battles
     -> TB Farming Guide
        -> Select My Name
        -> See Guild-impact farms
        -> See Journey overlap
        -> Open Farm tools / Guild unit ownership
        -> optionally Share to Guild / Player / Discord (future)
```

## Near-term build order

1. [x] TB Farming Guide read-only Guild page using existing TB farms + Journey presets.
2. [x] Member filter and loaded-player focus.
3. [x] Direct/partial/multi-unlock overlap classification.
4. [x] Deep links to Player Farm tools and Guild Unit Ownership.
5. [ ] Add website Action Center entry for personal TB Farm Plan.
6. [ ] Add Guild Command Feed publication.
7. [ ] Add optional Discord `/tb farms` adapter using the same model.
8. [ ] Add officer farm campaigns/assignments only after the read model is stable.

## Completion definition for the TB Farming Guide v1 milestone

- [x] Guild Command exposes a visible TB Farming Guide entry.
- [x] The guide uses current Guild roster data.
- [x] TB farm recommendations come from the existing exact mission-coverage engine.
- [x] Journey overlaps come from the existing Journey preset graph.
- [x] Rows are member-specific.
- [x] Users can filter to a specific member.
- [x] Users can identify direct vs partial Journey overlap.
- [x] Multi-unlock overlap is visible.
- [x] No Discord account is required to read/use the website guide.
- [x] No separate mock/manual recommendation list exists.
