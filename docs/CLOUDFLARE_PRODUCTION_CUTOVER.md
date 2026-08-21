# SWGOH Command Center — Cloudflare Production Cutover

## Target production architecture

```text
GitHub: Hunting-Fishing/Swgoh-App
        |
        | push to main
        v
Cloudflare Workers Builds
        |
        +--> Workers Static Assets -> public/
        |
        +--> Worker API -> existing server.mjs API implementation
                |
                +--> Supabase: canonical data, auth, snapshots, history
                |
                +--> SWGOH Live Gateway: explicit live refresh/enrichment only
                           |
                           +--> Comlink
                           +--> SWGOH Stats
                           +--> AE2
```

GitHub is the source of truth for production code. Cloudflare is the public application runtime and edge. Supabase remains the persistent application data/auth authority. Railway is no longer the website origin and should be retained only for live SWGOH services that still require a traditional long-running process.

## Cloudflare project

Create/import a Worker from the GitHub repository `Hunting-Fishing/Swgoh-App`.

Required settings:

- Worker name: `swgoh-command-center` (must match `wrangler.jsonc`)
- Production branch: `main`
- Build command: none required
- Deploy command: `npx wrangler deploy`
- Root directory: repository root
- Runtime configuration source of truth: `wrangler.jsonc`

The Wrangler configuration attaches both production hostnames:

- `https://swgohcommandcenter.com`
- `https://www.swgohcommandcenter.com`

Static files are served directly from `public/`. Requests under `/api/*` run through the Cloudflare Worker.

## Required Cloudflare Worker secrets / variables

Do not commit these values to GitHub. Copy the current production values from the active environment into Cloudflare Worker Settings > Variables and Secrets.

Required for canonical application data/auth:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Required while live SWGOH enrichment remains on the Railway live gateway:

- `SWGOH_GATEWAY_API_KEY`

Optional later integrations:

- `DISCORD_APPLICATION_ID`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_DEFAULT_GUILD_ID`
- `DISCORD_DEFAULT_ALLY_CODE`
- `DISCORD_TB_WEBHOOK_URL`

Non-secret production defaults are committed in `wrangler.jsonc`.

## Supabase production URL configuration

After the first Cloudflare deployment is healthy, update Supabase Auth URL Configuration so production authentication uses the new public origin:

- Site URL: `https://www.swgohcommandcenter.com`
- Production redirect allow-list: include `https://www.swgohcommandcenter.com/**`
- Add the apex hostname as an allowed redirect only if it will be used directly instead of redirecting to `www`.

Do not rotate or delete the current Supabase project during this cutover. This migration changes the application runtime/origin, not the canonical database.

## Acceptance checks before disabling the Railway Swgoh-App web service

1. `GET https://www.swgohcommandcenter.com/api/health` returns the expected production capability document.
2. Canonical player baseline returns a complete roster from Supabase.
3. Canonical Guild baseline returns the complete Guild membership from Supabase.
4. Explicit live player refresh reaches the live gateway successfully.
5. Explicit live Guild refresh reaches the live gateway successfully.
6. Login/session/logout work with Secure HttpOnly cookies on the Cloudflare hostname.
7. GAC War Room loads and saved-board/evidence routes work.
8. Static assets and SPA navigation load without routing failures.
9. Cloudflare Worker logs show no repeated runtime exceptions.
10. Only after 1-9 pass: stop the Railway `Swgoh-App` website service.

## Railway reduction target

Do not delete all Railway services at once. First remove the website service after Cloudflare acceptance passes. Then assess the remaining live-data services individually:

- `SWGOH-Live-Gateway` — keep during initial cutover.
- `my-swgoh-comlink` — keep while it is the authoritative live SWGOH transport.
- `Swgoh-Stats` — keep only if live calculated-stat enrichment is still used.
- `Swgoh-ae2` — keep only if runtime artwork extraction is still required.
- `Guild-Sync-Worker` — migrate to a scheduled/serverless workflow after the web cutover, then remove from Railway.

The long-term goal is for Railway spend to represent only unavoidable live game-data infrastructure, not the public website or canonical application data.
