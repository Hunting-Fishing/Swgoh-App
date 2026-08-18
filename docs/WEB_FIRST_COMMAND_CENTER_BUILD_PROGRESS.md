# SWGOH Command Center — Web-First Build Progress & Dual-Use Roadmap

Last updated: 2026-08-19

## Product rule

SWGOH Command Center is the primary application. Discord is an optional identity, notification, and publication integration.

Every useful command-style capability is implemented as a reusable Command Center function first:

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
- [x] Durable verified-account Journey goals
- [x] Personalized TB + tracked-Journey double-use ranking
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
- [x] Durable `user_journey_goals`
- [x] Player Command Feed
- [x] Guild Command Feed
- [x] Optional verified Discord publication
- [x] Raid Max / `/raid max` / `/raidmax` as website-native action
- [x] Personal TB Farm Plan / future `/tb farms` / `/tb farm` aliases as website-native action
- [x] **My Journey Goals** account manager

### Historical Guild Intelligence

- [x] 29/29 workbook modules accounted for
- [x] 0 source-pending workbook modules
- [x] Guild/member historical archive
- [x] Ticket/Raid/ROTE/Reva historical trend tables
- [x] GL/Inquisitor milestone archive
- [x] ROTE/EchoBase platoon reference archive

## Current checkpoint — TB Farming Guide

Guild Command exposes `/guild/tb/farming` as a normal member-readable website page.

Implemented:

- [x] Persistent **TB Farming** Guild navigation
- [x] Existing exact ROTE mission-coverage engine reused
- [x] Existing Journey preset graph reused
- [x] SWGOH Base ID is the cross-system join key
- [x] Member-specific recommendation rows
- [x] All-Guild and individual-member filters
- [x] Phase / mandatory / selectable-pool filters
- [x] TB-impact / Journey-overlap / closest-upgrade sorting
- [x] **DIRECT DOUBLE-USE**
- [x] **PARTIAL DOUBLE-USE**
- [x] **MULTI-UNLOCK**
- [x] **TB ONLY**
- [x] Already-satisfied prerequisites do not count as new double-use value
- [x] Gear/star advancement can count as partial progress toward a later relic prerequisite
- [x] Player Farm-tool and Guild Unit Ownership deep links
- [x] No Discord requirement

Truth boundary:

> Journey overlap means the proposed TB farm advances or satisfies a prerequisite. It does **not** mean one prerequisite automatically unlocks the Journey target.

## Current checkpoint — Personal TB Farm Plan v2: Tracked Goals

The authenticated Action Center now combines current Guild ROTE value with the verified player's own tracked Journey targets.

### Durable goals

Tracked goals are account data, not merely browser state.

```text
Verified Command Center account
       |
       +-- verified SWGOH player
       +-- durable user_journey_goals
       |
       +-- Farm Command
       +-- TB Farm Plan
       +-- future Raid/TW/GAC farm-value actions
```

Implemented:

- [x] Server-only `user_journey_goals` table with RLS enabled
- [x] Account + verified player + Journey event key
- [x] Atomic replace RPC
- [x] Event IDs validated against the versioned `JOURNEY_PRESETS` catalog before write
- [x] Maximum 50 tracked goals
- [x] No anon/authenticated direct table or RPC access
- [x] Action Center **My Journey Goals** manager
- [x] Farm Command syncs the same durable goals for the verified player
- [x] Existing device-local Farm Command goals remain available for non-account or manually loaded other players
- [x] Local goals are never silently uploaded; explicit **Save device goals to my account** handoff
- [x] Manually loading another player's Ally Code cannot mutate the signed-in user's durable goals

### Personalized ranking

TB Farm Plan priority modes:

1. **My tracked Journey goals** — default
2. Guild TB impact
3. Any Journey overlap
4. Closest upgrade

`My tracked Journey goals` ordering is explainable:

```text
tracked goals advanced
  -> tracked prerequisites directly completed
  -> mandatory TB impact
  -> total verified TB mission impact
  -> smaller upgrade gap
  -> unit name tie-break
```

No hidden universal farm score is generated.

Each recommendation can expose:

- `MY GOAL`
- `MY MULTI-GOAL`
- tracked direct prerequisite count
- tracked partial prerequisite count
- tracked Journey targets advanced
- normal Journey overlaps
- verified TB mission impact
- current -> TB target progression

If the verified player has no durable goals, `My tracked Journey goals` **falls back transparently to Guild TB impact** and the result records `fallbackUsed: true`.

### Security boundary

The browser does not send authoritative tracked goal IDs to TB execution.

The server resolves:

```text
signed-in user
 -> verified player
 -> durable goals for that exact user/player
 -> TB Farm Plan
```

A client cannot submit a different goal list in the action payload and have it treated as the saved account preference.

### Canonical Guild-impact calculation

The personal plan still uses the full current Guild baseline so a claim that a farm helps the Guild has real redundancy context:

- [x] full current Guild hydration required
- [x] verified player must still be in current Guild roster
- [x] one bounded batched current-Guild `player_units_current` read
- [x] per-member expected owned-unit count validation
- [x] canonical static game-unit catalog
- [x] verified ROTE mission rules
- [x] Journey preset requirement graph
- [x] truncated Guild/member data fails closed

### Publication

After execution the saved result can be:

```text
Keep private
Share to My Player Page
Share to Guild Command Feed
Share to Discord (existing officer + verified destination gate)
```

Personalized publications identify MY GOAL farms while keeping the same Journey/unlock truth boundary.

The actual `/tb farms` slash adapter remains future work and must call this same model rather than duplicate it.

## Website action roadmap

### Raid action pack

- [x] Raid Max
- [ ] Raid Roster
- [ ] Raid Teams
- [ ] Raid Readiness
- [ ] Raid Score / History
- [ ] Guild Raid Report
- [ ] Raid + tracked Journey cross-mode value

### Territory Battle / ROTE action pack

- [x] Mission coverage
- [x] Mission-impact upgrade queue
- [x] Operations assignment engine
- [x] Member availability / ignores / reserves
- [x] TB Roster Farming Guide with Journey overlap
- [x] Personal TB Farm Plan in Action Center
- [x] Durable tracked Journey goals
- [x] Personalized MY GOALS ranking
- [x] Player Page / Guild Command Feed / optional officer Discord publication
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
- [ ] TW + tracked Journey farm overlap
- [ ] Player/Guild publication and optional Discord adapter

### Farming / Journey action pack

- [x] Journey presets and Journey Map
- [x] Player farming tools
- [x] Durable tracked Journey goals
- [x] Journey overlap classification v1
- [x] TB + Journey overlap v1
- [x] Personally tracked Journey weighting for TB
- [ ] User-controlled ordering/weighting among several tracked Journey goals
- [ ] Cross-Mode Farm Value engine across all supported modes
- [ ] TW + Journey overlap
- [ ] Raid + Journey overlap
- [ ] Ship/Fleet overlap beyond Journey prerequisites
- [ ] GAC investment overlap
- [ ] Multi-goal farm optimizer across TB/Raid/TW/GAC
- [ ] Guild-recommended farm campaigns

## Future feature — Cross-Mode Farm Value

The TB/Journey planner answers the first version of:

> **If I invest in this unit, what else does it help?**

Future dimensions:

- ROTE/TB missions
- ROTE Operations/platoons
- tracked Journey Guide / Galactic Legend goals
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

These aliases must call the **same web-first services** used by normal website buttons.

## Data-quality rules

- Real/canonical roster data only; no mock player or Guild output.
- Static game definitions may be versioned in GitHub and refreshed with game updates.
- Base IDs are the primary cross-system join key.
- Exact TB mission claims only where mission evidence is verified.
- Journey overlap is prerequisite progress, not a guaranteed unlock.
- User-tracked goals are preferences, not evidence that an event is complete or unlockable.
- Do not fabricate material cost, ETA, raid damage, TW value, GAC value, or unlock probability without trustworthy evidence.
- Do not invent an opaque "best" score unless visible component weights are documented.

## Member UX target

A normal Guild member should not need slash syntax.

```text
Action Center
  -> My Journey Goals
     -> select JMK / GL Ahsoka / Executor / etc.
     -> Save My Goals
  -> TB Farm Plan
     -> My tracked Journey goals
     -> Run privately
     -> MY GOAL farms rise to the top
     -> Keep private OR Share to Player / Guild / optional Discord
```

Farm Command uses the same saved goal list for the verified player.

## Near-term build order

1. [x] Guild TB Farming Guide.
2. [x] Personal TB Farm Plan website action.
3. [x] Player/Guild/optional Discord publication.
4. [x] Durable verified-account Journey goals.
5. [x] Farm Command <-> Action Center goal synchronization.
6. [x] Personalized MY GOALS TB ranking.
7. [ ] Add actual `/tb farms` Discord slash adapter using the same model.
8. [ ] Add officer Guild farm campaigns and member commitments.
9. [ ] Expand tracked-goal Cross-Mode Farm Value into Raid/TW/GAC.
10. [ ] Add material-cost/ETA only after trustworthy resource-cost evidence exists.
