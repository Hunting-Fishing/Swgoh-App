# SWGOH Command Center Discord Bot — Pilot Runbook & Master Checklist

**Purpose:** authoritative checklist for bringing SWGOH Command Center from the current Discord/web pilot to a production guild platform. Update this file when checkpoints are actually verified. Do not skip ahead because later architecture has been discussed.

**Current checkpoint:** **Stage 6 — SWGOH ownership verification passed. Deploy/recheck the upgraded verified-user arrival screen and resolve canonical Supabase player GP persistence before Stage 7.**

**Current operating mode:** signed HTTP Discord interactions, guild-scoped `/tb` pilot, live SWGOH gateway reads, durable Railway Volume state, Supabase authenticated web tenancy, outbound publishing/DM delivery disabled.

---

# 0. Ground rules

- Production behavior uses live SWGOH data; never silently present mock roster data as live.
- Discord interaction replies remain ephemeral during the pilot unless an explicitly approved publishing flow says otherwise.
- Public assignment publishing and member DMs remain disabled until immutable plan approval, audit, and delivery safeguards exist.
- Manage Guild / Administrator remains bootstrap authority.
- The durably configured Discord officer role authorizes supported officer commands after setup.
- Discord-to-player linking is officer-managed and verifies that the Ally Code exists in the currently bound SWGOH guild.
- Member self-service is limited to the signed caller's own linked profile/preferences/availability unless officer-authorized.
- Website onboarding may reuse a signed user's existing durable Discord↔SWGOH link for Ally Code discovery, but that does not count as proof of SWGOH account ownership.
- Never display a persisted gameplay metric as authoritative when the database is known to contain a stale/zero value and a live source disagrees.
- When new work is discovered, record it here before moving past the current stage.

---

# MASTER CHECKLIST

## Stage 1 — Discord application + signed interaction endpoint ✅

- [x] Discord application ID configured in Railway.
- [x] Discord bot token configured in Railway.
- [x] Discord public key configured in Railway.
- [x] Pilot Discord guild ID configured in Railway.
- [x] `DISCORD_TB_INTERACTIONS_ENABLED` configured.
- [x] `/api/discord/interactions` accepts Discord signed interactions.
- [x] Ed25519 request-signature verification implemented.
- [x] Signed `application_id` validation implemented.
- [x] Discord PING verification works.
- [x] Pilot guild restriction works.
- [x] `/tb status` responds successfully in Discord.
- [x] Responses are ephemeral by default.
- [x] `allowed_mentions` suppresses accidental pings.

Verified pilot Discord server:

```text
1422643338586099745
```

---

## Stage 2 — `/tb` command registration ✅

- [x] Guild-scoped `/tb` registration script exists.
- [x] Discord required/optional option ordering bug fixed.
- [x] Registration diagnostics print nested Discord schema errors.
- [x] `/tb` successfully registered with Discord.

Verified registration:

```text
Registered 1 guild-scoped Discord command in 1422643338586099745.
- /tb (1538621439698272296)
```

Current command surface:

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

> Re-run `npm run discord:register-tb` only when the Discord slash-command schema changes.

---

## Stage 3 — durable Discord state ✅

- [x] Persistent Railway Volume attached to **Swgoh-App**.
- [x] Volume mounted at `/data` inside the deployed service.
- [x] Bash verified `/data` exists.
- [x] `/tb setup` performed an atomic durable write.
- [x] `/tb setup` reported an audit event was written.
- [x] Durable state is operational for guild setup writes.

State path:

```text
/data/swgoh-command-center/discord-state-v1.json
```

Optional deployment verification:

```bash
echo "$RAILWAY_VOLUME_MOUNT_PATH"
ls -ld /data
ls -l /data/swgoh-command-center/
```

- [ ] Optional: explicitly verify `RAILWAY_VOLUME_MOUNT_PATH=/data` in a fresh Railway Console.
- [ ] Optional: inspect `discord-state-v1.json` after setup.

---

## Stage 4 — Discord server → SWGOH guild setup ✅

- [x] `DISCORD_DEFAULT_ALLY_CODE` configured for pilot bootstrap.
- [x] `/tb status` reports the pilot SWGOH guild seed configured.
- [x] Custom Discord officer role created.
- [x] `@everyone` was not used as the bot officer role.
- [x] Pilot operator assigned the officer role.
- [x] Officer role appeared in `/tb setup` picker.
- [x] `/tb setup` succeeds.
- [x] Discord server binding persisted.
- [x] `#bot-for-raid` command channel persisted.
- [x] `@Commands Officer` persisted.
- [x] Atomic state write succeeded and audit event was written.
- [x] Publishing and DMs remained disabled.

Verified setup:

```text
Discord server: 1422643338586099745
Command channel: #bot-for-raid
Officer role: @Commands Officer
```

---

## Stage 5 — live guild synchronization ✅

Verified `/tb sync` result:

```text
Guild: Ludus Venatus
Live roster refresh: complete
Hydrated rosters: 50/50
Guild GP: 574,260,422
Cache state: refreshed
```

- [x] Correct live SWGOH guild resolved: **Ludus Venatus**.
- [x] Live roster refresh completed.
- [x] Hydrated roster count is **50/50**.
- [x] Guild GP returned: **574,260,422**.
- [x] Sync remained read-only with respect to TB assignments/officer state.
- [x] No mock/fallback roster was presented as live.

Later resilience test:

- [ ] Confirm normal live reads continue from the durable guild binding independently of the environment Ally Code fallback.

---

## Stage 6 — CURRENT CHECKPOINT: verified player identity + web enrollment polish 🔴

### Discord↔SWGOH player link ✅

- [x] Durable Discord→SWGOH guild binding resolved.
- [x] Ally Code matched a current Ludus Venatus guild member.
- [x] SWGOH player: **Warm Bacon**.
- [x] Ally Code: **732-764-286**.
- [x] Guild membership verified against the bound live guild roster.
- [x] Link persisted durably and was audited.
- [x] `/tb links` returns one linked member and suppresses mentions.

### `/tb me` live player acceptance ✅

Initial defect:

```text
Galactic Power: 0
Hydrated roster units: 394
```

Fixes:

- [x] Shared guild roster service normalizes character + ship GP into total GP when direct GP is absent.
- [x] Linked-player reads request the rich guild snapshot.
- [x] Regression coverage added for rich reads and GP normalization.
- [x] GP correction deployed.

Verified live result:

```text
SWGOH player: Warm Bacon · 732-764-286
Guild: Ludus Venatus
Galactic Power: 12,654,861
Hydrated roster units: 394
Roster cache: miss
```

- [x] Live GP is now credible/non-zero: **12,654,861**.
- [x] Hydrated roster is **394 units**.
- [x] Confirmed raw `cache: miss` means a cold cache that successfully fetched fresh live data; it is not a lookup failure.
- [x] User-facing linked-player cache wording changed so `miss` displays as `live refresh (fresh fetch)` while raw cache state remains available for diagnostics.
- [x] Regression coverage added for friendly cache-state presentation.
- [ ] Live negative-permission test: normal member cannot inspect another member through self-service commands.

### Website Discord identity bridge ✅ implementation / pilot behavior

- [x] Discord OAuth persists Discord provider user ID in `user_social_identities`.
- [x] Production Supabase has Discord and Google identities for the pilot account.
- [x] Production Supabase confirms both providers belong to the same Command Center user.
- [x] Account onboarding resolves the signed Command Center user to their connected Discord identity.
- [x] Account onboarding reads that Discord user's durable `/tb link` and recovers the Ally Code/player ID.
- [x] `POST /api/account/link-player/discord` added for server-side auto-linking.
- [x] `/onboarding` automatically reuses the Discord-linked Ally Code when no active web player claim exists.
- [x] Discord discovery does not bypass SWGOH ownership verification.
- [x] Google-only accounts are not falsely matched to a Discord player.
- [x] Regression coverage exists for Discord auto-discovery and Google-only isolation.
- [ ] Verify a clean future-user flow skips manual Ally Code entry when `/tb link` already exists.
- [ ] Add Account Settings → Connect Discord for users whose providers are not already attached to one Command Center account.

### Web ownership verification ✅

Original defect: `START OWNERSHIP VERIFICATION` returned `Not found.`

- [x] Narrow `/v1/player/:allyCode/verification-profile` endpoint exists.
- [x] Root cause traced to Live Gateway Docker packaging omitting `verification-service.js`.
- [x] Packaging fixed in `f73f3eba9a818da5c09f4b89138a799bbc520e95`.
- [x] Railway reported the Live Gateway deployment successful.
- [x] `Not found.` is no longer blocking ownership verification.
- [x] Cosmetic ownership challenge completed successfully.
- [x] Production Supabase confirms the verified player is **Warm Bacon**.
- [x] Verified Ally Code is **732-764-286**.
- [x] Verified Guild is **Ludus Venatus**.
- [x] `user_player_links.verification_status = verified`.
- [x] `verification_method = cosmetic_challenge`.
- [x] Guild membership transitioned to `active`.
- [x] Pilot verification timestamp recorded: `2026-08-17 15:02:21.149+00`.

### Verified-user arrival UX 🔧 deployment/recheck pending

The first successful screen was functionally correct but too generic: it only said `Player identity verified` and did not identify the signed user/player/guild clearly.

Implemented:

- [x] Verified page hero changes to `Command Clearance Granted`.
- [x] Dynamic `Welcome aboard, <SWGOH player>.` headline.
- [x] Verified Command Center account card.
- [x] Signed social identity data exposed from `/api/account/status` without exposing provider user IDs.
- [x] Pilot account display identities available: Google `Jordi Bailey`, Discord `warmbacon`.
- [x] Verified SWGOH player card shows player name + Ally Code.
- [x] Guild card shows Ludus Venatus.
- [x] Clearance card shows active membership + Guild role.
- [x] Ownership proof card shows verification method + timestamp.
- [x] Existing Guild and Player Command Center CTAs retained.
- [x] Star Wars/command-terminal styling upgraded for the verified state.
- [ ] Railway deploy the latest verified-user UI/backend changes.
- [ ] Hard-refresh `/onboarding` and visually verify the new arrival screen.

### Canonical Supabase player GP persistence defect 🔴

Live `/tb me` correctly returns **12,654,861 GP**, but the canonical Supabase `players` row currently still contains:

```text
galactic_power: 0
character_power: 0
ship_power: 0
last_synced_at: null
```

- [x] Defect identified before displaying GP on the verified web arrival screen.
- [x] Verified arrival UI deliberately does **not** display the stale `0` GP.
- [ ] Determine/confirm the intended first permanent rich Guild sync trigger after ownership verification.
- [ ] Run/repair that sync path so the canonical player row receives calculated GP and progression data.
- [ ] Confirm Supabase stores Warm Bacon GP as a credible non-zero value.
- [ ] Only then expose persisted GP on authenticated website identity/profile cards.

**Do not advance to Stage 7 until the upgraded verified screen is checked and the canonical GP persistence path is understood/fixed.**

---

## Stage 7 — member TB controls

### Availability

```text
/tb availability
/tb availability state:UNAVAILABLE
/tb availability state:AVAILABLE
```

- [ ] Read own status works.
- [ ] `UNAVAILABLE` verifies live guild membership before writing.
- [ ] `AVAILABLE` clears exclusion.
- [ ] Unavailable member is excluded from ROTE donor candidates.
- [ ] Officer can manage a linked guildmate.
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

- [ ] Replace raw unit Base ID entry with verified unit search/autocomplete.
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

## Stage 9 — assignment plan safety before outbound delivery

- [ ] Add immutable assignment plan versions.
- [ ] Persist plan hash/version metadata.
- [ ] Add explicit officer preview.
- [ ] Add explicit officer approval.
- [ ] Prevent edited/stale plans from being published under prior approval.
- [ ] Add approval audit trail.
- [ ] Add cancellation/supersede behavior.
- [ ] Add officer-readable delta between plan versions.

---

## Stage 10 — controlled publishing + delivery

Currently intentionally disabled:

```text
DISCORD_TB_DELIVERY_ENABLED=false
```

- [ ] Build rate-limited outbound queue.
- [ ] Add per-message delivery status.
- [ ] Retry transient Discord failures safely.
- [ ] Dead-letter/report permanent failures.
- [ ] Add preview → approve → publish flow.
- [ ] Restrict targets to configured guild destinations.
- [ ] Add safe member mention handling.
- [ ] Add controlled/opt-in member DM delivery.
- [ ] Audit every public post/DM delivery event.
- [ ] Ensure recalculation cannot silently alter an approved plan.
- [ ] Enable delivery only after pilot acceptance.

---

# PARKED COMMERCIAL / SCALE BACKLOG

These are recorded so they are not forgotten, but they are **not the current task**.

## Multi-guild commercial onboarding

- [ ] Replace pilot-only `DISCORD_DEFAULT_GUILD_ID` restriction with safe multi-guild tenancy.
- [ ] Replace environment Ally Code bootstrap with per-server administrator onboarding.
- [ ] Let each Discord guild provide its own SWGOH guild bootstrap Ally Code.
- [ ] Verify tenant isolation by Discord guild ID at every read/write boundary.
- [ ] Add Discord Guild Install production flow.
- [ ] Move command registration from pilot guild scope to production/global installation.
- [ ] Add uninstall/offboarding cleanup policy.

## Production persistence

Current atomic JSON-on-Railway-Volume state is suitable for pilot validation, not intended high-scale persistence.

- [ ] Design PostgreSQL schema for Discord guilds, SWGOH bindings, player links, member controls, plans, audits, subscriptions, and entitlements.
- [ ] Add migrations and transactional tenant-scoped writes.
- [ ] Add indexes for Discord guild ID, player ID, Ally Code, and plan versions.
- [ ] Add backup/restore procedure.
- [ ] Migrate pilot JSON state safely.
- [ ] Remove the single-file state-size bottleneck.

## Production hosting + OAuth branding

Railway is the current deployment host, not the intended public-facing brand domain.

- [ ] Attach the final SWGOH Command Center custom domain.
- [ ] Set Supabase Auth Site URL to the production domain.
- [ ] Add exact production OAuth redirect URLs.
- [ ] Keep Railway URLs only where operationally required.
- [ ] Update Google/Discord callback configuration during cutover.
- [ ] Decide whether to configure a Supabase Auth custom domain.
- [ ] Re-test Google/Discord sign-in, sign-out, refresh, confirmation, and reset flows.

## Monetization / entitlements

- [ ] Define Free / Officer / Guild Pro / higher-tier matrix.
- [ ] Decide payment provider(s) and Discord-native vs external billing.
- [ ] Build server-level entitlements.
- [ ] Build subscription status/admin UI.
- [ ] Add graceful downgrade behavior without deleting guild data.
- [ ] Add billing audit events.

## Product expansion

- [ ] TW command center and counters.
- [ ] Guild roster intelligence.
- [ ] Mod analysis/optimization.
- [ ] Farming/readiness plans.
- [ ] Recruiting intelligence.
- [ ] Guild health/history analytics.
- [ ] Website ↔ Discord shared intelligence views.
- [ ] Event/rotation notifications only after verified data sources and safe delivery controls exist.

## Legal / platform launch review

- [ ] Review Discord production application requirements and app-install permissions.
- [ ] Review commercial use of SWGOH/EA/CG names, data, imagery, and third-party sources.
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
- pilot guild restriction fails;
- setup has no valid bootstrap Ally Code;
- durable shared state is unavailable for a write;
- live SWGOH gateway is unavailable when verification is required;
- link target is not in the bound guild;
- GIVE/KEEP target unit is not owned;
- a non-officer targets another Discord member;
- verified mission evidence is incomplete.

Website Discord auto-discovery must fall back to manual Ally Code entry rather than guessing by display name, SWGOH name, or guild membership.

---

# Immediate next action — do not skip

1. Wait for the latest **Swgoh-App** Railway deployment containing the verified-user UX/account-status/cache-label commits to become **ACTIVE / Deployment successful**.
2. Hard-refresh `/onboarding`.
3. Verify the page now clearly identifies the signed Command Center account, **Warm Bacon**, **732-764-286**, **Ludus Venatus**, active clearance, and the SWGOH profile challenge.
4. Capture the updated screen.
5. Then inspect/execute the first permanent rich Guild sync path so the canonical Supabase `players` row is updated from GP `0` to the live calculated value.
6. Re-check Supabase GP persistence.
7. Complete the remaining Stage 6 negative-permission check before Stage 7.

---

# Change log

- 2026-08-17: Web ownership verification passed. Production confirms **Warm Bacon / 732-764-286 / Ludus Venatus**, `cosmetic_challenge`, verified link, and active Guild membership.
- 2026-08-17: Replaced generic verified onboarding screen with dynamic Command Center account/player/Guild/clearance/verification identity cards and welcome messaging.
- 2026-08-17: Exposed safe signed social display identities to onboarding: pilot Google `Jordi Bailey` and Discord `warmbacon`; provider user IDs are not exposed by account status.
- 2026-08-17: Identified canonical Supabase player GP still at `0` with `last_synced_at=null`; web verified screen intentionally withholds stale GP until permanent rich sync fixes it.
- 2026-08-17: Replaced user-facing linked-player raw `cache: miss` jargon with `live refresh (fresh fetch)` while retaining the raw cache state internally.
- 2026-08-17: Live `/tb me` GP re-test passed: **12,654,861 GP**, **394 hydrated units**.
- 2026-08-17: Added website Discord identity bridge so existing `/tb link` can supply Ally Code without re-entry while retaining SWGOH ownership verification.
- 2026-08-17: Traced and fixed Live Gateway verification Docker packaging in `f73f3eba9a818da5c09f4b89138a799bbc520e95`.
- 2026-08-17: Added production custom-domain/OAuth branding cutover checklist.
- 2026-08-17: `/tb setup` succeeded with `#bot-for-raid` and `@Commands Officer`.
- 2026-08-17: `/tb sync` succeeded against **Ludus Venatus**, hydrating **50/50** rosters at **574,260,422 GP**.
- 2026-08-17: Converted this document into the authoritative master checklist.
