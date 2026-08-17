# Guild History Archive endpoints

Planned read-only application routes:

- `GET /api/guild/by-player/:allyCode/history/coverage`
- `GET /api/guild/by-player/:allyCode/history/archive?section=<allowed-section>`

The server delegates to service-role-only Supabase RPCs. Sections are allow-listed server-side and lazy-loaded. This prevents ordinary Guild pages from loading the full historical archive.
