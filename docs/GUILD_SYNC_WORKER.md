# Guild Sync Worker

SWGOH Command Center separates heavyweight Guild synchronization from the web request process.

## Process

Run a second Railway service from the same `Hunting-Fishing/Swgoh-App` repository with:

```bash
node guild-sync-worker.mjs
```

The worker claims durable `guild_sync_jobs` from Supabase using a service-role-only RPC and processes them with controlled concurrency.

## Required server variables

The worker requires the same server-only data pipeline variables as the web app:

```env
SUPABASE_URL=https://twfrmixsqhgnzpmegzan.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server secret>
SWGOH_GATEWAY_URL=https://swgoh-live-gateway-production.up.railway.app
SWGOH_GATEWAY_API_KEY=<server secret>
```

Do not expose either secret to browser JavaScript or commit them to Git.

Optional tuning:

```env
GUILD_SYNC_WORKER_ENABLED=true
GUILD_SYNC_WORKER_POLL_MS=15000
GUILD_SYNC_WORKER_BATCH_SIZE=1
GUILD_SYNC_RETRY_BASE_SECONDS=30
GUILD_SYNC_WORKER_ID=
```

Start conservatively with a batch size of 1. Increase only after observing Comlink/gateway latency and Supabase write load.

## Tenant boundary

A queue row is not proof that a caller may persist a Guild. For user-triggered jobs, `guild-sync-worker.mjs` calls `guildPersistence.sync({ id: requested_by_user_id })`. That method re-resolves:

1. the exact signed Command Center user,
2. their VERIFIED `user_player_links` row,
3. the matching ACTIVE `guild_user_memberships` row,
4. the canonical Guild tenant,
5. the fresh live SWGOH Guild ID and member identity.

If any layer no longer matches, the job is not completed. The worker never picks a different user to make an authorization failure disappear.

## Initial capture

A database trigger queues the first rich Guild sync when a user/player membership transitions to ACTIVE and the same user/player link is VERIFIED. The user does not submit a destination Guild ID.

## Scheduled jobs

This first worker slice deliberately processes signed-user jobs only. System/scheduled Guild refreshes will use a separate Guild-scoped authorization resolver so a scheduled job cannot silently impersonate a member account.
