# SWGOH Command Center

Production Star Wars: Galaxy of Heroes roster, Guild intelligence and Territory Battle operations platform.

The application uses a **canonical-first, live-enrichment** data model. Complete current Guild/player baselines and history are persisted in Supabase, while the SWGOH Live Gateway backed by Comlink supplies explicit refreshes and fields that are only trustworthy from live data. Versioned game data supplies the shared unit/ability/ROTE catalog. No mock roster or silent fake-zero fallback is permitted in production.

## Production architecture

```text
Browser / Command Center
        |
        | canonical reads
        | GET /api/player/:allyCode/baseline
        | GET /api/guild/by-player/:allyCode/baseline
        | GET /api/player/:allyCode/history
        | GET /api/guild/by-player/:allyCode/history
        v
SWGOH Command Center server
        |
        +--> Supabase canonical players / Guilds / snapshots / history
        |
        | explicit live enrichment / refresh
        | GET /api/player/:allyCode
        | GET /api/guild/by-player/:allyCode/roster?refresh=1
        v
SWGOH Live Gateway
        |
        +--> Comlink
        +--> SWGOH Stats where applicable
        +--> AE2 artwork where available

Versioned SWGOH game data
        +--> units / skills / recipes / ROTE Operations / static art metadata
```

The browser never receives `SWGOH_GATEWAY_API_KEY`; the Node service injects the secret when it calls the live gateway.

## Data authority rules

- Canonical Supabase current tables are the normal read path for full current player rosters and full current Guild membership.
- Canonical player reads fail closed if the persisted owned-unit count does not match the latest snapshot expectation.
- Canonical Guild reads fail closed if current membership cannot be returned completely.
- Comlink `/player` is authoritative for explicit live player/account refreshes.
- Comlink `/guild` is authoritative for explicit current public Guild refreshes.
- SWGOH Stats may enrich calculated per-unit statistics where the workflow requires them.
- Versioned SWGOH game data supplies shared unit, skill, recipe and ROTE Operation definitions.
- AE2 supplies extracted artwork when available; versioned static art remains the fallback.
- Persisted capability flags define whether optional progression evidence is actually known.
- Unknown Zeta/Omicron/Omega-Eta/mod/datacron/account-private evidence remains `NULL`, `N/A` or `—`; it must never be converted into a fake `0`.
- Materials, currency balances, unequipped gear and other account-private inventory are not claimed unless an authoritative source exposes them.

## Player and Guild semantics

The application distinguishes transport pagination from logical product results:

- Guild views mean **all current Guild members**, not one backend page.
- Player roster views mean **all currently owned units**, not one backend page.
- The pilot invariant for Warm Bacon is **394 owned units = 325 characters + 69 ships**.
- The pilot Ludus Venatus Guild baseline contains **50 current members**.

Live-only fields can promote a canonical view to the live Comlink path without changing those logical completeness guarantees.

## Discord TB pilot

The server also exposes signed Discord interactions for the Guild-scoped `/tb` pilot. Current code supports:

```text
/tb status
/tb setup [channel] [officer_role]
/tb sync
/tb activity
/tb controls [member]
/tb phase phase:P1..P6
/tb assignments [phase:P1..P6]
/tb farms [phase:P1..P6]
/tb link member:<Discord user> ally_code:<9-digit code>
/tb unlink member:<Discord user>
/tb links
/tb me
/tb preference unit:<search/autocomplete> preference:<GIVE|DEFAULT|KEEP> [member]
/tb preferences [member]
/tb availability [member] [state:<AVAILABLE|UNAVAILABLE>]
```

Member availability and GIVE/KEEP controls are durably persisted during the pilot and consumed by the mission-safe ROTE planner. Public assignment publishing and member DMs remain disabled until immutable-plan approval and delivery safeguards are implemented.

See `docs/DISCORD_BOT_PILOT_RUNBOOK.md` for the authoritative deployment/acceptance checkpoint.

## App environment

Core live-gateway variables:

```text
SWGOH_GATEWAY_URL=https://swgoh-live-gateway-production.up.railway.app
SWGOH_GATEWAY_API_KEY=<shared secret>
SWGOH_REQUEST_TIMEOUT_MS=35000
SWGOH_GUILD_REQUEST_TIMEOUT_MS=120000
SWGOH_CACHE_FRESH_SECONDS=90
SWGOH_CACHE_STALE_SECONDS=600
SWGOH_GUILD_CACHE_FRESH_SECONDS=600
SWGOH_GUILD_CACHE_STALE_SECONDS=1800
SWGOH_ROTE_CACHE_SECONDS=21600
```

Canonical persistence, authentication, Discord and history services require their corresponding Supabase/Discord/Railway variables documented in `.env.example` and the pilot runbook.

## Railway gateway environment

The `SWGOH-Live-Gateway` service should use Railway private networking for its upstream services:

```text
COMLINK_URL=http://<comlink-private-domain>:3000
STATS_URL=http://<stats-private-domain>:3223
ASSET_URL=http://<ae2-private-domain>:8080
GATEWAY_API_KEY=<long random secret>
PUBLIC_BASE_URL=https://swgoh-live-gateway-production.up.railway.app
```

If Comlink access/secret keys are enabled, also set `COMLINK_ACCESS_KEY` and `COMLINK_SECRET_KEY` on the gateway to matching values.

## Key routes

- `GET /api/health` — Command Center health/capability status.
- `GET /api/player/:allyCode/baseline` — canonical full owned-player roster.
- `GET /api/player/:allyCode` — explicit live individual-roster enrichment.
- `GET /api/player/:allyCode/history` — persisted player snapshots/progression history.
- `GET /api/guild/by-player/:allyCode/baseline` — canonical current Guild baseline.
- `GET /api/guild/by-player/:allyCode/roster` — Guild roster path with canonical/live fallback semantics; explicit refresh promotes to live.
- `GET /api/guild/by-player/:allyCode/history` — persisted Guild history.
- `GET /api/rote/operations` — normalized current ROTE Operation requirements and exact slot definitions.
- `POST /api/discord/interactions` — signed Discord application interaction endpoint.
- Static client files live in `public/`.

## Start

Requires Node.js 20 or newer.

```sh
npm start
```

## Test

```sh
npm test
```
