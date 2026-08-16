# SWGOH Command Center Discord Bot — Pilot Runbook

Status: live read-only TB pilot

## Current command surface

The pilot Discord application uses signed HTTP Interactions on the SWGOH App service.

Available guild-scoped commands:

```text
/tb status
/tb sync
/tb assignments
/tb assignments phase:P1..P6
/tb farms
/tb farms phase:P1..P6
```

All current `/tb` commands default to the Discord `MANAGE_GUILD` permission while the pilot is officer-only.

### What each command does

- `/tb status` — immediate nonsecret integration/configuration status.
- `/tb sync` — force-refreshes the configured pilot SWGOH guild roster from the live Comlink gateway. It does not mutate TB planning state.
- `/tb assignments` — builds a fresh read-only mission-safe ROTE Operation draft from the live guild roster, normalized Operation requirements, static catalog, and verified mission protection model.
- `/tb farms` — returns the highest-impact mission farm targets from the verified guild mission coverage model.
- `phase:P1..P6` — optionally limits the Discord output to one nominal ROTE phase.

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

## Discord Developer Portal

Set the Interactions Endpoint URL to:

```text
https://<SWGOH-APP-HOST>/api/discord/interactions
```

Discord will verify the endpoint with a signed PING. The endpoint rejects unsigned or incorrectly signed requests.

## Register the guild command

After the Railway variables are present, run:

```bash
npm run discord:register-tb
```

The registration script bulk-overwrites the pilot guild command definition for `/tb`, so the new `farms` and phase options appear immediately as guild-scoped commands.

## Pilot acceptance test

Run these in the configured pilot Discord server:

```text
/tb status
/tb sync
/tb assignments phase:P1
/tb farms phase:P1
```

Expected boundaries:

- responses are ephemeral;
- `/tb sync` reports the live guild name, hydrated roster count, and guild GP;
- `/tb assignments` reports mission-safe assignment coverage, unfilled slots, mission protections, and HELP/risk assignments;
- `/tb farms` reports verified mission-impact farm targets;
- no command publishes to a public channel;
- no command sends DMs;
- no command changes locks, ignores, donation preferences, reserves, or in-game TB completion state.

## Fail-closed behavior

The bot refuses or degrades safely when:

- the Discord request signature is invalid;
- the request is from a Discord server other than `DISCORD_DEFAULT_GUILD_ID`;
- `DISCORD_DEFAULT_ALLY_CODE` is missing or invalid;
- the live SWGOH gateway is unavailable;
- the static catalog is unavailable;
- verified mission evidence is incomplete.

Generic fleet gates without complete selectable-ship evidence are not converted into exact-ready claims.

## Next implementation layer

Do not enable public publishing or member self-service until shared server-side guild state exists.

Next required production work:

1. Discord OAuth and durable SWGOH player ↔ Discord user links.
2. Durable SWGOH guild ↔ Discord server/channel connection.
3. Server-side officer authorization and audit log.
4. Persistent preferences, ignores, reserves, locks, phase layouts, and plan versions.
5. `/tb publish` preview/approve/publish flow.
6. Queued channel mentions and per-member DMs with retry/error reporting.
