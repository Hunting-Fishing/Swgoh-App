# SWGOH Command Center — Durable Discord State

Status: foundation implemented; Discord mutation commands remain disabled.

## Purpose

The Discord bot needs durable shared state before it can safely support publishing, configurable officer roles, member linking, preferences, locks, or audited officer actions.

The application now includes a fail-closed atomic JSON state store for the single-instance pilot. It does not assume the application container filesystem is persistent.

## Railway deployment

Recommended pilot setup:

1. Attach a Railway Volume to the SWGOH App service.
2. Use an absolute mount path such as `/data`.
3. Restart/redeploy the service so the Volume is mounted at runtime.
4. Do not manually set `RAILWAY_VOLUME_MOUNT_PATH`; Railway provides it when the Volume is attached.
5. The application will automatically use:

```text
<RAILWAY_VOLUME_MOUNT_PATH>/swgoh-command-center/discord-state-v1.json
```

For a `/data` mount that becomes:

```text
/data/swgoh-command-center/discord-state-v1.json
```

No `SWGOH_STATE_DIR` variable is required for the normal Railway Volume setup.

## Explicit storage override

`SWGOH_STATE_DIR` may point at another absolute path. The store remains disabled unless one of these is true:

- the directory is inside the Railway-provided Volume mount path; or
- `SWGOH_STATE_STORAGE_CONFIRMED_DURABLE=true` is explicitly set because the operator has independently confirmed that path survives deployments/restarts.

This prevents an ordinary application-container directory from being mistaken for durable storage.

## Readiness check

After the Volume is attached, inspect:

```text
GET /api/discord/status
```

Expected durable-state section:

```json
{
  "durableState": {
    "enabled": true,
    "durable": true,
    "mode": "atomic-json-volume",
    "reason": "ready",
    "schemaVersion": 1
  }
}
```

The status endpoint reports configuration only. It does not create or modify the state file.

## State schema — pilot foundation

The v1 state document is designed to hold:

- Discord guild ↔ SWGOH guild connection metadata;
- configured Discord command channel;
- configurable officer role IDs;
- Discord user ↔ SWGOH player/Ally Code links;
- bounded plan-version metadata;
- an audit event for each state mutation performed through the store API.

The store does not persist Discord bot tokens, application secrets, public/private keys, or SWGOH gateway API keys.

## Atomicity and concurrency

Writes are serialized within the Node process. Each mutation reads the current document, applies one state change and its audit event, writes a temporary file in the same directory, then renames that temporary file over the active state document.

This is appropriate for the current single-process pilot. It is not a distributed database and must not be treated as a multi-replica locking mechanism.

Before running multiple application replicas that can mutate Discord state, migrate this store behind a transactional shared database or equivalent distributed persistence layer.

## Size controls

Defaults:

```text
SWGOH_STATE_MAX_BYTES=5242880
SWGOH_STATE_MAX_PLAN_VERSIONS=100
```

The state store refuses a write that would exceed the configured document size instead of silently truncating data. Plan-version metadata is bounded per guild; audit history is not silently truncated.

## Current safety boundary

The existing `/tb status`, `/tb sync`, `/tb phase`, `/tb assignments`, and `/tb farms` interaction transport does not import or call the durable mutation API yet.

Therefore adding a Volume does not automatically enable:

- public channel publishing;
- direct messages;
- officer-role changes;
- player linking;
- locks, reserves, ignores, or preferences;
- plan approval/publishing;
- in-game TB state changes.

Those features should be added only after their individual authorization, audit, validation, and rollback contracts are implemented.

## Next build slice

With durable storage configured and reporting ready, the next controlled slice is:

1. persist the pilot Discord guild ↔ SWGOH guild connection;
2. add configurable officer-role IDs while retaining Manage Guild/Administrator as the bootstrap authority;
3. add an officer-only connection/status command with audit entries;
4. add plan-version persistence;
5. then build `/tb publish` as preview → approve → publish, never as a one-step blind send.
