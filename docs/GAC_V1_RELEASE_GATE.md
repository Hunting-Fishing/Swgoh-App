# GAC Command Center v1 — Production Release Gate

Policy version: `2026-08-21-b18`

## Production surfaces

- Live/canonical player roster truth and B06 integrity gate.
- Verified current opponent + round confirmation.
- Canonical squad board capture with hidden-territory semantics.
- Round-wide non-overlapping attack allocation.
- B08 exact pre-battle fingerprint and explicit confirmation gate.
- B09 Win/Loss result capture with nullable banners.
- B10 survivor-gated cleanup and chained cleanup anti-resurrection rules.
- B11 Cleanup Attack Brief with exact-source-only execution guidance.
- Canonical fleet board, attack lifecycle, verified archive, post-loss observation, cleanup provenance, and round resource integrity.
- B15 mechanic-aware Datacron counter intelligence. Datacron level is never an arbitrary power multiplier.
- B16 normalized evidence warehouse.
- B17 18-scenario acceptance manifest + concurrent warehouse load harness.
- B18 bounded public warehouse read API and release-status contract.

## Public evidence read policy

`GET /api/gac/evidence/warehouse`

- Public result cap: 250 normalized records/request.
- Canonical cache key: format + battle type + enemy leader + source family + evidence kind + bounded limit.
- Process-local coalesced LRU: 256 keys.
- Fresh window: 30 seconds.
- Stale window: 180 seconds; stale may be served while refresh occurs.
- Max concurrent unique cache-miss loads per process: 24.
- Admission rejection: HTTP 429 + `Retry-After: 2`.
- Response provenance: `X-GAC-Source`, `X-GAC-Cache`, `X-GAC-Read-Policy`, `Age`.
- Cache is intentionally process-local; Railway horizontal instances do not pretend to share an in-memory cache.

`GET /api/gac/release-status`

Returns the machine-readable release/truth contract. It must not expose user-specific data.

## Non-negotiable truth boundaries

- No mock live GAC roster, board, opponent, attempt, or fleet data.
- Unknown values remain unknown; they do not become zero/none.
- Legacy history without Datacron evidence means `not-recorded`, not `none`.
- Fleet Datacrons are not applicable.
- Historical fleet starter/reinforcement roles remain unknown unless explicitly owner-confirmed.
- Observed historical win rate is not a predicted win probability.
- Tactical execution is displayed only from an approved exact strategy record matching composition, format, validity, and Datacron constraints.
- A quarantined or missing tactical source never falls back to invented opening moves, target order, or turn sequence.

## Tactical source-pack release classification

3v3 and 5v5 tactical source pipelines are **quarantine enforced**. This is a valid production state: the product may use historical counter evidence and roster-fit planning while execution guidance remains locked for matchups that do not have a fully reviewed current source record.

A source pack is not to be marked "approved" merely because a historical counter page or aggregate statistic exists. Approval requires canonical Base IDs, exact composition, explicit Datacron scope, current validity, provenance, and a source-supported execution sequence.

## Production gate

A release slice is production-green only when:

1. PR is merged to `main`.
2. GitHub Actions failure is classified. `steps:null` + `logs_url:null` means the known pre-run CI infrastructure failure and is not treated as a test assertion.
3. Railway commit status is SUCCESS for both `Swgoh-App` and `Guild-Sync-Worker`.
4. No source/truth boundary above was relaxed.
