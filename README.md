# SWGOH Roster Command

Live-only Star Wars: Galaxy of Heroes roster management app.

Production roster data comes from the SWGOH Live Gateway backed by Comlink + SWGOH Stats, with AE2 used for live character artwork when available. No mock roster or fallback game data is permitted in production.

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
- `GET /api/player/:allyCode` securely proxies a live roster request without exposing the gateway secret to the browser.
- Static client files live in `public/`.

## Start

Requires Node.js 20 or newer.

```sh
npm start
```
