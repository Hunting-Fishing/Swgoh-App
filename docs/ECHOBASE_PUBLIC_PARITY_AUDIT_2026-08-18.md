# EchoBase Public Capability Audit — 2026-08-18

This is the acceptance map for SWGOH Command Center's EchoBase-class Guild Operations work. It is based on the public EchoBase application/documentation at `echobase.app` / `docs.echobase.app`, not on private credentials or copied implementation code.

## Product rule

Command Center should reproduce the useful **operation**, not EchoBase branding, proprietary code, or weaker security patterns. Real game data, officer authorization, source freshness, preview fingerprints, and durable auditability remain mandatory.

## TB Platoon / ROTE Operations

| Capability | Command Center status | Acceptance note |
| --- | --- | --- |
| Guild-wide roster assignment optimizer | Implemented | Mission-safe scarcity planner uses canonical current roster. |
| Battle/phase picker | Implemented | ROTE P1-P6 layout selector. |
| Mixed/sandbag phase layout | Implemented | Multi-phase layout selection is durable in TB plans. |
| Requirement completeness gate | Implemented | Preview/publish readiness refuses unresolved active slots. |
| Ignore mission | Implemented | Plan overlay; reversible. |
| Ignore platoon/operation | Implemented | Plan overlay; reversible. |
| Ignore individual requirement slot | Implemented | Officer Requirement Editor. |
| Manual requirement override | Implemented | Per-slot unit/relic/rarity overlay; canonical source remains unchanged. |
| Clear/restore requirement | Implemented | Officer override can be removed to restore canonical requirement. |
| Exact pre-assignment | Implemented | Slot lock to current Guild player; current-member validation. |
| Grouping rules | Implemented | avoid/prefer pair, avoid-after, max assignments, protect-if-assigned. |
| GIVE / KEEP / DEFAULT | Implemented | Durable web + Discord preference controls. Mission safety outranks convenience. |
| Member ignore/availability | Implemented | Durable member controls including ignore-until timestamp. |
| Hard unit reserve | Exceeds | Absolute member/unit donor exclusion by ROTE phase. |
| Mission-safety protection | Exceeds | Combat-critical units are protected before GIVE/KEEP optimization. |
| Preview only | Implemented | Server-generated preview persisted with SHA-256 input fingerprint. |
| Publish confirmation | Implemented | Preview and publish are separate actions; explicit confirmation required. |
| Public Discord assignment post | Implemented | Verified destination only, delivery receipt + idempotency. |
| @mentions | Implemented | Stage 10.1 uses durable linked identities plus explicit Discord user allowlists; global/role parsing stays off. |
| Per-member DMs | Implemented in general delivery layer | Stage 10 immutable ROTE pilot intentionally keeps DMs disabled until a separate acceptance lane. |
| Keyboard efficiency | Implemented | Ctrl/Cmd+S, Ctrl/Cmd+Enter, Alt+1..5 workflow navigation. |
| Guild freshness / force refresh | Implemented | Operations page shows canonical sync age and force refresh action. |
| Platoon readiness / farm report | Implemented elsewhere | Guild Unit Matrix + ROTE coverage/farm queues provide richer roster intelligence. |

## TW Defense Assigner

| Capability | Command Center status | Acceptance note |
| --- | --- | --- |
| Territory priorities | Implemented | Priority validation requires at least one priority-1 territory. |
| Requested defense counts | Implemented | Durable zone plan. |
| Reusable team templates | Implemented | Structured team templates with minimum unit requirements. |
| Roster qualification | Implemented | Uses actual persisted current Guild roster. |
| No unit reuse | Implemented | Per-member unit reuse is rejected during defense assignment. |
| Scarcity-aware allocation | Implemented | Scarcity/load-aware team assignment. |
| Member load balancing | Implemented | Avoids concentrating all defenses on a small set of members. |
| Shortage reporting | Implemented | Unfilled requested defenses are explicit. |
| Preview / persisted run | Implemented | Same stale-preview safety model as TB. |
| Discord publish | Implemented | Uses verified Guild destination and delivery receipts. |
| Structured unit picker | Implemented | Officers do not need to memorize Base IDs for team creation. |

## Discord / EchoStation-class operations

| Capability | Current equivalent | Status |
| --- | --- | --- |
| Register/link player | `/tb link` + verified Command Center player identity | Implemented |
| Unlink player | `/tb unlink` | Implemented |
| List links | `/tb links` | Implemented |
| Player status | `/tb me`, `/tb availability`, `/tb preferences` | Implemented across focused commands |
| Donation preference | `/tb preference` | Implemented |
| Guild donation preference report | `/tb controls` / Operations workspace | Implemented, web is richer |
| Force Guild sync | `/tb sync` + web Refresh Guild Now | Implemented |
| Assignment preview | `/tb assignments` + immutable `/tb plan-delivery action:PREVIEW` | Implemented |
| Phase readiness | `/tb phase` | Implemented |
| Farm/readiness report | `/tb farms` + Unit Matrix | Implemented |
| Hard reserves | `/tb reserve`, `/tb reserves` | Command Center extension |
| Server/channel binding | `/tb setup` | Implemented baseline |
| Multiple verified Discord channels | `guild_discord_destinations` + Stage 10.1 `channel` selector | Implemented; selected delivery channels must already be verified for the bound Guild/server. |
| Verify/unverify channels | `/guild verify-channel`, `/guild unverify-channel` | Implemented |
| Guild registration status matrix | Partial across `/tb status`, links, controls, Operations | **Next parity lane** — consolidate one professional status view |
| Auto-match/register guild-mates by Discord nickname | `/guild register-mates` exact normalized matcher | Implemented fail-closed for unambiguous exact matches; no fuzzy auto-linking. |
| Guild/player language preference | Not implemented | **Next parity lane** — localization, not planner correctness |
| Guild PIN | Intentionally not cloned | Verified account + Ally Code + canonical in-game officer role is stronger authorization. |

## Scheduling / queueing

EchoBase advertises scheduled assignment execution and refresh-before-run. Command Center currently has strong durable Guild-sync queue infrastructure, retry/lease handling, midnight Guild Intelligence scheduling, and Discord retry/idempotency, but **automatic TB/TW assignment scheduling is not yet wired into the worker**.

This remains a required parity lane before claiming complete operational parity:

1. officer creates one-time or recurring TB/TW schedule;
2. schedule stores plan, destination, mention/DM policy, timezone and next-run timestamp;
3. worker first queues a forced canonical Guild refresh;
4. after successful refresh it creates a new preview against the refreshed roster;
5. stale/incomplete/unsafe previews fail closed;
6. only publish-ready previews may auto-publish;
7. every attempt has durable state, audit and delivery receipts;
8. retries are bounded and cannot duplicate Discord messages.

## UX acceptance standard

- no raw UUID is the primary officer-facing identity;
- no Base-ID memorization is required for normal workflows;
- every destructive/assignment-publish action has explicit confirmation;
- every planner screen displays Guild/source freshness;
- canonical requirement vs officer override is visually distinct;
- missing requirement, ignored requirement, locked/preassigned, protected, shortage and publish-ready states have distinct semantics;
- desktop layout remains dense but scan-friendly;
- mobile controls are touch-safe and do not rely on hover;
- tables/boards support keyboard focus and accessible labels;
- the app must never present imported historical/reference platoon data as current TB event state.

## Definition of "complete EchoBase-class parity"

Do not label the Command Center implementation as complete parity until the remaining **Next parity lane** items above are shipped or explicitly retired with a stronger equivalent. Core TB/TW planning and publish workflows may be released independently as EchoBase-class Operations v1.
