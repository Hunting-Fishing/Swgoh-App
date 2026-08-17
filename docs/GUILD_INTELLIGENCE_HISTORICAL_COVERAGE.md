# Guild Intelligence Historical Coverage — Ludus Venatus

Source workbook: `LV Unit Tracker (new)`  
Workbook SHA-256: `4465e6e86933525be963ef10e93a12c4c33d861236f58d3a90864df91e57fe7d`

This document records the evidence boundary for the historical Guild Intelligence reconstruction. It is not permission to present historical/reference data as live event state.

## Current 29-page ledger status

Production baseline after reconstruction:

- 29 workbook modules registered
- 6 captured
- 20 partial
- 0 source-pending
- 3 legacy/reference-only
- 0 capture failures

`Partial` means real durable evidence exists, but the page still has a live-event, officer-state, or per-member detail lane to complete.

## Versioned historical archive

`guild_history_archives / ludus-workbook-history-v1`

- 666 Guild roster/GP snapshots
- 1,723 player-month development points
- 107 membership periods
- 16 confirmed RETURNED events
- 4,299 GL/Inquisitor tracked-unit milestones
- 961 Ticket days
- 136 source Raid events
- 81 ROTE events
- 76 Reva events

Coverage: 2022-12-23 through 2026-08-12.

## Normalized fast-query mirrors

### Tickets

`guild_ticket_history_snapshots`

- 961 dates
- 2023-12-24 through 2026-08-14
- latest observed: 29,020 Guild tickets, 50 members, 6 below 600, 0 at zero

Per-member ticket payload remains a later drill-down materialization lane; source evidence is retained in the versioned archive/workbook.

### Raid

`guild_raid_history_events`

- 134 normalized unique events
- 136 source events retained in the versioned archive (two exact source duplicates)
- 2023-11-25 through 2026-08-06
- raid families: Speeder Bike Pursuit, Battle For Naboo, Order 66

### ROTE

`guild_rote_history_events`

- 81 events
- 2023-06-12 through 2026-08-03
- persisted trend fields: mission TP, deployed TP, missed phases/deployments, Zeffo, Mandalore, Reva outcomes
- cumulative observed Zeffo wins: 231

### Reva

`guild_reva_history_events`

- 76 events
- 2023-08-07 through 2026-07-20
- 1,185 recorded shard earns

## Membership history

Confirmed RETURNED requires:

1. the same Ally Code observed in a complete Ludus roster,
2. at least one later complete roster observation where that Ally Code is absent,
3. a later source-reported fresh Guild join time.

Confirmed historical total: **16 RETURNED events across 7 players**.

No exact leave timestamp is fabricated. Where the workbook only proves disappearance between snapshots, the archive preserves a bounded window.

## GL / Inquisitor progression

The archive contains 4,299 tracked-unit milestone events over 19 GL/Inquisitor-related units. Historical relic tiers use the verified normalization:

`displayedRelic = max(0, rawRelicTier - 2)`

## Platoon reference coverage

These are requirement/reference datasets, **not live TB state**.

### ROTE Platoons

Reference key: `rote-platoons-lv-v1`

- 210 resolved units
- 167 characters
- 43 ships
- 3 zones
- Zone 1: 90 DS / 90 Mixed / 90 LS slots
- Zone 2: 90 DS / 90 Mixed / 90 LS slots
- Zone 3: 90 DS / 89 Mixed / 91 LS slots
- requirement payload SHA-256: `013850b741b227f9039dbd9364fc254c4f6dc1c3b1fc1140f82a80612bc6eaa4`

Live officer assignments and current TB event-state remain separate sources.

### EchoBase Platoons

Reference key: `echobase-platoons-lv-v1`

- 1,616 parsed requirement slots
- 1,616 / 1,616 unit names resolved to SWGOH base IDs
- 262 unique units
- 6 phases
- 3 alignment lanes: DS / Mixed / LS
- 6 operations per alignment
- relic distribution: R5 270, R6 270, R7 270, R8 270, R9 536
- requirement payload SHA-256: `0dd702d685dffbe3aa3ff06a61063b96922cc635e2cb9f0810bcbffd4d15d5f2`

The workbook is the forensic source. `platoon_reference_archives` stores compact, versioned coverage identity and hashes. Do not label this reference as current EchoBase or TB assignment state.

## Forward pipeline

Historical workbook evidence terminates into the same Guild Intelligence model that the automatic Guild-local midnight pipeline continues forward.

Future work should materialize per-member Ticket/Raid/ROTE/Reva drill-down and live TB/officer assignment state without changing the historical exactness rules above.
