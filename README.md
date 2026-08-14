# SWGOH Roster Command

Live-only Star Wars: Galaxy of Heroes roster management app.

Production roster data comes from the SWGOH Live Gateway backed by Comlink + SWGOH Stats, with AE2 used for live character and ship artwork when available. No mock roster or fallback player data is permitted in production.

## Live architecture

```text
Browser / ChatGPT Site
        |
        | GET /api/player/:allyCode
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

## Data authority rules

- Comlink `/player` is authoritative for live player/account fields, including reported total, character and ship GP when present.
- SWGOH Stats enriches calculated per-unit statistics. A per-unit calculated GP sum is diagnostic/fallback data and must not overwrite valid Comlink profile GP.
- Versioned SWGOH game data supplies shared unit, skill, recipe and static portrait metadata.
- AE2 supplies live extracted artwork when available; the versioned static portrait remains the image fallback.
- Unavailable account-private inventory must never be represented as a fake zero balance.

`GET /api/player/:allyCode` therefore includes a `capabilities` object describing which optional data classes are actually available. Current public-player limitations include materials, currency balances, unequipped gear and unequipped mods.

## App environment

Copy `.env.example` into your deployment environment and set:

```text
SWGOH_GATEWAY_URL=https://swgoh-live-gateway-production.up.railway.app
SWGOH_GATEWAY_API_KEY=<same secret as Railway SWGOH-Live-Gateway GATEWAY_API_KEY>
SWGOH_REQUEST_TIMEOUT_MS=35000
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

- `GET /api/health` checks the public live gateway health endpoint.
- `GET /api/player/:allyCode` securely proxies and normalizes a live roster request without exposing the gateway secret to the browser.
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
