# Guild History Archive v1 — Ludus Venatus

This archive backfills evidence-backed Guild Intelligence from the historical `LV Unit Tracker (new)` workbook while the canonical midnight pipeline continues forward from production.

## Source identity

- Workbook SHA-256: `4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d`
- Full compact archive gzip SHA-256: `a749ef616d9edba5fa401961c9c50a7248de05f74ece04b0aacd335c7a652a10`
- Historical coverage: `2022-12-23T01:47:39.094Z` through `2026-08-12T23:40:52.245Z`
- Operational archive key: `ludus-workbook-history-v1`
- Operational detail level: `summary-index-v1`

The production historical index is stored in `guild_history_archives`. The large workbook remains the source of truth; dashboard formulas are treated as derived views, while raw/history sheets are preferred evidence.

## Recovered historical lanes

| Lane | Evidence recovered |
| --- | ---: |
| Exact Guild roster/GP snapshots | 666 |
| Raw player-month development points | 1,723 |
| Continuous membership periods | 107 |
| Confirmed RETURNED events | 16 |
| Raw GL/Inquisitor milestone events | 4,299 |
| Daily Raid-ticket summaries | 961 |
| Raid events | 136 |
| ROTE events | 81 |
| Reva events | 76 |

The operational index groups the 4,299 unit milestones into compact `(unit,event-type,count,first,last)` series and aggregates player-month data into Guild/month development points. Detailed event families can be materialized from the workbook source if a future officer page needs per-player historical drilldown.

## Exactness rules

Historical events are never assigned fabricated timestamps.

- **RETURNED:** promoted only when the same Ally Code has prior complete-roster presence, at least one complete-roster absence, and a fresh source-reported `guild_join_time` for the later tenure.
- **LEFT:** the archive keeps a bounded window (`last observed present -> first observed absent`) unless an exact authoritative leave timestamp exists.
- **Roster/GP/tickets/Raid/ROTE/Reva:** dates and numeric values are stored as observed by the workbook source.
- **Display names:** are supporting metadata only; Ally Code/player identity is the membership key.

## Relic normalization

The historical workbook uses the raw SWGOH relic tier encoding. It was verified against current canonical units and is normalized as:

`displayedRelic = max(0, rawRelicTier - 2)`

This prevents historical R5/R7/R9 reporting from being off by two tiers.

## Ticket tuple

Historical ticket rows are compacted as:

`[date, memberCount, totalTickets, exact600Count, zeroTicketCount, below600Count]`

`zeroTicketCount` is a subset of `below600Count`.

## Raid tuple

`[date, raidName, rosterMembers, totalScore, participants]`

Source-identical duplicate Raid rows are preserved during import for provenance. User-facing history should de-duplicate exact `(date, raidName, totalScore, participants)` duplicates unless an officer explicitly requests raw-source rows.

## ROTE tuple

`[date, memberRecords, summedMemberTotalGp, deployedTp, missionTp, missionAttempts, missedPhases, zeffoCount, mandaloreCount, revaCount]`

The `summedMemberTotalGp` field is an aggregate from the workbook's member/phase data and must **not** be labeled as simple Guild GP.

## Access contract

Service-role-only RPCs:

- `read_guild_history_coverage(allyCode)`
- `read_guild_history_section(allyCode, section)`

Allowed sections:

`meta`, `dict`, `guildSnapshots`, `playerMonthly`, `membershipPeriods`, `returns`, `trackedUnitMilestones`, `tickets`, `raids`, `rote`, `reva`.

The web server should expose these through authenticated/read-only application endpoints and lazy-load one section at a time. Never send the complete archive on ordinary Guild page loads.
