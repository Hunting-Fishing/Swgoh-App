# Guild TB + Discord Command Architecture

Status: implementation plan + first production slice

## Objective

Build an independent guild-officer Territory Battle command system inside SWGOH Roster Command, with EchoBase/EchoStation used as a behavioral reference rather than a code dependency.

Primary workflow:

`Ally Code -> live guild roster -> TB/phase layout -> Operations requirements -> mission-safe assignment optimizer -> officer review/locks -> publish -> Discord channel/@mentions/DMs -> completion follow-up`

The web app remains the source of planning detail. Discord is the delivery and command surface.

## Reference behavior researched

EchoBase's TB Platoon Assigner reads the entire guild roster and assigns platoon/Operation requirements according to an assignment algorithm. EchoStation is its companion Discord bot and can publish assignments, mention members, and send individual DMs.

Important behaviors to reproduce independently:

- scarcity-aware guild-wide assignment rather than member-by-member guessing;
- pre-assignments that officers can lock before automatic planning;
- member ignore status so unavailable players are excluded;
- platoon/mission ignoring for guild strategies that intentionally skip requirements;
- donation preferences:
  - GIVE: favor this unit when possible;
  - DEFAULT: no special preference;
  - KEEP: avoid this unit when possible, but permit it as a last resort if completion otherwise fails;
- visible HELP/risk treatment when a KEEP unit must be used;
- Discord channel posts, optional @mentions, and per-player DMs;
- Ally Code <-> Discord-user registration;
- guild/Discord registration and guild status reporting;
- forced roster refresh when an officer needs current data;
- mixed phase layouts/sandbagging;
- queued Discord delivery at peak TB times.

Reference documentation:

- https://docs.echobase.app/tb-platoon-assigner
- https://docs.echobase.app/echostation
- https://docs.echobase.app/echostation/player-commands/donation-preference
- https://docs.echobase.app/tb-platoon-assigner/usage-guide/pre-assignments
- https://docs.echobase.app/tb-platoon-assigner/usage-guide/ignoring-platoons
- https://docs.echobase.app/tb-platoon-assigner/usage-guide/choosing-a-phase
- https://docs.echobase.app/echostation/guild-commands/register
- https://docs.echobase.app/echostation/guild-commands/guildstatus
- https://docs.echobase.app/echostation/guild-commands/forceguildsync
- https://docs.echobase.app/echostation/guild-commands/verify
- https://docs.echobase.app/settings/include-mentions
- https://docs.echobase.app/settings/send-dms-to-each-member

## Existing SWGOH App foundation

Already available:

- live guild hydration through `/api/guild/by-player/:allyCode/roster`;
- normalized ROTE Operation requirements through `/api/rote/operations`;
- scarcity-first deterministic Operation planner;
- per-phase duplicate-unit prevention;
- per-territory contribution caps;
- officer slot locks;
- hard mission reserves;
- guild mission coverage across verified ROTE missions;
- zero/single-owner mission detection;
- configurable 1-5 mission-owner redundancy target;
- guild farm priorities;
- officer exports;
- strategy-evidence audit;
- shared guild/static-data browser caching.

The first Echo-style safety slice adds:

- GIVE / DEFAULT / KEEP donation preferences;
- ignored members;
- automatic mission-protection records;
- safe-owner counts per Operation requirement;
- HELP/risk assignment flags;
- a guild-wide safe Operation draft inside Guild and ROTE Operations views.

## Automatic roster protection

Our app can go beyond a manually maintained KEEP list because it already has exact mission-entry intelligence.

For each verified exact ROTE mission and exact-ready guild member:

1. Protect legal named mandatory units for that mission/phase.
2. Calculate required slots vs flexible slots.
3. If the member has exactly enough flexible legal units to fill the mission, protect those flexible units too.
4. Do not auto-protect broad pools when the member has surplus legal depth.
5. Do not infer exact fleet protection from generic fleet gates that lack a complete selectable-ship rule.
6. Weight protection higher for sole mission owners and missions below the configured guild redundancy target.

Protection is soft: it changes donor ranking but does not make a completable Operation impossible. A forced protected donation is visibly labeled as a roster-risk/HELP assignment.

Hard officer mission reserves remain absolute.

## Assignment priority model

For each normalized Operation slot:

1. Apply officer pre-assignment locks first.
2. Exclude unavailable/ignored members.
3. Exclude hard mission-reserved member+unit+phase combinations.
4. Require actual owned progression to meet stars/relic rules.
5. Prevent the same player's unit from being consumed twice in the same phase.
6. Respect the per-territory contribution cap.
7. Order slots by scarcity, using SAFE owner count before total available owner count.
8. Rank donors approximately:
   - explicit GIVE;
   - normal unprotected donor;
   - lower-severity mission-protected donor;
   - critical mission-protected donor;
   - KEEP donor last.
9. Within the same safety band, balance territory/phase load and prefer the smallest progression surplus needed for the slot.
10. Expose every protection override rather than hiding the tradeoff.

A future optimizer can replace this deterministic greedy allocator with a min-cost/global matching pass while keeping this contract.

## Data authority boundaries

### Live/current authority

Use our Comlink/gateway pipeline for:

- guild identity and membership;
- Ally Codes/player IDs;
- roster ownership;
- character/ship progression and GP exposed by the player response.

### Versioned/static authority

Use versioned game data for:

- unit identities/categories;
- normalized ROTE Operations requirements;
- mission-entry records and source metadata.

### Officer-entered state

The public player/guild response does not prove current in-game Operation placement/completion state. Therefore these must be stored as officer planning state unless/until a verified live source exists:

- slot completion/filled state;
- skipped Operations/platoons;
- pre-assignments;
- manual reserves;
- member availability/ignore status;
- donation preferences;
- selected phase/sandbag layout;
- published Discord plan version.

Never fabricate live TB completion from roster capability.

## Discord architecture

Use a Discord Application owned by this project.

### Transport

Prefer Discord HTTP Interactions on Railway instead of requiring a permanent Gateway WebSocket for the initial implementation.

Discord requires:

- a public Interactions Endpoint URL;
- Ed25519 signature verification using the application public key;
- PING/PONG validation;
- an initial interaction response within Discord's response window;
- deferred responses + follow-ups for guild hydration/optimization jobs.

Official Discord references:

- https://docs.discord.com/developers/platform/interactions
- https://docs.discord.com/developers/interactions/overview
- https://docs.discord.com/developers/interactions/receiving-and-responding
- https://docs.discord.com/developers/interactions/application-commands
- https://docs.discord.com/developers/platform/webhooks

### Initial Railway environment

Do not commit secret values.

Planned variables:

```text
DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=
DISCORD_DEFAULT_GUILD_ID=
DISCORD_TB_DELIVERY_ENABLED=false
```

Optional one-way pilot:

```text
DISCORD_TB_WEBHOOK_URL=
```

The webhook URL is a secret and must never be exposed to the browser.

### Server endpoints

Planned endpoints:

```text
POST /api/discord/interactions
GET  /api/discord/oauth/start
GET  /api/discord/oauth/callback
GET  /api/guild/:guildId/discord/status
POST /api/guild/:guildId/discord/channel
POST /api/guild/:guildId/tb/plan
POST /api/guild/:guildId/tb/publish
GET  /api/guild/:guildId/tb/plan/:planId
```

The browser should never receive the Discord bot token or webhook secret.

## Slash-command surface

Start with guild-scoped commands for the pilot Discord server so command updates are immediate. Move stable commands global later.

Proposed command family:

```text
/tb status
/tb sync
/tb plan phase:<layout>
/tb assignments member:<optional>
/tb publish phase:<layout>
/tb farms phase:<optional>
/tb preference unit:<unit> preference:<give|default|keep>
/tb ignore member:<optional> days:<optional>
/tb include member:<member>
/tb reserve member:<member> unit:<unit> phase:<phase>
/tb unreserve member:<member> unit:<unit> phase:<phase>
/tb lock slot:<slot> member:<member>
/tb unlock slot:<slot>
```

Officer-only commands should be permission-gated. Player preference commands can allow a member to modify their own linked Ally Code while officer roles can act for guildmates.

## Guild + Discord identity model

Do not rely only on matching display names.

Required links:

- SWGOH guild ID -> Discord server ID;
- SWGOH player ID / Ally Code -> Discord user ID;
- Discord officer permission -> allowed guild-management actions.

Name/nickname matching can be offered only as a registration suggestion; the durable relation must store IDs.

## Persistence model

Browser localStorage is acceptable for the current prototype but not for shared officer operation.

Recommended server-side tables/collections:

### `guild_connections`

- guild_id
- guild_name
- discord_guild_id
- assignment_channel_id
- created_by
- created_at
- updated_at

### `guild_member_links`

- guild_id
- player_id
- ally_code
- discord_user_id
- game_name
- active
- verified_at

### `tb_member_preferences`

- guild_id
- player_id
- base_id or category_id
- preference (`give`, `keep`)
- source (`player`, `officer`)
- updated_by
- updated_at

### `tb_member_availability`

- guild_id
- player_id
- ignored_until nullable
- reason
- updated_by

### `tb_operation_controls`

- guild_id
- tb_id
- phase_layout_id
- slot_id
- locked_player_id nullable
- ignored boolean
- hard_reserve metadata
- updated_by

### `tb_plans`

- plan_id
- guild_id
- tb_id
- phase_layout
- roster_snapshot_at
- operation_data_version
- status (`draft`, `approved`, `published`, `superseded`)
- optimizer_version
- created_by
- created_at

### `tb_plan_assignments`

- plan_id
- slot_id
- player_id
- base_id
- safety_status
- preference
- protection_reason
- officer_locked

### `discord_delivery_jobs`

- job_id
- plan_id
- destination type (`channel`, `dm`)
- discord_target_id
- status
- attempts
- next_attempt_at
- last_error

## Delivery queue

Do not send a public assignment post plus ~50 DMs synchronously inside the optimizer request.

Workflow:

1. officer approves/publishes plan;
2. persist immutable plan version;
3. enqueue channel/mention/DM jobs;
4. worker drains jobs with Discord rate-limit handling;
5. record delivery failures per member;
6. officer status screen shows delivered/unmapped/DM-blocked results.

## Authorization

EchoStation uses named Discord roles as a lightweight authorization mechanism. Our production app should use stronger controls:

- Discord OAuth identity;
- stored Discord server/guild connection;
- guild membership validation;
- Discord permission/role validation for officer actions;
- allow normal linked members to modify only their own donation preferences/availability;
- audit every officer mutation and plan publication.

Never trust a browser-supplied `guild_id`, `player_id`, or `officer=true` flag without server-side validation.

## Phase layout / sandbagging

Do not assume `P1`, then `P2`, etc. is the only live layout.

Create a `phase_layout` object containing the active territories/Operations for the guild's current strategy. The officer should be able to combine zones from different nominal phases. The optimizer consumes that selected layout rather than all normalized slots when publishing a live phase plan.

## Grouping rules — next optimizer layer

EchoBase supports conditional grouping rules. Our equivalent should be generic constraints such as:

```text
IF Member receives Operation Unit A
THEN avoid assigning Unit B to same member in this phase
```

and:

```text
Protect Squad Variant X until all lower-risk Operation owners are exhausted.
```

This is the correct path for protecting full combat teams beyond simple unit-level KEEP preferences.

## Rollout

### Stage 1 — in app (implemented first slice)

- live guild connection by Ally Code;
- current guild roster hydration;
- ROTE Operation requirements;
- safe assignment planner;
- automatic verified-mission protections;
- GIVE/KEEP preferences;
- ignored members;
- HELP/risk reporting;
- existing officer locks/hard reserves;
- ROTE Operations + Guild UI surfaces;
- TSV export.

### Stage 2 — shared officer state

- authentication;
- persistent guild settings;
- shared preferences/ignores/locks;
- phase layouts and ignored Operations;
- immutable plan versions and audit log.

### Stage 3 — Discord one-way publishing

- protected webhook endpoint/server secret;
- preview + approve + publish;
- assignment embeds;
- officer summary and HELP warnings.

### Stage 4 — Discord application

- Discord OAuth/member links;
- HTTP interactions endpoint;
- guild-scoped slash commands for pilot;
- server permission validation;
- @mentions.

### Stage 5 — DMs + queue

- per-member assignments;
- delivery queue/retries;
- unmapped-member report;
- DM failure report.

### Stage 6 — advanced command system

- grouping rules;
- sandbag/mixed phase layout designer;
- member self-service preferences;
- guild farm report;
- operation completion check-off and plan revisions;
- multi-guild/alliance support.

## Product boundary

This should be an independent implementation. Reproduce useful workflow concepts, not EchoBase source code, branding, private data, or proprietary assets. SWGOH Roster Command should present its own optimizer rules and evidence boundaries transparently.
