# SWGOH Command Center — Guild Intelligence Workbook Map

Source workbook: **LV Unit Tracker (new)**

This document is a permanent migration guardrail. Every workbook worksheet is represented by the Guild Intelligence registry and receives a daily ledger row. A page must not be considered implemented merely because it is registered: `active`, `partial`, `pending_source`, and `legacy_reference` are intentionally distinct states.

## Daily capture contract

- One report per Guild-local calendar date.
- Default existing Ludus Venatus schedule: `America/Phoenix` at `00:00:00`.
- The scheduler queues a forced rich Guild sync (`include_activity=true`, `force_refresh=true`) before capture.
- All 29 registry modules receive a daily page row.
- `captured` means the durable source is implemented.
- `partial` means useful durable evidence is captured but workbook parity is incomplete.
- `source_pending` means the page is registered but the dedicated game/event/external source is not implemented yet.
- `not_applicable` is reserved for legacy/reference worksheets that should not be fabricated as current game events.
- Membership movement must distinguish **Joined**, **Left**, and **Returned**. Returned means the same canonical player reappears after a prior Left event.

## Workbook → Guild Intelligence map

| # | Workbook sheet | Guild Intelligence key | Phase | Current state | Primary durable/source target |
|---:|---|---|---:|---|---|
| 1 | GR Dashboard | `gr_dashboard` | 1 | partial | Guild/player snapshots, activity, membership history, units; mods/datacrons later |
| 2 | Member Data | `member_data` | 1 | partial | Players, current members, member activity, player snapshots |
| 3 | Zeffo | `zeffo` | 3 | pending_source | Player units + Zeffo requirement rules |
| 4 | M- Dashboard | `m_dashboard` | 3 | pending_source | TB event history + member TB performance |
| 5 | M- Player Performance | `m_player_performance` | 3 | pending_source | TB event history + member TB performance |
| 6 | ROTE Data | `rote_data` | 3 | pending_source | Normalized TB/ROTE event and mission facts |
| 7 | Scorecards | `scorecards` | 2 | partial | Activity/history + Raid/TB/officer evidence |
| 8 | Raid Performance | `raid_performance` | 4 | pending_source | Raid events + member Raid results |
| 9 | Raid Progress | `raid_progress` | 4 | pending_source | Raid event/result history |
| 10 | Ticket Dashboard | `ticket_dashboard` | 2 | partial | Member activity/contribution evidence |
| 11 | tickets | `tickets` | 2 | partial | Raw member activity/ticket evidence |
| 12 | ROTE Perf | `rote_perf` | 3 | pending_source | TB event history + member TB performance |
| 13 | ROTE Operations | `rote_operations` | 2 | partial | Current units + ROTE Operation rules + officer assignments |
| 14 | ROTE Summary | `rote_summary` | 3 | pending_source | TB event history + member TB performance |
| 15 | GL Report | `gl_report` | 1 | active | Current units + game-unit catalog |
| 16 | Inquisitor Dashboard | `inquisitor_dashboard` | 1 | active | Current units + game-unit catalog |
| 17 | M- Processing Cache | `m_processing_cache` | 1 | partial | Snapshot/sync provenance; replaces spreadsheet calc cache |
| 18 | Member Data Backup | `member_data_backup` | 1 | active | Durable player daily snapshots |
| 19 | Raid History | `raid_history` | 4 | pending_source | Raid event metadata/history |
| 20 | Raid Data | `raid_data` | 4 | pending_source | Per-event per-player Raid results |
| 21 | Endor Perf Data | `endor_perf_data` | 6 | legacy_reference | Historical workbook import/reference |
| 22 | ROTE Reva | `rote_reva` | 3 | pending_source | TB event + Reva mission results |
| 23 | Absences | `absences` | 1 | active | Officer-managed `guild_member_absences` |
| 24 | ROTE Platoons | `rote_platoons` | 3 | pending_source | Operation rules + assignments + TB event state |
| 25 | About Guild Report | `about_guild_report` | 1 | active | Guild Intelligence registry/provenance |
| 26 | Relationships | `relationships` | 1 | active | Officer-managed `guild_member_relationships` |
| 27 | EchoBase Platoons | `echobase_platoons` | 5 | pending_source | EchoBase import/integration |
| 28 | Echobase Ops- Old | `echobase_ops_old` | 6 | legacy_reference | Historical workbook import/reference |
| 29 | Sheet40 | `sheet40` | 6 | legacy_reference | Historical platoon matrix/import reference |

## Implementation rule for later phases

When a later phase adds ROTE, Raid, ticket, EchoBase, mod, datacron, absence, relationship, or officer-state data, update the corresponding registry module and daily payload in the same change. Do not create a new parallel dashboard that bypasses this registry unless the workbook capability is explicitly superseded and the migration is recorded here.

The production source of truth is `guild_intelligence_page_registry`; this file is the human-readable engineering map.