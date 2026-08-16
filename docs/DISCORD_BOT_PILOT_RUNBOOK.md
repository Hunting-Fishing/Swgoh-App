# SWGOH Command Center Discord Bot — Pilot Runbook

Status: live read-only TB pilot; durable state foundation available but mutation commands remain disabled.

## Current command surface

The pilot Discord application uses signed HTTP Interactions on the SWGOH App service.

Available guild-scoped commands:

```text
/tb status
/tb sync
/tb phase phase:P1..P6
/tb assignments
/tb assignments phase:P1..P6
/tb farms
/tb farms phase:P1..P6
```

All current `/tb` commands default to the Discord `MANAGE_GUILD` permission while the pilot is officer-only. The HTTP interaction handler independently enforces `MANAGE_GUILD` or `ADMINISTRATOR` from the signed guild interaction before command execution or deferred live work begins; command visibility alone is not treated as authorization.

A custom Discord role named "SWGOH Officer" is not automatically trusted just because of its name. During this pilot, members using `/tb` must actually have Manage Server / Manage Guild or Administrator permission. Configurable role IDs will use the durable state layer before they are trusted by the command handler.

### What each command does

- `/tb status` — immediate nonsecret integration/configuration status.
- `/tb sync` — force-refreshes the configured pilot SWGOH guild roster from the live Comlink gateway. It does not mutate TB planning state.
- `/tb phase phase:P1..P6` — renders the shared web Phase Command Board model into Discord for one explicitly selected nominal ROTE phase: mission entry coverage, redundancy, Operation fill, risky donors, protected units, officer alerts, farm priorities, and highest-burden members.
- `/tb assignments` — builds a fresh read-only mission-safe ROTE Operation draft from the live guild roster, normalized Operation requirements, static catalog, and verified mission protection model.
- `/tb farms` — returns the highest-impact mission farm targets from the verified guild mission coverage model.
- `phase:P1..P6` — optionally limits assignment/farm output to one nominal ROTE phase; `/tb phase` requires the phase explicitly.

The bot does not infer the currently active in-game ROTE phase. Officers select P1-P6 explicitly until a verified live TB-state source is available.

Long-running reads acknowledge Discord immediately with an ephemeral deferred response and then edit the original interaction response when the live calculation is complete.

## Railway environment

Keep all secret values only in Railway variables.

Required for signed interactions:

```text
DISCORD_TB_INTERACTIONS_ENABLED=true
DISCORD_APPLICATION_ID=<Discord application ID>
DISCORD_PUBLIC_KEY=<Discord application public key>
DISCORD_DEFAULT_GUILD_ID=<pilot Discord server ID>
```

The server verifies both the Ed25519 signature and, for application commands, that the signed interaction's `application_id` matches `DISCORD_APPLICATION_ID`.

Required to register guild-scoped commands:

```text
DISCORD_BOT_TOKEN=<Discord bot token>
```

Required for live guild commands:

```text
DISCORD_DEFAULT_ALLY_CODE=<9-digit Ally Code belonging to the pilot SWGOH guild>
DISCORD_TB_REDUNDANCY_TARGET=2
```

The Ally Code is used server-side only to resolve the SWGOH guild. It is intentionally not returned by `/api/discord/status`.

Existing live gateway variables are also required:

```text
SWGOH_GATEWAY_URL=<live gateway base URL>
SWGOH_GATEWAY_API_KEY=<matching gateway secret>
```

Keep proactive publishing disabled during this slice:

```text
DISCORD_TB_DELIVERY_ENABLED=false
```

## Durable state readiness

Durable state is required before configurable officer roles, player linking, plan approvals, or publishing are connected to commands.

On Railway, attach a Volume to the SWGOH App service. The app automatically recognizes `RAILWAY_VOLUME_MOUNT_PATH` and uses a `swgoh-command-center` directory beneath that mount. Do not point `SWGOH_STATE_DIR` at an ordinary container directory and assume it is persistent.

After the Volume is mounted, check:

```text
GET /api/discord/status
```

The response should report:

```text
durableState.enabled = true
durableState.durable = true
durableState.reason = ready
```

See `docs/DISCORD_DURABLE_STATE.md` for the storage contract, limits, and deployment instructions.

## Discord Developer Portal

Set the Interactions Endpoint URL to:

```text
https://<SWGOH-APP-HOST>/api/discord/interactions
```

Discord will verify the endpoint with a signed PING. The endpoint rejects unsigned or incorrectly signed requests. Signed PING verification is intentionally accepted before member-permission checks so Discord can validate the endpoint without a guild member context.

## Register the guild command

After the Railway variables are present, run:

```bash
npm run discord:register-tb
```

The registration script bulk-overwrites the pilot guild command definition for `/tb`, so the `phase`, `assignments`, `farms`, and P1-P6 options appear as one officer command surface.

## Pilot acceptance test

Run these as a member who has Manage Server / Manage Guild or Administrator permission in the configured pilot Discord server:

```text
/tb status
/tb sync
/tb phase phase:P1
/tb assignments phase:P1
/tb farms phase:P1
```

Also test once with a normal member who lacks both permissions; `/tb` must return an ephemeral officer-permission error and must not begin live TB work.

Expected boundaries:

- responses are ephemeral;
- server-side authorization requires Manage Guild or Administrator, independently of Discord command visibility;
- `/tb sync` reports the live guild name, hydrated roster count, and guild GP;
- `/tb phase` reports the same phase-level command metrics and risk queue as the web Phase Command Board;
- `/tb assignments` reports mission-safe assignment coverage, unfilled slots, mission protections, and HELP/risk assignments;
- `/tb farms` reports verified mission-impact farm targets;
- durable storage readiness does not itself enable any write command;
- no command publishes to a public channel;
- no command sends DMs;
- no command changes locks, ignores, donation preferences, reserves, or in-game TB completion state.

## Fail-closed behavior

The bot refuses or degrades safely when:

- the Discord request signature is invalid;
- an application command's signed `application_id` does not match this deployment;
- the invoking guild member lacks Manage Guild and Administrator permission;
- the request is from a Discord server other than `DISCORD_DEFAULT_GUILD_ID`;
- `DISCORD_DEFAULT_ALLY_CODE` is missing or invalid;
- `/tb phase` does not contain a valid P1-P6 phase;
- the live SWGOH gateway is unavailable;
- the static catalog is unavailable;
- verified mission evidence is incomplete.

The durable state layer separately remains disabled when no confirmed persistent storage path is available.

Generic fleet gates without complete selectable-ship evidence are not converted into exact-ready claims.

## Next implementation layer

Do not enable public publishing or member self-service merely because the state store exists. Durable storage must first report ready and then be wired through authorized, audited command flows.

Next required production work:

1. Persist the pilot SWGOH guild ↔ Discord server/channel connection.
2. Persist configurable officer role IDs while retaining Manage Guild/Administrator as bootstrap authority.
3. Add Discord OAuth / verified SWGOH player ↔ Discord user links.
4. Persist preferences, ignores, reserves, locks, phase layouts, and plan versions.
5. Build `/tb publish` as preview → approve → publish with audit entries.
6. Add queued channel mentions and per-member DMs with retry/error reporting.
