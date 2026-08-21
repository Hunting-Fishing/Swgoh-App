# SWGOH Command Center — Cloudflare Edge + Railway Runtime

## Production architecture

```text
GitHub: Hunting-Fishing/Swgoh-App
        |
        | source of truth / deploys
        v
Railway
        |
        +--> Swgoh-App Node/Docker runtime
        |       |
        |       +--> Supabase: canonical data, auth, snapshots, history
        |       +--> live SWGOH gateway
        |
        +--> Comlink / Stats / AE2 / workers and other containerized services

Cloudflare
        |
        +--> swgohcommandcenter.com / www.swgohcommandcenter.com
        +--> static public/ assets at the edge
        +--> /api/* reverse proxy to the Railway Swgoh-App origin
```

GitHub is the source of truth for code. Railway remains the primary application compute/runtime platform and continues to host Docker/container services across the project. Supabase remains the persistent application data/auth authority. Cloudflare provides the public domain, edge delivery, static assets, and a lightweight reverse proxy for API traffic.

Cloudflare does **not** execute `server.mjs` or replace Railway's Node filesystem/process runtime.

## Cloudflare project

Import the GitHub repository `Hunting-Fishing/Swgoh-App`.

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

Static files are served directly from `public/`. Requests under `/api/*` run through the Cloudflare edge Worker and are proxied to Railway.

## Required Cloudflare variable

Cloudflare requires only one application-origin variable for the Railway bridge:

- `RAILWAY_APP_ORIGIN=https://<current-swgoh-app-public-domain>.up.railway.app`

This is the public Railway domain of the **Swgoh-App** service, not the separate SWGOH live-gateway domain.

The Worker intentionally does not need Supabase service-role credentials, the live gateway API key, Discord tokens, or other application secrets. Those remain on Railway, where the application backend already runs.

## Railway variables remain authoritative

Keep the existing backend environment on Railway, including:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SWGOH_GATEWAY_URL`
- `SWGOH_GATEWAY_API_KEY`
- Discord credentials and integration variables
- runtime/cache/storage variables used by the Node/Docker services

Do not copy server-only secrets into the Cloudflare edge unless a future architecture explicitly requires it.

## Supabase production URL configuration

When the Cloudflare domain becomes the public user-facing origin, configure Supabase Auth for that public hostname:

- Site URL: `https://www.swgohcommandcenter.com`
- Production redirect allow-list: include `https://www.swgohcommandcenter.com/**`
- Include the apex hostname only if users will access it directly rather than redirecting to `www`.

This changes the public authentication origin only. It does not move Supabase or Railway.

## Acceptance checks

1. Cloudflare deployment completes successfully.
2. `RAILWAY_APP_ORIGIN` points at the live Railway `Swgoh-App` public domain.
3. `GET https://www.swgohcommandcenter.com/api/health` reaches Railway and returns the expected capability document.
4. Canonical player baseline returns a complete roster from Supabase through Railway.
5. Canonical Guild baseline returns complete Guild membership through Railway.
6. Explicit live player/Guild refresh reaches the live gateway from Railway.
7. Login/session/logout work with Secure HttpOnly cookies on the Cloudflare hostname.
8. GAC War Room and other API-backed tools function through the proxy.
9. Static assets and SPA navigation load from Cloudflare correctly.
10. Railway services continue reporting healthy after the domain cutover.

## Infrastructure policy

Railway is retained as the shared Docker/container runtime for this and other repositories. Cost optimization should be done service-by-service through sizing, sleeping non-production workloads, caching, scheduled workers, or consolidating containers — not by removing Railway from the architecture.
