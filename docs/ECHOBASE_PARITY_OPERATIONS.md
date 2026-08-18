# EchoBase parity contract — SWGOH Command Center

Benchmark: https://echobase.app/ and https://docs.echobase.app/

This document is an operational parity contract, not a visual-copy requirement. SWGOH Command Center keeps its stronger verified-user / verified-Ally-Code / signed-Discord authorization model while matching or exceeding the officer workflows that make EchoBase useful.

## Product rule

An EchoBase capability is not considered complete merely because a page or button exists. It is complete only when:

1. its Guild/player state is durable and tenant-bound,
2. its planner behavior is deterministic and testable,
3. preview and publish are separate actions,
4. outbound Discord actions are auditable and fail closed,
5. identity uses Ally Code / canonical player ID rather than display name,
6. mission safety and explicit officer hard-reserves outrank convenience preferences,
7. stale or unavailable live game data is visibly labeled instead of silently fabricated.

## Capability matrix

| EchoBase workflow | Command Center status | Command Center implementation target |
| --- | --- | --- |
| Responsive guild/officer workspace | Partial | Dedicated Guild Operations workspace optimized for desktop and mobile |
| Ally Code / Guild login | Exceeded | Keep Command Center auth + verified Ally Code ownership; do not regress to Guild PIN security |
| Guild roster refresh | Active | Canonical-first Guild sync with explicit live refresh |
| Guild member ignore list | Partial | Consolidate durable Discord availability/ignore controls and web controls into `guild_member_operation_controls` |
| Timed ignore / vacation | Partial | Persist `ignored_until` and auto-expire |
| TB battle / phase picker | Partial | ROTE-first phase-layout editor with reusable layout presets |
| Sandbag / mixed phase layout | Missing UI | Persist arbitrary included phases/territories in `guild_tb_plans.phase_layout` |
| Platoon/Operation requirement display | Active | Existing ROTE Operation requirement catalog and EchoBase/ROTE reference archives |
| Manual requirement override | Foundation | `guild_tb_plans.requirement_overrides`; UI must clearly distinguish canonical vs officer override |
| Screenshot requirement import | Optional parity | Only needed for non-static/changed requirements; never make OCR the source of truth when canonical requirements exist |
| Requirement completeness gating | Missing UI | Preview/publish disabled until each active slot is canonical, overridden, or explicitly ignored |
| Ignore platoon | Foundation | Persist `ignored_platoons`; planner removes those slots before optimization |
| Ignore mission | Foundation | Persist `ignored_missions`; planner removes those slots before optimization |
| Clear requirement / mission / platoon | Foundation | Clear officer overrides without deleting canonical source data |
| Pre-assign exact player to exact slot | Partial | Existing planner `locks`; persist in `guild_tb_plan_preassignments` |
| Grouping rules | Foundation | Persist reusable conditional rules in `guild_tb_grouping_rules`; compile into planner constraints |
| Member GIVE / KEEP preference | Partial/strong | Existing mission-safe GIVE/KEEP planner + Discord controls; consolidate to `guild_unit_donation_preferences` |
| Mission-protection behavior | Exceeded | Existing mission safety outranks GIVE/KEEP; EchoBase parity must not weaken this |
| Hard reserve | Exceeded | Existing durable officer hard reserve is absolute exclusion |
| Assignment optimizer | Active/strong | Existing scarcity-first, load-balanced, mission-safe ROTE planner |
| Preview assignments in web app | Partial | Persist preview runs in `guild_tb_assignment_runs`; never publish as side effect of preview |
| Public Discord assignment post | Safety-gated | Enable only through verified destination + outbound queue + audit receipt |
| Discord @mentions | Foundation | `include_mentions`; only linked users are mentionable |
| Per-member Discord DMs | Safety-gated | `send_dms`; delivery receipt per player; failure does not invalidate the assignment plan |
| Verified Discord channel picker | Foundation | `guild_discord_destinations` kind=`channel`, verified by signed bot interaction |
| Webhook destination | Foundation | Store only a server-side secret reference; never expose raw webhook URL back to browser |
| Guild ↔ Discord registration | Partial/strong | Existing durable Discord ↔ SWGOH binding; expose in Operations workspace |
| Guild status / registered vs unregistered members | Partial | Existing identity/control commands; build professional web matrix |
| Force Guild sync | Active | Existing explicit refresh + queued canonical Guild worker |
| Platoon farm/readiness report | Active/strong | Guild Unit Ownership Matrix + ROTE upgrade queue + redundancy targets |
| Player Discord registration | Active | Existing Discord identity linking |
| Player status | Active | `/tb me`, member command profile, Discord controls |
| Donation preference report | Active/partial | Existing `/tb controls`; add web aggregate and durable DB consolidation |
| TW Defense Assigner | Partial | Existing TW capability analysis; add strategy editor + optimizer + preview/publish run model |
| TW territory priorities | Foundation | Stored in `guild_tw_defense_plans.strategy`; at least one priority-1 territory required |
| TW defensive team requirements | Foundation | Strategy contains reusable team templates and requested counts per zone |
| TW player/team assignment optimizer | Missing engine | Assign scarce/qualified teams while avoiding unit reuse and balancing member load |
| Assignment history / audit | Exceeded foundation | `guild_tb_assignment_runs`, `guild_tw_defense_runs`, `guild_operations_audit_log` |
| Historical Guild intelligence | Exceeded | Existing 2022→2026 Ludus historical archive + midnight ongoing ledger |

## Durable schema introduced for parity

- `guild_operation_settings`
- `guild_discord_destinations`
- `guild_member_operation_controls`
- `guild_unit_donation_preferences`
- `guild_tb_plans`
- `guild_tb_grouping_rules`
- `guild_tb_plan_preassignments`
- `guild_tb_assignment_runs`
- `guild_tw_defense_plans`
- `guild_tw_defense_runs`
- `guild_operations_audit_log`

All are RLS-enabled and server/service-role bound. Browser code must not write directly to them with anon/authenticated Supabase privileges.

## TB Operations UX contract

The final workspace must contain these permanent surfaces:

### 1. Battle / Phase layout

- choose Territory Battle
- choose a normal phase or mixed/sandbag layout
- show the actual territory/Operation map, not a raw form
- every included mission/platoon has a visible completion meter
- ignored missions/platoons are visually muted and explicitly labeled

### 2. Requirements

Each slot displays:

- unit portrait/name
- base ID in detail mode
- required rarity/relic
- eligible physical owners
- currently assignable owners
- mission-safe owners
- canonical/override provenance
- ignored/pre-assigned state

### 3. Officer controls

- ignore/unignore member with optional expiration
- GIVE/DEFAULT/KEEP unit preference
- exact slot pre-assignment
- hard mission reserve
- ignore/include mission
- ignore/include platoon
- manual requirement override/reset
- grouping-rule editor

### 4. Preview

Preview must show:

- filled / unfilled slots
- assignments by mission/platoon
- assignments by member
- risky HELP assignments
- protected-unit overrides
- GIVE assignments
- KEEP last-resort assignments
- hard-reserve exclusions
- lock conflicts
- impossible platoons
- recommended farms for shortages

### 5. Publish

Publish is a separate confirmation flow requiring:

- a successful preview fingerprint
- no unresolved invalid locks
- an authorized officer
- a verified Discord destination or explicit preview-only mode
- outbound safety gate enabled

Optional delivery:

- public channel post
- @mentions for linked users
- member DMs
- webhook post using a server-side secret reference

Every delivery attempt writes an audit/receipt record.

## Grouping rule model

Minimum supported rule semantics:

- `avoid_pair`: if a member is assigned unit/group A, avoid assigning unit/group B to that same member
- `prefer_pair`: prefer keeping related assignments on the same member when safe
- `avoid_unit_after`: once A is assigned, reserve B for that member/phase
- `max_member_assignments`: cap member assignment count for a phase/territory
- `protect_unit_if_assigned`: assigning A creates an additional protection for B

Rules never override hard reserves or mission-safety exclusions.

## TW Defense Assigner UX contract

The Command Center TW workflow must support:

1. officer-defined defense strategy presets,
2. territory/zone priorities,
3. team templates with unit requirements,
4. requested team counts per territory,
5. ignored/unavailable members,
6. player/team eligibility and scarcity,
7. no unit reuse across a member's defensive assignments,
8. balanced member defensive load,
9. preview with shortages/conflicts,
10. publish to Discord with optional mentions/DMs,
11. saved run history and audit receipts.

The existing TW capability page remains a diagnostic input; it is not considered a completed Defense Assigner by itself.

## Visual / formatting standard

Do not reproduce EchoBase's old visual styling literally. Preserve its workflow clarity while using Command Center's Star Wars command-console design:

- strong dark command surface, high contrast, restrained glow
- compact officer-density desktop layout
- touch-safe controls on mobile
- persistent Guild identity + freshness indicator
- workflow stepper: Layout → Requirements → Controls → Preview → Publish
- color semantics: ready/safe, partial/warning, risk/HELP, ignored, locked/reserved
- no giant unstructured tables when a mission/territory board is more legible
- all destructive/reset actions require confirmation
- every generated assignment includes provenance/freshness in detail mode

## Authentication / Discord inspection rule

Do not request or store a user's Discord password, session token, bot token, or raw webhook URL in chat. Authenticated EchoBase visual comparison should be done through a user-controlled browser session/screenshots or other safe delegated session mechanism. Command Center's own Discord bot tokens remain server secrets.
