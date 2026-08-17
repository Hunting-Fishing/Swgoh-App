# SWGOH Command Center — Pilot Runbook & Master Checklist

**Purpose:** authoritative checkpoint for Discord + web + canonical SWGOH data bring-up. Update this file only from verified implementation/deployment results. Do not treat discussed future architecture as completed work.

**Current checkpoint:** **Canonical Guild/player persistence is accepted. Full 50-member / full-player roster semantics are enforced. Player Command Center and the capability-aware canonical-first legacy loader are deployed successfully on Railway at `c34d775`. The remaining gate is visual web acceptance plus re-registration and live Stage 7 Discord member-control acceptance before Stage 8 ROTE command acceptance.**

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

## Stage 2 — `/tb` command registration 🔧 current schema re-registration pending

- [x] Guild-scoped `/tb` registration script exists.
- [x] Required/optional Discord option ordering bug fixed.
- [x] Registration diagnostics print nested Discord schema errors.
- [x] Original `/tb` pilot schema successfully registered.
- [x] Current code schema includes verified unit autocomplete for `/tb preference unit:`.
- [x] Current code schema includes officer `/tb activity`.
- [x] Current code schema includes officer `/tb controls [member]`.
- [ ] Re-run registration for the **current** slash schema after the deployed build is accepted.
- [ ] Confirm Discord exposes `/tb activity`, `/tb controls`, and the unit autocomplete picker.

Previously verified registration:

```text
Registered 1 guild-scoped Discord command in 1422643338586099745.
- /tb (1538621439698272296)
```

Current code command surface:

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

> Re-run `npm run discord:register-tb` only when the slash-command schema changes. The current deployed code has schema additions beyond the previously verified registration, so a registration run is required before live acceptance of those additions.

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
- [x] Code-level target-isolation regression proves normal member self-service rejects another Discord member.
- [ ] Live Discord negative-permission acceptance: normal member attempts another-member target and receives denial.

Verified Discord result at acceptance time:

```text
SWGOH player: Warm Bacon · 732-764-286
Guild: Ludus Venatus
Galactic Power: 12,654,861
Hydrated roster units: 394
```

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
- [x] Provenance-aware Ludus Venatus historical archive backfilled to 2022 and exposed to the Guild History workspace.

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
- [x] Officer Guild History workspace exposes the versioned historical archive independently from canonical current-state history.

### Guild Ability / Activity Command ✅ implementation

- [x] Guild Zeta / Omicron / Ultimate totals surfaced.
- [x] Omega/Eta displayed as unclassified while evidence is incomplete.
- [x] Member profiles carry persisted/live source labels accurately.
- [x] Member profile shows ability-investment totals.
- [x] Officer activity model ranks current-member momentum from persisted history without including departed members in current rankings.
- [x] Durable member availability/GIVE/KEEP totals are included in the officer activity summary.

### Player Command Center 🚀 deployed; visual acceptance pending

Implemented:

- [x] Canonical Player Command model.
- [x] Regression fixture enforces **394 owned units / 50 Guild members** semantics.
- [x] Current roster state surfaced: GP, character/ship GP, roster counts, GLs, relic depth, Zetas, Omicrons, Ultimates.
- [x] Guild-relative ranks surfaced independently by metric.
- [x] ROTE Operations requirement pressure derived from maintained requirement histograms.
- [x] Persistent `What Changed` history surfaced.
- [x] Evidence-separated Player development queue surfaced.
- [x] One-click full-roster handoff.
- [x] One-click ROTE-required-unit handoff.
- [x] Explicit persisted refresh.
- [x] Explicit **Refresh Live Detail** promotion to Comlink.
- [x] Shared baseline/history fetch cache extended with in-flight request coalescing.
- [x] Cache-busted Player Command app-shell wiring committed.
- [x] Source/cache wiring regression coverage committed.
- [x] Railway reports **Swgoh-App** and **Guild-Sync-Worker** successful for production merge `c34d775`.
- [ ] Hard-refresh the app and visually accept the Player Command Overview.
- [ ] Verify **Open Full Roster** exposes all **394** owned units in production.
- [ ] Verify **Refresh Live Detail** promotes to Comlink while preserving canonical roster completeness.

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

### Legacy hero/main app loader ✅ capability-aware canonical-first deployment

- [x] Risk identified before changing the legacy loader.
- [x] Legacy profile/roster renderer honors persisted-vs-live source capabilities.
- [x] Persisted source shows canonical freshness wording instead of `Live player fetched`.
- [x] Persisted unknown Zeta, Omega/Eta and Omicron evidence remains `N/A` / `—` instead of fake zero.
- [x] Persisted unknown mods, datacrons, cosmetics and competitive fields remain `N/A` / `—`.
- [x] Legacy hero Ally Code form is canonical-first with live fallback when no usable persisted baseline exists.
- [x] Readiness-sensitive intelligence is suppressed until live evidence is loaded.
- [x] Browser app-shell asset revision bumped so deployed clients receive the capability-aware renderer.
- [x] Railway deployment for merge `c34d775` reported successful.

---

## Stage 7 — Discord member TB controls 🔴 live acceptance next

**Implementation status:** the member-control model, durable writes, planner integration, authorization, autocomplete and officer drill-down are implemented with regression coverage. The remaining Stage 7 gate is live Discord acceptance against the pilot server after current slash-command schema registration.

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
- [x] Officer-target path for a linked Guildmate is implemented.
- [x] Normal-member cross-target rejection is covered by regression tests.

### Donation preferences implementation ✅

```text
/tb preference unit:<search/autocomplete> preference:GIVE
/tb preference unit:<search/autocomplete> preference:KEEP
/tb preference unit:<search/autocomplete> preference:DEFAULT
/tb preferences
```

- [x] GIVE verifies current unit ownership before persistence.
- [x] KEEP verifies current unit ownership before persistence.
- [x] DEFAULT clears an explicit override without requiring a live-gateway read.
- [x] Planner consumes durable GIVE/KEEP controls.
- [x] Mission protections outrank ordinary donor preference.
- [x] Hard mission reserves remain absolute.
- [x] KEEP can be used only as an explicit last-resort override when no safer owner exists.

### Member-control UX ✅ implementation

- [x] Raw Base ID-only entry replaced with verified SWGOH unit search/autocomplete in the current command schema.
- [x] Officer-readable `/tb controls [member]` drill-down added.
- [x] `/tb activity` includes compact member-control totals.
- [x] Officer `/tb controls` response is ephemeral/read-only with mention parsing suppressed.

### Stage 7 live Discord acceptance — REQUIRED

After `npm run discord:register-tb` has successfully registered the current schema:

1. As the linked pilot member, run `/tb availability` and record the current status.
2. Run `/tb availability state:UNAVAILABLE`; confirm live Guild verification succeeds.
3. Run `/tb assignments phase:P1`; confirm that member is absent from eligible donor selections where they would otherwise qualify.
4. Run `/tb availability state:AVAILABLE`; confirm the exclusion clears.
5. Use `/tb preference unit:<autocomplete>` to select a unit actually owned by Warm Bacon and set `GIVE`.
6. Run `/tb preferences`; confirm the GIVE control is persisted.
7. Run `/tb assignments phase:P1`; confirm the preference changes donor priority only where mission safety allows it.
8. Change the same unit to `KEEP`; verify the planner avoids that donor when a safer alternate owner exists.
9. Change the same unit to `DEFAULT`; verify the explicit override disappears.
10. As an officer, run `/tb controls` and `/tb controls member:<pilot member>`; confirm the exact availability and GIVE/KEEP state is visible without sending pings.
11. From a normal linked-member account, attempt `/tb availability member:<another member>` or `/tb preferences member:<another member>` and confirm authorization denial.
12. Leave the pilot member `AVAILABLE` with no unintended test preference overrides after acceptance.

Do **not** mark Stage 7 live-complete from regression tests alone; the signed Discord path and registered command UI must be exercised in the pilot server.

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
- [ ] Availability exclusions alter candidates correctly in live Discord acceptance.
- [ ] GIVE/KEEP preferences alter donor priority correctly in live Discord acceptance.
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

1. **Production deployment is already successful at `c34d775`.** Do not re-open that gate unless a later code merge supersedes it.
2. Hard-refresh the production app and visually verify Player Command Overview for **Warm Bacon / 732-764-286**.
3. Confirm Guild-relative ranks are based on the full **50-member** canonical baseline.
4. Open Full Roster and verify **394 = 325 characters + 69 ships**.
5. Trigger **Refresh Live Detail** and verify live enrichment does not change canonical completeness or relabel unknown evidence as zero.
6. Run `npm run discord:register-tb` in the configured deployment environment to register the current `/tb` schema, including unit autocomplete, `/tb activity`, and `/tb controls`.
7. Execute the **Stage 7 live Discord acceptance sequence** above and return the pilot member to AVAILABLE/default preference state.
8. Only after Stage 7 passes, proceed to Stage 8 live ROTE command acceptance.
9. Do not enable public publishing or DMs; Stage 9 immutable-plan safety and Stage 10 delivery controls remain prerequisites.

---

# Change log

- 2026-08-18: Railway reported **Swgoh-App** and **Guild-Sync-Worker** successful for production merge `c34d775`; canonical progression nullability is now deployed across Zeta/Omega/Omicron evidence boundaries.
- 2026-08-18: Advanced master checkpoint to Stage 7 live Discord acceptance; recorded current `/tb activity`, `/tb controls` and unit-autocomplete schema additions as requiring guild-command re-registration before live acceptance.
- 2026-08-18: Recorded Ludus Venatus historical archive backfill to 2022 and the officer Guild History workspace.
- 2026-08-18: Rewrote stale Stage 6 checkpoint after canonical Supabase persistence acceptance; recorded full 50-member / 19,051-unit Guild baseline and Warm Bacon 394-unit baseline.
- 2026-08-18: Recorded Player Command Center implementation, shared canonical/history fetch coalescing, Guild-relative ranks, ROTE pressure and live-detail promotion.
- 2026-08-17: Web ownership verification passed for **Warm Bacon / 732-764-286 / Ludus Venatus**.
- 2026-08-17: Personalized verified-user arrival screen visually accepted.
- 2026-08-17: `/tb setup` succeeded with `#bot-for-raid` and `@Commands Officer`.
- 2026-08-17: `/tb sync` succeeded against **Ludus Venatus**, hydrating **50/50** rosters.
