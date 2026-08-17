# SWGOH Command Center — Pilot Runbook & Master Checklist

**Purpose:** authoritative checkpoint for Discord + web + canonical SWGOH data bring-up. Update this file only from verified implementation/deployment results. Do not treat discussed future architecture as completed work.

**Current checkpoint:** **Canonical Guild/player persistence is accepted. Full 50-member / full-player roster semantics are enforced. Player Command Center is implemented and awaiting the current Railway deployment acceptance. After that, return to the remaining Stage 7 Discord member-control acceptance tests.**

**Current operating mode:** signed HTTP Discord interactions, guild-scoped `/tb` pilot, live Comlink gateway, durable Railway Volume pilot state, Supabase authenticated web tenancy + canonical Guild/player history, outbound Discord publishing/DM delivery disabled.

---

# 0. Ground rules

- Production behavior uses real SWGOH data; never silently present mock roster data as live.
- A backend transport page/chunk size is never a UI roster limit.
- Guild UI semantics are **all current members**; player roster semantics are **all currently owned units**.
- Canonical roster reads fail closed when persisted row counts do not match the latest snapshot/member-count expectation.
- Live Comlink remains the explicit enrichment/refresh path for data the canonical baseline does not persist.
- Unknown gameplay metrics remain `NULL` / `—`; never convert unknown to fake `0`.
- Discord replies remain ephemeral during the pilot unless an explicitly approved publishing flow says otherwise.
- Public assignment publishing and member DMs stay disabled until immutable-plan approval, audit, and delivery safeguards exist.
- Website Discord auto-discovery may reuse an existing durable Discord↔SWGOH link for Ally Code discovery, but does not replace SWGOH ownership proof.
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
- [x] Pilot guild restriction works.
- [x] `/tb status` responds successfully.
- [x] Replies are ephemeral by default.
- [x] `allowed_mentions` suppresses accidental pings.

Verified pilot Discord server:

```text
1422643338586099745
```

---

## Stage 2 — `/tb` command registration ✅

- [x] Guild-scoped `/tb` registration script exists.
- [x] Required/optional Discord option ordering bug fixed.
- [x] Registration diagnostics print nested Discord schema errors.
- [x] `/tb` successfully registered.

Verified registration:

```text
Registered 1 guild-scoped Discord command in 1422643338586099745.
- /tb (1538621439698272296)
```

Registered pilot command surface:

```text
/tb status
/tb setup [channel] [officer_role]
/tb sync
/tb phase phase:P1..P6
/tb assignments [phase:P1..P6]
/tb farms [phase:P1..P6]
/tb link member:<Discord user> ally_code:<9-digit code>
/tb unlink member:<Discord user>
/tb links
/tb me
/tb preference unit:<Base ID> preference:<GIVE|DEFAULT|KEEP> [member]
/tb preferences [member]
/tb availability [member] [state:<AVAILABLE|UNAVAILABLE>]
```

> Re-run `npm run discord:register-tb` only when the slash-command schema actually changes.

- [ ] If `/tb activity` remains in code, verify whether it changes the registered slash schema; do not claim it live until registration is re-run and Discord confirms it.

---

## Stage 3 — durable Discord state ✅

- [x] Persistent Railway Volume attached to **Swgoh-App**.
- [x] Volume mounted at `/data`.
- [x] `/data` verified in Railway Console.
- [x] `/tb setup` performed an atomic durable write.
- [x] `/tb setup` reported an audit event.
- [x] Durable Guild setup state is operational.

Pilot state path:

```text
/data/swgoh-command-center/discord-state-v1.json
```

Optional diagnostics:

```bash
echo "$RAILWAY_VOLUME_MOUNT_PATH"
ls -ld /data
ls -l /data/swgoh-command-center/
```

- [ ] Optional: verify `RAILWAY_VOLUME_MOUNT_PATH=/data` in a fresh Railway Console.
- [ ] Optional: inspect the JSON state after a fresh write.

---

## Stage 4 — Discord server → SWGOH Guild setup ✅

- [x] `DISCORD_DEFAULT_ALLY_CODE` configured for pilot bootstrap.
- [x] `/tb status` reports SWGOH seed configured.
- [x] Custom officer role created.
- [x] `@everyone` not used as officer role.
- [x] Pilot operator assigned `@Commands Officer`.
- [x] Officer role appeared in `/tb setup`.
- [x] `/tb setup` succeeded.
- [x] Discord server binding persisted.
- [x] `#bot-for-raid` persisted as command channel.
- [x] `@Commands Officer` persisted.
- [x] Atomic write + audit event succeeded.
- [x] Publishing and DMs remained disabled.

Verified setup:

```text
Discord server: 1422643338586099745
Command channel: #bot-for-raid
Officer role: @Commands Officer
```

---

## Stage 5 — live Guild synchronization ✅

First verified Discord sync:

```text
Guild: Ludus Venatus
Live roster refresh: complete
Hydrated rosters: 50/50
Guild GP: 574,260,422
Cache state: refreshed
```

- [x] Correct live Guild resolved: **Ludus Venatus**.
- [x] Live Guild hydration completed **50/50**.
- [x] Sync remained read-only for TB assignments/officer state.
- [x] No mock/fallback roster presented as live.

Later resilience acceptance:

- [ ] Confirm normal live reads continue from the durable Guild binding when the environment Ally Code fallback is unavailable.

---

## Stage 6 — verified identity + web enrollment + canonical data foundation ✅

### Discord↔SWGOH player link ✅

- [x] Durable Discord→SWGOH Guild binding resolved.
- [x] Ally Code matched a current Ludus Venatus member.
- [x] SWGOH player: **Warm Bacon**.
- [x] Ally Code: **732-764-286**.
- [x] Membership verified against the bound live Guild roster.
- [x] Link persisted durably and was audited.
- [x] `/tb links` returns the linked member and suppresses mentions.

### `/tb me` acceptance ✅

Initial defect:

```text
Galactic Power: 0
Hydrated roster units: 394
```

Fixes/acceptance:

- [x] Rich linked-player reads enabled.
- [x] GP normalization added where direct GP is absent.
- [x] Regression coverage added.
- [x] Deployed result returned credible non-zero GP.
- [x] Hydrated roster remained **394 units**.
- [x] Raw cache `miss` confirmed to mean a successful cold live fetch.
- [x] User-facing wording changed to `live refresh (fresh fetch)`.

Verified Discord result at acceptance time:

```text
SWGOH player: Warm Bacon · 732-764-286
Guild: Ludus Venatus
Galactic Power: 12,654,861
Hydrated roster units: 394
```

- [ ] Remaining negative-permission test: normal member cannot inspect another member through self-service commands.

### Website identity bridge ✅

- [x] Discord OAuth persists provider user ID in `user_social_identities`.
- [x] Production account has Google + Discord identities attached to one Command Center user.
- [x] Discord `/tb link` can be reused for Ally Code discovery during onboarding.
- [x] `POST /api/account/link-player/discord` exists.
- [x] Google-only accounts are not falsely matched to Discord players.
- [x] Discord discovery does not bypass SWGOH ownership verification.
- [ ] Verify a clean future-user flow skips manual Ally Code entry when `/tb link` already exists.
- [ ] Add Account Settings → Connect Discord for accounts whose providers are not already attached.

### Web ownership verification ✅

- [x] Narrow verification-profile endpoint exists.
- [x] Live Gateway Docker packaging bug for `verification-service.js` fixed.
- [x] Ownership challenge completed successfully.
- [x] Verified SWGOH player is **Warm Bacon**.
- [x] Verified Ally Code is **732-764-286**.
- [x] Verified Guild is **Ludus Venatus**.
- [x] `verification_status = verified`.
- [x] `verification_method = cosmetic_challenge`.
- [x] Guild membership transitioned to `active`.

### Verified-user arrival UX ✅

- [x] Generic success screen replaced with personalized Command Center arrival UI.
- [x] `Welcome aboard, Warm Bacon.` displayed.
- [x] Command Center account identifies **Jordi Bailey**.
- [x] Connected providers shown as Google + Discord / Discord `@warmbacon`.
- [x] SWGOH player + Ally Code shown.
- [x] Ludus Venatus shown.
- [x] Active command clearance shown.
- [x] SWGOH profile challenge shown as ownership proof.
- [x] User visually verified the upgraded page in production.

### Canonical Supabase persistence ✅

Original problem: verified web account had canonical GP `0`, no persisted full roster, and no usable snapshots.

Persistence repair completed:

- [x] Fully hydrated Comlink roster is authoritative baseline input; optional Stats enrichment no longer blocks all persistence.
- [x] Data quality explicitly distinguishes complete vs partial enrichment.
- [x] Monolithic 50-player payload replaced with bounded Guild member pages/staging.
- [x] Canonical ingestion replaced with bounded member RPC processing.
- [x] Guild finalization remains atomic after all member batches succeed.
- [x] Production sync completed **50/50 on attempt 1** under the bounded pipeline.
- [x] `guild_members_current` contains all **50 current members**.
- [x] `player_units_current` contains **19,051 current Guild units**.
- [x] Daily player snapshots exist for all **50 members**.
- [x] Guild snapshot exists.
- [x] Staging rows clean up after completion.
- [x] Sync job audit identifies `bounded-member-rpc-v1` / durable baseline behavior.
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

### Ability evidence + history ✅

- [x] Static catalog populated for player-obtainable game units and ability definitions.
- [x] Compact per-skill raw tier evidence persisted for character abilities.
- [x] Raw Comlink tier encoding normalized only in derived classification; raw source tier preserved.
- [x] Character Zeta/Omicron classification reaches zero unknown material-bearing character skills in the pilot Guild.
- [x] Omega/Eta remains unknown where ship ability identifiers are not authoritative.
- [x] Unknown Omega/Eta displays as `NULL` / `—`, not `0`.
- [x] Progression history false positives cleaned up.
- [x] Metadata/classifier-only changes no longer create progression events.
- [x] Immediate resync idempotence test demonstrated real changes are not replayed as duplicate history.
- [x] Player/Guild history APIs expose persisted snapshots + genuine progression events.
- [x] Initial 50-member import is treated as a **BASELINE**, not falsely shown as 50 live joins.

---

## Web Command Center read layer — CURRENT BUILD TRACK 🔴

### Full-list semantics ✅

- [x] Guild Command normal load is canonical-first.
- [x] Guild Command logical result remains **all 50 current members**.
- [x] Guild web list does not download all 19,051 unit objects merely to show 50 member rows.
- [x] Selected member / player roster returns that player's **entire owned roster**.
- [x] Warm Bacon full roster invariant: **394 = 325 characters + 69 ships**.
- [x] Player endpoint compares returned row count with latest snapshot character+ship count and fails closed on mismatch.
- [x] Explicit Guild refresh remains the rich/live Comlink path.

### Roster Commander ✅ implementation

- [x] Canonical full owned roster is the default source.
- [x] Live-only filters can promote the view to rich live data.
- [x] Unknown persisted fields render `—`, not fake zeroes.
- [x] Existing live snapshot is reused when available.
- [x] Shared browser fetch cache coalesces canonical roster/history reads.

### Persisted history UI ✅ implementation

- [x] Player Progression Ledger added.
- [x] Guild Progression Ledger added.
- [x] Daily-trend UI waits for at least two snapshots before presenting a comparison.
- [x] Real unit progression events survive browser/device/session changes.

### Guild Ability / Activity Command ✅ implementation

- [x] Guild Zeta / Omicron / Ultimate totals surfaced.
- [x] Omega/Eta displayed as unclassified while evidence is incomplete.
- [x] Member profiles carry persisted/live source labels accurately.
- [x] Member profile shows ability-investment totals.
- [x] Officer activity model ranks current-member momentum from persisted history without including departed members in current rankings.

### Player Command Center 🔧 deployment acceptance pending

Implemented:

- [x] Canonical Player Command model.
- [x] Regression fixture enforces **394 owned units / 50 Guild members** semantics.
- [x] Current roster state surfaced: GP, character/ship GP, roster counts, GLs, relic depth, Zetas, Omicrons, Ultimates.
- [x] Guild-relative ranks surfaced independently by metric.
- [x] ROTE Operations requirement pressure derived from maintained requirement histograms.
- [x] Persistent `What Changed` history surfaced.
- [x] One-click full-roster handoff.
- [x] One-click ROTE-required-unit handoff.
- [x] Explicit persisted refresh.
- [x] Explicit **Refresh Live Detail** promotion to Comlink.
- [x] Shared baseline/history fetch cache extended with in-flight request coalescing.
- [x] Cache-busted Player Command app-shell wiring committed.
- [x] Source/cache wiring regression coverage committed.
- [ ] Railway reports the current Player Command head **ACTIVE / successful**.
- [ ] Hard-refresh the app and visually accept the Player Command Overview.

Current pilot Guild-relative Warm Bacon ranks from the canonical 50-member snapshot:

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

### Legacy hero/main app loader — capability-aware refactor required

The old `public/app.js` form still assumes every player lookup is a fully rich live response. A blind canonical-first swap would turn intentionally unknown persisted Omega/Eta evidence into visible zeroes and mislabel persisted data as live.

- [x] Risk identified before changing the legacy loader.
- [ ] Refactor the legacy profile/roster renderer to honor source capabilities.
- [ ] Persisted source must show canonical freshness wording, not `Live player fetched`.
- [ ] Persisted unknown Omega/Eta, mods, datacrons, cosmetics, competitive fields must remain `N/A` / `—`.
- [ ] Only after the renderer is capability-aware should the legacy hero Ally Code form become canonical-first with live fallback.

---

## Stage 7 — Discord member TB controls 🔴 after current Player Command deployment acceptance

### Availability

```text
/tb availability
/tb availability state:UNAVAILABLE
/tb availability state:AVAILABLE
```

- [ ] Read own status works.
- [ ] `UNAVAILABLE` verifies live Guild membership before writing.
- [ ] `AVAILABLE` clears exclusion.
- [ ] Unavailable member is excluded from ROTE donor candidates.
- [ ] Officer can manage a linked Guildmate.
- [ ] Normal member cannot target another Discord member.

### Donation preferences

```text
/tb preference unit:<Base ID> preference:GIVE
/tb preference unit:<Base ID> preference:KEEP
/tb preference unit:<Base ID> preference:DEFAULT
/tb preferences
```

- [ ] GIVE verifies unit ownership and persists.
- [ ] KEEP verifies unit ownership and persists.
- [ ] DEFAULT clears explicit override.
- [ ] Planner consumes durable GIVE/KEEP controls.
- [ ] Mission protections and hard reserves override unsafe donor choices.

### Member-control UX backlog

- [ ] Replace raw Base ID entry with verified unit search/autocomplete.
- [ ] Add officer-readable member-control summary.

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
- [ ] Availability exclusions alter candidates correctly.
- [ ] GIVE/KEEP preferences alter donor priority correctly.
- [ ] Mission protections remain enforced.
- [ ] Hard reserves remain enforced.
- [ ] Forced/risky assignments are clearly marked HELP/risk.
- [ ] Planner GP tie-break inputs are non-zero/credible.
- [ ] Generic fleet gates are not presented as exact-ready when selectable-ship evidence is incomplete.

The bot does **not** yet infer the live in-game ROTE phase. Officers select P1-P6 until a verified live TB-state source exists.

---

## Stage 9 — immutable assignment-plan safety

- [ ] Add immutable assignment plan versions.
- [ ] Persist plan hash/version metadata.
- [ ] Add explicit officer preview.
- [ ] Add explicit officer approval.
- [ ] Prevent edited/stale plans from publishing under prior approval.
- [ ] Add approval audit trail.
- [ ] Add cancellation/supersede behavior.
- [ ] Add officer-readable delta between plan versions.

---

## Stage 10 — controlled publishing + delivery

Current pilot safety:

```text
DISCORD_TB_DELIVERY_ENABLED=false
```

- [ ] Build rate-limited outbound queue.
- [ ] Add per-message delivery status.
- [ ] Retry transient Discord failures safely.
- [ ] Dead-letter/report permanent failures.
- [ ] Add preview → approve → publish flow.
- [ ] Restrict targets to configured Guild destinations.
- [ ] Add safe member mention handling.
- [ ] Add controlled/opt-in member DM delivery.
- [ ] Audit every public post/DM delivery event.
- [ ] Ensure recalculation cannot silently alter an approved plan.
- [ ] Enable delivery only after pilot acceptance.

---

# PARKED COMMERCIAL / SCALE BACKLOG

## Multi-Guild commercial onboarding

- [ ] Replace pilot-only `DISCORD_DEFAULT_GUILD_ID` restriction with tenant-safe multi-Guild operation.
- [ ] Replace environment Ally Code bootstrap with per-server administrator onboarding.
- [ ] Let each Discord Guild provide its own SWGOH bootstrap Ally Code.
- [ ] Verify tenant isolation at every Discord/Supabase read/write boundary.
- [ ] Add Discord Guild Install production flow.
- [ ] Move from pilot Guild-scoped registration to production/global installation when ready.
- [ ] Add uninstall/offboarding cleanup policy.

## Production Discord persistence

The Railway Volume JSON state remains pilot Discord state; canonical SWGOH application data is already in Supabase.

- [ ] Migrate Discord Guild bindings, player links, member controls, plans and audits to transactional PostgreSQL tenancy.
- [ ] Add tenant indexes and backup/restore procedures.
- [ ] Migrate pilot JSON state safely.
- [ ] Remove single-file Discord state-size bottleneck.

## Production hosting + OAuth branding

- [ ] Attach final SWGOH Command Center custom domain.
- [ ] Set Supabase Auth Site URL to production domain.
- [ ] Add exact production OAuth redirect URLs.
- [ ] Update Google/Discord callback configuration during cutover.
- [ ] Decide whether to configure a Supabase Auth custom domain.
- [ ] Re-test Google/Discord sign-in, sign-out, refresh, confirmation and reset flows.

## Monetization / entitlements

- [ ] Define Free / Officer / Guild Pro / higher-tier matrix.
- [ ] Decide payment provider(s).
- [ ] Build tenant/server entitlements.
- [ ] Build subscription status/admin UI.
- [ ] Add graceful downgrade behavior without deleting Guild data.
- [ ] Add billing audit events.

## Product expansion

- [ ] Continue TW command center/counter intelligence with verified sources.
- [ ] Continue mod analysis/optimization using live-only mod detail where required.
- [ ] Expand farming/readiness plans.
- [ ] Expand recruiting intelligence.
- [ ] Expand Guild health/history analytics.
- [ ] Continue website ↔ Discord shared intelligence views.
- [ ] Event/rotation notifications only after verified sources + safe delivery controls.

## Legal / platform launch review

- [ ] Review Discord production application requirements and install permissions.
- [ ] Review commercial use of SWGOH/EA/CG names, data, imagery and third-party sources.
- [ ] Record permissions/licenses/terms relied on for each external data/image source.

---

# Current Railway configuration

Known pilot variables:

```text
DISCORD_APPLICATION_ID
DISCORD_BOT_TOKEN
DISCORD_DEFAULT_GUILD_ID
DISCORD_DEFAULT_ALLY_CODE
DISCORD_PUBLIC_KEY
DISCORD_TB_DELIVERY_ENABLED
DISCORD_TB_INTERACTIONS_ENABLED
SWGOH_GATEWAY_API_KEY
SWGOH_GATEWAY_URL
SWGOH_REQUEST_TIMEOUT_MS
```

Volume:

```text
Swgoh-App Railway Volume → /data
```

---

# Authorization model

## Setup

`/tb setup` requires Manage Guild / Manage Server or Administrator.

## Officer commands

Guild-wide officer commands require Manage Guild, Administrator, or the durably configured `@Commands Officer` role where configured-role authorization applies.

## Linked-member self-service

Normal linked members may use self-only behavior for:

```text
/tb me
/tb preference
/tb preferences
/tb availability
```

They cannot act on another Discord member unless officer-authorized.

---

# Fail-closed expectations

Refuse/degrade safely when:

- Discord signature is invalid;
- signed `application_id` mismatches;
- pilot Guild restriction fails;
- setup has no valid bootstrap Ally Code;
- durable shared state is unavailable for a write;
- live SWGOH gateway is unavailable when verification is required;
- link target is not in the bound Guild;
- GIVE/KEEP target unit is not owned;
- a non-officer targets another Discord member;
- canonical Guild member count is incomplete;
- canonical player owned-unit count is incomplete;
- verified mission evidence is incomplete.

Website Discord auto-discovery falls back to manual Ally Code entry rather than guessing by display name, SWGOH name or Guild membership.

---

# Immediate next action — do not skip

1. Let the current Player Command / cache/test Railway head settle without stacking unrelated commits.
2. Confirm **Swgoh-App** production deployment is successful.
3. Hard-refresh the app.
4. Verify Player Command loads Warm Bacon from the canonical full roster and shows the 50-member Guild-relative ranks.
5. Verify **Open Full Roster** exposes all **394** owned units.
6. Verify **Refresh Live Detail** promotes to the existing live Comlink path without changing canonical roster completeness.
7. Then execute Stage 7 Discord availability/preference acceptance tests before moving to Stage 8 ROTE command acceptance.

---

# Change log

- 2026-08-18: Rewrote stale Stage 6 checkpoint after canonical Supabase persistence acceptance; recorded full 50-member / 19,051-unit Guild baseline and Warm Bacon 394-unit baseline.
- 2026-08-18: Recorded Player Command Center implementation, shared canonical/history fetch coalescing, Guild-relative ranks, ROTE pressure and live-detail promotion; deployment acceptance still pending.
- 2026-08-18: Recorded that the legacy hero `app.js` remains live-assuming and must become capability-aware before a canonical-first switch to avoid fake Omega/Eta zeroes.
- 2026-08-17: Web ownership verification passed for **Warm Bacon / 732-764-286 / Ludus Venatus**.
- 2026-08-17: Personalized verified-user arrival screen visually accepted.
- 2026-08-17: `/tb setup` succeeded with `#bot-for-raid` and `@Commands Officer`.
- 2026-08-17: `/tb sync` succeeded against **Ludus Venatus**, hydrating **50/50** rosters.
