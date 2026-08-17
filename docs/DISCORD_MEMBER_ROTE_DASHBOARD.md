# Discord `/tb me` Personal ROTE Dashboard

`/tb me` is an ephemeral member self-service view. It now combines the caller's durable Discord ↔ SWGOH player link with the same mission-safe ROTE planning snapshot used by officer commands.

## Personal data shown

- linked SWGOH player, Ally Code, guild, GP, and hydrated roster-unit count;
- verified exact-mission readiness, sole-owner missions, and close missions;
- the member's Operation assignments and any assignment requiring a safety check;
- protected units that the planner should avoid consuming carelessly;
- highest-impact farm targets and affected ROTE phases.

## Safety boundary

The command remains read-only and ephemeral. It cannot target another Discord member, publish assignments, change locks, or send DMs.

The ROTE enrichment is best-effort. The durable linked-player profile remains available if the ROTE operations/planning source is temporarily unavailable; the response reports that the ROTE dashboard could not be enriched instead of failing the entire `/tb me` command.

## Data reuse

Production `/tb me` injects the existing live TB planning service. The linked-player lookup and planner share the process-wide guild roster cache, so a fresh linked-player roster lookup can be reused by the planning pass rather than forcing an additional cold guild fetch.
