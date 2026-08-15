# SWGOH Roster Command

Live-only Star Wars: Galaxy of Heroes roster and guild operations management app.

Production roster data comes from the SWGOH Live Gateway backed by Comlink + SWGOH Stats, with AE2 used for live character and ship artwork when available. No mock roster or fallback player data is permitted in production.

## Live architecture

```text
Browser / ChatGPT Site
        |
        | GET /api/player/:allyCode
        | GET /api/guild/by-player/:allyCode/roster
        | GET /api/rote/operations
        v
SWGOH Roster Command server
        |
        | HTTPS + X-API-Key
        v
https://swgoh-live-gateway-production.up.railway.app
        |
        +--> Comlink (Railway private network, port 3000)
        +--> SWGOH Stats (Railway private network, port 3223)
        +--> AE2 (Railway private network, port 8080)
```

The browser never receives `SWGOH_GATEWAY_API_KEY`. The Node server injects the key when it calls the live gateway.

Guild ROTE uses a separate cached path. The gateway resolves the initiating player's guild, retrieves the public `/guild` member list, then hydrates member rosters by `playerId` with bounded concurrency. Only public progression needed for ROTE eligibility is returned for guild members: Base ID, stars, gear and relic level. The initiating player's raw Comlink response is reused instead of being fetched twice.

## Data authority rules

- Comlink `/player` is authoritative for live player/account fields, including reported total, character and ship GP when present.
- Comlink `/guild` is authoritative for the current public guild profile and member list.
- SWGOH Stats enriches calculated per-unit statistics for individual player views. Guild ROTE hydration intentionally does not run SWGOH Stats for every member because ROTE Operation eligibility only needs public progression fields.
- Versioned SWGOH game data supplies shared unit, skill, recipe, ROTE Operation requirements and static portrait metadata.
- AE2 supplies live extracted artwork when available; the versioned static portrait remains the image fallback.
- Unavailable account-private inventory must never be represented as a fake zero balance.

`GET /api/player/:allyCode` therefore includes a `capabilities` object describing which optional data classes are actually available. Current public-player limitations include materials, currency balances, unequipped gear and unequipped mods.

## App environment

Copy `.env.example` into your deployment environment and set the shared gateway URL/key. Guild requests have a longer cold timeout and a separate cache policy from single-player roster requests.

```text
SWGOH_GATEWAY_URL=https://swgoh-live-gateway-production.up.railway.app
SWGOH_GATEWAY_API_KEY=<same secret as Railway SWGOH-Live-Gateway GATEWAY_API_KEY>
SWGOH_REQUEST_TIMEOUT_MS=35000
SWGOH_GUILD_REQUEST_TIMEOUT_MS=120000
SWGOH_CACHE_FRESH_SECONDS=90
SWGOH_CACHE_STALE_SECONDS=600
SWGOH_GUILD_CACHE_FRESH_SECONDS=600
SWGOH_GUILD_CACHE_STALE_SECONDS=1800
SWGOH_ROTE_CACHE_SECONDS=21600
```

## Railway gateway environment

The `SWGOH-Live-Gateway` service should use Railway private networking for its upstream services:

```text
COMLINK_URL=http://<comlink-private-domain>:3000
STATS_URL=http://<stats-private-domain>:3223
ASSET_URL=http://<ae2-private-domain>:8080
GATEWAY_API_KEY=<long random secret>
PUBLIC_BASE_URL=https://swgoh-live-gateway-production.up.railway.app
```

If Comlink access/secret keys are enabled, also set `COMLINK_ACCESS_KEY` and `COMLINK_SECRET_KEY` on the gateway to the matching values.

## Routes

- `GET /api/health` checks the public live gateway health endpoint and reports roster/guild/ROTE cache policies.
- `GET /api/player/:allyCode` securely proxies and normalizes a live individual roster request without exposing the gateway secret to the browser.
- `GET /api/guild/by-player/:allyCode/roster` returns the cached compact public guild roster used by Guild ROTE Operations.
- `GET /api/rote/operations` returns the cached, normalized current ROTE Operation requirements and exact slot definitions from versioned game data.
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
