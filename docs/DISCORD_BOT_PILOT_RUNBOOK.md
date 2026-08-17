# SWGOH Command Center — Pilot Runbook & Master Checklist

**Purpose:** authoritative checkpoint for Discord + web + canonical SWGOH data bring-up. Update this file only from verified implementation/deployment results. Do not treat discussed future architecture as completed work.

**Current checkpoint:** **Canonical Guild/player persistence is accepted. Full 50-member / full-player roster semantics are enforced. The canonical-first web experience is deployed. The current guild-scoped Discord `/tb` schema is fail-closed auto-registered during Swgoh-App startup and was accepted in Railway-green production deployment `2838721`. The remaining gates are visual web acceptance and the live Stage 7 Discord member-control interaction sequence before Stage 8 ROTE acceptance.**

**Current operating mode:** signed HTTP Discord interactions, guild-scoped `/tb` pilot, live Comlink enrichment, durable Railway Volume pilot Discord state, Supabase authenticated web tenancy + canonical Guild/player current state/history, outbound Discord publishing/DM delivery disabled.

---

# 0. Ground rules

- Production behavior uses real SWGOH data; never silently present mock roster data as live.
- A backend transport page/chunk size is never a UI roster limit.
- Guild UI semantics are **all current members**; player roster semantics are **all currently owned units**.
- Canonical roster reads fail closed when persisted row counts do not match latest snapshot/member-count expectations.
- Live Comlink remains the explicit enrichment/refresh path for data the canonical baseline does not persist.
- Unknown gameplay metrics remain `NULL` / `—`; never convert unknown to fake `0`.
- Discord replies remain ephemeral during the pilot unless an explicitly approved publishing flow says otherwise.
- Public assignment publishing and member DMs stay disabled until immutable-plan approval, audit and delivery safeguards exist.
- Website Discord auto-discovery may reuse an existing durable Discord↔SWGOH link for Ally Code discovery, but does not replace SWGOH ownership proof.
- Regression coverage does not by itself count as live Discord acceptance; signed interactions must be exercised in the pilot server.
- When new work is discovered, add it here before claiming the checkpoint complete.

---

# MASTER CHECKLIST

## Stage 1 — Discord application + signed interaction endpoint ✅

- [x] Discord application ID, bot token and public key configured.
- [x] Pilot Discord guild ID configured.
- [x] `DISCORD_TB_INTERACTIONS_ENABLED` configured.
- [x] `/api/discord/interactions` accepts Discord signed interactions.
- [x] Ed25519 request-signature verification implemented.
- [x] Signed `application_id` validation implemented.
- [x] Discord PING verification works.
- [x] Pilot Guild restriction works.
- [x] `/tb status` responds successfully.
- [x] Replies are ephemeral by default.
- [x] `allowed_mentions` suppresses accidental pings.

Verified pilot Discord server:

```text
1422643338586099745
```

---

## Stage 2 — `/tb` command registration ✅ current schema accepted

- [x] Guild-scoped `/tb` registration script exists.
- [x] Required/optional Discord option ordering bug fixed.
- [x] Registration diagnostics print nested Discord schema errors.
- [x] Original `/tb` pilot schema successfully registered.
- [x] Current schema includes verified unit autocomplete for `/tb preference unit:`.
- [x] Current schema includes officer `/tb activity`.
- [x] Current schema includes officer `/tb controls [member]`.
- [x] Swgoh-App startup auto-registers the current guild-scoped schema before `server.mjs` starts.
- [x] Local/unconfigured environments skip registration only when Discord interactions are disabled.
- [x] An active pilot fails startup if command-registration credentials are incomplete.
- [x] Discord registration retries transient network / HTTP 429 / 5xx failures up to three attempts.
- [x] Each Discord registration request is bounded by a 15-second timeout.
- [x] Production merge `2838721` reached Railway **success** for Swgoh-App and Guild-Sync-Worker with fail-closed registration enabled; therefore Discord accepted the current guild-scoped schema before Swgoh-App became healthy.
- [ ] Visually confirm the Discord client exposes `/tb activity`, `/tb controls`, and the `/tb preference unit:` autocomplete picker during Stage 7 live acceptance.

Current command surface:

```text
/tb status
/tb setup [channel] [officer_role]
/tb sync
/tb activity
/tb controls [member]
/tb phase phase:P1..P6
/tb assignments [phase:P1..P6]
/tb farms [phase:P1..P6]
/tb link member:<Discord user> ally_code:<9-digit code>
/tb unlink member:<Discord user>
/tb links
/tb me
/tb preference unit:<search/autocomplete> preference:<GIVE|DEFAULT|KEEP> [member]
/tb preferences [member]
/tb availability [member] [state:<AVAILABLE|UNAVAILABLE>]
```

> Normal production deployments now self-register the current pilot schema. `npm run discord:register-tb` remains available as an explicit operator command but is no longer a required deployment step.

---

## Stage 3 — durable Discord state ✅

- [x] Persistent Railway Volume attached to **Swgoh-App** and mounted at `/data`.
- [x] `/tb setup` performs atomic durable writes with audit events.
- [x] Durable Guild setup state is operational.

Pilot state path:

```text
/data/swgoh-command-center/discord-state-v1.json
```

---

## Stage 4 — Discord server → SWGOH Guild setup ✅

- [x] `DISCORD_DEFAULT_ALLY_CODE` configured for pilot bootstrap.
- [x] `/tb status` reports SWGOH seed configured.
- [x] Custom officer role created; `@everyone` is not used as officer role.
- [x] Pilot operator assigned `@Commands Officer`.
- [x] `/tb setup` succeeded and persisted `#bot-for-raid` plus `@Commands Officer`.
- [x] Publishing and DMs remained disabled.

Verified setup:

```text
Discord server: 1422643338586099745
Command channel: #bot-for-raid
Officer role: @Commands Officer
```

---

## Stage 5 — live Guild synchronization ✅

Verified Discord sync:

```text
Guild: Ludus Venatus
Live roster refresh: complete
Hydrated rosters: 50/50
Guild GP: 574,260,422
```

- [x] Correct live Guild resolved: **Ludus Venatus**.
- [x] Live Guild hydration completed **50/50**.
- [x] Sync remained read-only for TB assignments/officer state.
- [x] No mock/fallback roster presented as live.
- [ ] Later resilience acceptance: confirm normal live reads continue from durable Guild binding when the environment Ally Code fallback is unavailable.

---

## Stage 6 — verified identity + canonical data foundation ✅

### Discord↔SWGOH player link

- [x] SWGOH player: **Warm Bacon**.
- [x] Ally Code: **732-764-286**.
- [x] Membership verified against current Ludus Venatus roster.
- [x] Link persisted durably and was audited.
- [x] `/tb links` returns the linked member and suppresses mentions.

### `/tb me` acceptance

Accepted result:

```text
SWGOH player: Warm Bacon · 732-764-286
Guild: Ludus Venatus
Galactic Power: 12,654,861
Hydrated roster units: 394
```

- [x] Rich linked-player reads enabled.
- [x] GP normalization added where direct GP is absent.
- [x] Hydrated roster remained **394 units**.
- [x] User-facing cache wording distinguishes fresh live fetches.
- [x] Code-level target-isolation regression proves normal member self-service rejects another Discord member.
- [ ] Live Discord negative-permission acceptance: normal member attempts another-member target and receives denial.

### Website identity / ownership

- [x] Discord OAuth persists provider user ID in `user_social_identities`.
- [x] Production account has Google + Discord identities attached to one Command Center user.
- [x] Discord `/tb link` can be reused for Ally Code discovery during onboarding without bypassing SWGOH ownership proof.
- [x] Ownership challenge completed successfully for **Warm Bacon / 732-764-286 / Ludus Venatus**.
- [x] `verification_status = verified`; `verification_method = cosmetic_challenge`.
- [x] Guild membership transitioned to `active`.
- [x] Personalized verified-user arrival screen visually accepted.
- [ ] Verify a clean future-user flow skips manual Ally Code entry when `/tb link` already exists.
- [ ] Add Account Settings → Connect Discord for accounts whose providers are not already attached.

### Canonical Supabase persistence

- [x] Fully hydrated Comlink roster is authoritative baseline input; optional Stats enrichment does not block persistence.
- [x] Guild ingestion uses bounded member pages/staging and bounded member RPC processing.
- [x] Guild finalization remains atomic after all member batches succeed.
- [x] Production sync completed **50/50 on attempt 1** under the bounded pipeline.
- [x] `guild_members_current` contains all **50 current members**.
- [x] `player_units_current` contains **19,051 current Guild units**.
- [x] Daily player snapshots exist for all **50 members** and a Guild snapshot exists.
- [x] Canonical player/Guild reads fail closed if expected counts do not match loaded counts.

Current Warm Bacon canonical baseline:

```text
Owned units: 394
Characters: 325
Ships: 69
GP: 12,655,455
Character GP: 8,146,249
Ship GP: 4,515,899
Galactic Legends: 8
Zetas: 282
Omicrons: 28
Ultimates: 8
```

Current Guild canonical baseline:

```text
Guild: Ludus Venatus
Members: 50
Current units: 19,051
Guild GP: 574,397,661
Zetas: 14,174
Omicrons: 2,050
Ultimates: 323
```

### Ability evidence + history

- [x] Static catalog populated for player-obtainable units and ability definitions.
- [x] Compact per-skill raw tier evidence persisted for character abilities.
- [x] Character Zeta/Omicron classification reaches zero unknown material-bearing character skills in the pilot Guild.
- [x] Omega/Eta remains unknown where ship ability identifiers are not authoritative and displays as `NULL` / `—`, not `0`.
- [x] Progression history false positives cleaned up and immediate resync is idempotent.
- [x] Player/Guild history APIs expose persisted snapshots + genuine progression events.
- [x] Initial 50-member import is treated as a **BASELINE**, not falsely shown as 50 live joins.
- [x] Provenance-aware Ludus Venatus historical archive backfilled to 2022.
- [x] Normalized historical Guild event archives and historical coverage RPCs exist for Guild Intelligence, including ROTE/Zeffo/platoon reference lanes.

---

# Web Command Center read layer 🔴 visual acceptance remains

## Full-list semantics ✅

- [x] Guild Command normal load is canonical-first and returns all **50 current members**.
- [x] Selected member/player roster returns the entire owned roster.
- [x] Warm Bacon invariant: **394 = 325 characters + 69 ships**.
- [x] Explicit Guild refresh remains the rich/live Comlink path.

## Roster / history intelligence ✅ implementation

- [x] Canonical full owned roster is the default source.
- [x] Live-only filters promote the view to rich live data when needed.
- [x] Unknown persisted fields render `—`, not fake zeroes.
- [x] Shared browser fetch cache coalesces canonical roster/history reads.
- [x] Player and Guild Progression Ledgers exist.
- [x] Officer Guild History workspace exposes versioned historical archives independently from current-state history.
- [x] Historical Guild event coverage is surfaced with source-specific detail levels rather than fabricated current-state precision.

## Player Command Center 🚀 deployed; visual acceptance pending

- [x] Canonical Player Command model and full-roster semantics.
- [x] Current roster state: GP, character/ship GP, roster counts, GLs, relic depth, Zetas, Omicrons, Ultimates.
- [x] Guild-relative ranks are independent metrics rather than a fabricated composite score.
- [x] ROTE Operations requirement pressure and evidence-separated development queue are surfaced.
- [x] Persistent `What Changed` history is surfaced.
- [x] One-click full-roster and ROTE-required-unit handoffs exist.
- [x] Explicit persisted refresh and **Refresh Live Detail** promotion exist.
- [x] Legacy hero/main Ally Code loader is capability-aware canonical-first.
- [x] Persisted unknown Zeta/Omega-Eta/Omicron/mod/datacron/competitive fields remain `N/A` / `—` rather than fake zero.
- [x] Railway deployment is green through production merge `2838721`.
- [ ] Hard-refresh the app and visually accept Player Command Overview.
- [ ] Verify **Open Full Roster** exposes all **394** owned units in production.
- [ ] Verify **Refresh Live Detail** promotes to Comlink while preserving canonical roster completeness and source labels.

Current pilot Guild-relative Warm Bacon ranks:

```text
Total GP: #19 / 50
Character GP: #18 / 50
Ship GP: #21 / 50
Galactic Legends: #19 / 50
R7+ depth: #21 / 50
R9 depth: #30 / 50
Zetas: #27 / 50
Omicrons: #36 / 50
```

---

## Stage 7 — Discord member TB controls 🔴 LIVE ACCEPTANCE NEXT

**Implementation status:** member-control persistence, planner integration, authorization, autocomplete and officer drill-down are implemented with regression coverage. **The command-registration gate is cleared.** Production merge `2838721` reached Railway success with fail-closed startup registration enabled. The remaining Stage 7 work is the signed live Discord interaction sequence below.

### Availability implementation ✅

```text
/tb availability
/tb availability state:UNAVAILABLE
/tb availability state:AVAILABLE
```

- [x] Read-own-status path implemented.
- [x] `UNAVAILABLE` verifies current bound-Guild membership before writing.
- [x] `AVAILABLE` clears the durable exclusion without requiring the live gateway.
- [x] Unavailable member is excluded from ROTE donor candidates in planner regression coverage.
- [x] Officer-target path is implemented; normal-member cross-target rejection is covered by tests.

### Donation preferences implementation ✅

```text
/tb preference unit:<search/autocomplete> preference:GIVE
/tb preference unit:<search/autocomplete> preference:KEEP
/tb preference unit:<search/autocomplete> preference:DEFAULT
/tb preferences
```

- [x] GIVE/KEEP verify current unit ownership before persistence.
- [x] DEFAULT clears an explicit override without requiring a live-gateway read.
- [x] Planner consumes durable GIVE/KEEP controls.
- [x] Mission protections outrank ordinary donor preference; hard reserves remain absolute.
- [x] KEEP can be used only as an explicit last-resort override when no safer owner exists.

### Member-control UX ✅ implementation

- [x] Unit entry uses verified SWGOH unit autocomplete in the registered schema.
- [x] Officer-readable `/tb controls [member]` drill-down added.
- [x] `/tb activity` includes compact member-control totals.
- [x] Officer responses are ephemeral/read-only with mention parsing suppressed.

### Stage 7 live Discord acceptance — REQUIRED

The current schema is already registered by the green `2838721` deployment. Execute these in the pilot Discord server:

1. As the linked pilot member, run `/tb availability` and record current status.
2. Run `/tb availability state:UNAVAILABLE`; confirm live Guild verification succeeds.
3. Run `/tb assignments phase:P1`; confirm the member is absent from eligible donor selections where they would otherwise qualify.
4. Run `/tb availability state:AVAILABLE`; confirm the exclusion clears.
5. Use `/tb preference unit:<autocomplete>` to choose a unit actually owned by Warm Bacon and set `GIVE`.
6. Run `/tb preferences`; confirm the GIVE control is persisted.
7. Run `/tb assignments phase:P1`; confirm preference changes donor priority only where mission safety allows it.
8. Change the same unit to `KEEP`; verify the planner avoids that donor when a safer alternate owner exists.
9. Change the same unit to `DEFAULT`; verify the override disappears.
10. As an officer, run `/tb controls` and `/tb controls member:<pilot member>`; confirm exact availability/GIVE/KEEP state without pings.
11. From a normal linked-member account, attempt `/tb availability member:<another member>` or `/tb preferences member:<another member>` and confirm denial.
12. Leave the pilot member `AVAILABLE` with no unintended test preference overrides after acceptance.

Do **not** mark Stage 7 live-complete from regression tests or deployment status alone; the signed Discord command paths must be exercised in the pilot server.

---

## Stage 8 — live ROTE intelligence acceptance

```text
/tb phase phase:P1
/tb assignments phase:P1
/tb farms phase:P1
```

- [ ] `/tb phase` returns live phase command-board metrics.
- [ ] `/tb assignments` returns a mission-safe Operation donor draft.
- [ ] `/tb farms` returns verified mission-impact farm priorities.
- [ ] Availability exclusions and GIVE/KEEP preferences alter donor priority correctly.
- [ ] Mission protections and hard reserves remain enforced.
- [ ] Forced/risky assignments are clearly marked HELP/risk.
- [ ] Planner GP tie-break inputs are non-zero/credible.
- [ ] Generic fleet gates are not presented as exact-ready when selectable-ship evidence is incomplete.

The bot does **not** yet infer the live in-game ROTE phase. Officers select P1-P6 until a verified live TB-state source exists.

---

## Stage 9 — immutable assignment-plan safety

- [ ] Add immutable assignment plan versions and persisted hash/version metadata.
- [ ] Add explicit officer preview and approval.
- [ ] Prevent edited/stale plans from publishing under prior approval.
- [ ] Add approval audit trail, cancellation/supersede behavior and officer-readable version deltas.

---

## Stage 10 — controlled publishing + delivery

Current pilot safety:

```text
DISCORD_TB_DELIVERY_ENABLED=false
```

- [ ] Build rate-limited outbound queue and per-message delivery status.
- [ ] Retry transient Discord failures safely and dead-letter permanent failures.
- [ ] Add preview → approve → publish flow.
- [ ] Restrict targets to configured Guild destinations.
- [ ] Add safe member mention handling and controlled/opt-in member DMs.
- [ ] Audit every public post/DM delivery event.
- [ ] Ensure recalculation cannot silently alter an approved plan.
- [ ] Enable delivery only after pilot acceptance.

---

# PARKED COMMERCIAL / SCALE BACKLOG

- [ ] Multi-Guild tenant-safe Discord onboarding/install/offboarding.
- [ ] Migrate pilot Discord JSON state to transactional PostgreSQL tenancy.
- [ ] Final custom domain + OAuth branding/callback cutover.
- [ ] Free / Officer / Guild Pro entitlements and billing.
- [ ] Expand TW, mods, farming, recruiting and Guild-health intelligence with verified sources.
- [ ] Legal/platform review for Discord production and SWGOH/EA/CG/third-party data/art usage.

---

# Authorization model

- `/tb setup`: Manage Guild / Manage Server or Administrator.
- Guild-wide officer commands: Manage Guild, Administrator, or configured `@Commands Officer` role.
- Normal linked-member self-service: `/tb me`, `/tb preference`, `/tb preferences`, `/tb availability` for self only.
- Cross-member actions require officer authorization.

---

# Fail-closed expectations

Refuse/degrade safely when:

- Discord signature is invalid or signed `application_id` mismatches;
- pilot Guild restriction fails;
- active-pilot registration credentials are missing or Discord rejects the current command schema during startup;
- durable shared state is unavailable for a write;
- live SWGOH gateway is unavailable when verification is required;
- link target is not in the bound Guild;
- GIVE/KEEP target unit is not owned;
- a non-officer targets another Discord member;
- canonical Guild member count or player owned-unit count is incomplete;
- verified mission evidence is incomplete.

---

# Immediate next action — do not skip

1. **Production deployment `2838721` is green for Swgoh-App and Guild-Sync-Worker. Current Discord schema registration is accepted; no manual re-registration is required.**
2. Hard-refresh the production app and visually verify Player Command Overview for **Warm Bacon / 732-764-286**.
3. Confirm Guild-relative ranks use the full **50-member** canonical baseline.
4. Open Full Roster and verify **394 = 325 characters + 69 ships**.
5. Trigger **Refresh Live Detail** and verify live enrichment preserves canonical completeness and never relabels unknown evidence as zero.
6. Execute the **Stage 7 live Discord acceptance sequence** above and return the pilot member to AVAILABLE/default preference state.
7. Only after Stage 7 passes, proceed to Stage 8 live ROTE command acceptance.
8. Do not enable public publishing or DMs; Stage 9 immutable-plan safety and Stage 10 delivery controls remain prerequisites.

---

# Change log

- 2026-08-18: Railway reported **Swgoh-App** and **Guild-Sync-Worker** successful for `2838721`. Active-pilot startup now fail-closes around current guild-scoped Discord schema registration, retries transient failures up to three times and bounds each request to 15 seconds. The Stage 2 registration gate is cleared.
- 2026-08-18: Added normalized historical Guild event archives and source-specific Guild Intelligence historical coverage, including ROTE/Zeffo/platoon reference lanes.
- 2026-08-18: Railway reported both services successful for `c34d775`; canonical progression nullability is deployed across Zeta/Omega/Omicron evidence boundaries.
- 2026-08-18: Player Command Center, canonical/history fetch coalescing, Guild-relative ranks, ROTE pressure and live-detail promotion recorded.
- 2026-08-18: Canonical persistence accepted: full 50-member / 19,051-unit Guild baseline and Warm Bacon 394-unit baseline.
- 2026-08-17: Web ownership verification passed for **Warm Bacon / 732-764-286 / Ludus Venatus**.
- 2026-08-17: Personalized verified-user arrival screen visually accepted.
- 2026-08-17: `/tb setup` succeeded with `#bot-for-raid` and `@Commands Officer`.
- 2026-08-17: `/tb sync` succeeded against **Ludus Venatus**, hydrating **50/50** rosters.
