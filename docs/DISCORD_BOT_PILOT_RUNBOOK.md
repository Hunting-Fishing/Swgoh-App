# SWGOH Command Center Discord Bot — Pilot Runbook & Master Checklist

**Purpose:** authoritative checklist for bringing the SWGOH Command Center Discord bot from pilot to production. Update this file only when a checkpoint is actually verified. Do not skip ahead because later architecture has been discussed.

**Current checkpoint:** **Stage 6 — Discord player identity is verified and live GP is correct. Re-test website ownership verification before advancing to Stage 7.**

**Current operating mode:** signed HTTP Discord interactions, guild-scoped `/tb` pilot, live SWGOH gateway reads, durable Railway Volume state, outbound publishing/DM delivery disabled.

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

The bot uses durable state for Discord↔SWGOH guild binding, officer roles, player links, preferences, availability, audit history, and later plan versions.

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
- [ ] Optional: inspect the state directory after setup to confirm `discord-state-v1.json` is present.

---

## Stage 4 — Discord server → SWGOH guild setup ✅

### Bootstrap seed

- [x] `DISCORD_DEFAULT_ALLY_CODE` configured in **Swgoh-App → Variables**.
- [x] `/tb status` reports `Pilot SWGOH guild seed: configured`.

The Ally Code is a pilot bootstrap seed. The durable Discord→SWGOH guild binding becomes authoritative after setup.

### Officer role

- [x] Custom Discord officer role created.
- [x] `@everyone` was not used as the bot officer role.
- [x] Pilot operator assigned the officer role.
- [x] Officer role appeared in `/tb setup` picker.

Verified configured role:

```text
@Commands Officer
```

### `/tb setup`

Verified result:

```text
SWGOH Command Center · Durable Setup Saved
Discord server: 1422643338586099745
SWGOH guild seed: configured
Command channel: #bot-for-raid
Officer role: @Commands Officer
Setup was written atomically with an audit event. Publishing and DMs are still disabled.
```

- [x] `/tb setup` succeeds.
- [x] Discord server binding persisted.
- [x] SWGOH guild seed persisted/resolved for the binding.
- [x] `#bot-for-raid` command channel persisted.
- [x] `@Commands Officer` role persisted.
- [x] Atomic state write succeeded.
- [x] Audit event written.
- [x] Publishing and DMs remained disabled.

---

## Stage 5 — live guild synchronization ✅

Verified result:

```text
SWGOH Command Center · Guild Sync
Guild: Ludus Venatus
Live roster refresh: complete
Hydrated rosters: 50/50
Guild GP: 574,260,422
Cache state: refreshed
No TB assignments or officer state were changed.
```

- [x] `/tb sync` succeeds.
- [x] Correct live SWGOH guild resolved: **Ludus Venatus**.
- [x] Live roster refresh completed.
- [x] Hydrated roster count is **50/50**.
- [x] Guild GP returned: **574,260,422**.
- [x] Cache state reported `refreshed`.
- [x] Sync remained read-only with respect to TB assignments/officer state.
- [x] No mock/fallback roster was presented as the live guild result.

Later resilience test:

- [ ] Confirm normal live reads continue from the durable guild binding independently of the environment Ally Code fallback.

---

## Stage 6 — CURRENT CHECKPOINT: verified Discord player + website ownership verification 🔴

### Discord↔SWGOH player link ✅

Verified `/tb link` behavior:

- [x] Durable Discord→SWGOH guild binding resolved.
- [x] Submitted Ally Code matched a current **Ludus Venatus** guild member.
- [x] Correct SWGOH player returned: **Warm Bacon**.
- [x] Ally Code returned: **732-764-286**.
- [x] Guild membership reported `verified against bound guild roster`.
- [x] Binding source reported `durable-guild-binding`.
- [x] Link persisted durably and was audited.
- [x] No DM or assignment publishing was enabled.

Verified `/tb links` behavior:

- [x] Linked member count returned as **1**.
- [x] Officer view shows the Discord↔SWGOH link and stored player ID.
- [x] Mention suppression is active; listing links did not ping the member.

### `/tb me` live player acceptance ✅

Initial defect:

```text
Galactic Power: 0
Hydrated roster units: 394
Roster cache: fresh
```

Fixes implemented:

- [x] Shared guild roster service normalizes `characterGalacticPower + shipGalacticPower` into total `member.galacticPower` when direct GP is absent.
- [x] Linked-player reads request the rich live guild snapshot using the existing separate rich cache key.
- [x] Regression coverage verifies linked-player reads request rich roster data.
- [x] Regression coverage verifies split character/ship GP normalizes into total member GP.
- [x] GP correction deployed to the live bot.

Verified live re-test on 2026-08-17:

```text
SWGOH player: Warm Bacon · 732-764-286
Guild: Ludus Venatus
Galactic Power: 12,654,861
Hydrated roster units: 394
Roster cache: miss
```

Acceptance:

- [x] Signed caller resolves to the correct linked Discord member.
- [x] Correct SWGOH player name returned.
- [x] Correct Ally Code returned.
- [x] Correct guild returned: **Ludus Venatus**.
- [x] Hydrated roster returned **394 units**.
- [x] Galactic Power now returns a credible non-zero live value: **12,654,861**.
- [x] `cache: miss` accepted as a normal cold rich-cache lookup, not a data failure.
- [ ] Live negative-permission test: normal member cannot inspect another member through self-service commands.

### Website onboarding Discord identity bridge

The pilot website originally required the user to type an Ally Code even when the same Discord account had already been linked with `/tb link`. That duplicated identity work.

Implemented:

- [x] Discord OAuth persists the Discord provider user ID in `user_social_identities`.
- [x] Production Supabase has Discord and Google social identities for the pilot Command Center account.
- [x] Production Supabase confirms those Discord and Google identities belong to the same Command Center user.
- [x] Account onboarding can resolve the signed Command Center user to their connected Discord identity.
- [x] Account onboarding can read that Discord user's durable `/tb link` and recover the existing Ally Code/player ID.
- [x] Added `POST /api/account/link-player/discord` so the browser does not supply the Ally Code for the automatic path.
- [x] `/onboarding` automatically uses the Discord-linked Ally Code when no active web player claim exists.
- [x] Discord-discovered web links remain `pending`; the Discord link does **not** bypass SWGOH player ownership verification.
- [x] Google-only accounts without a connected Discord identity are not falsely matched to a Discord player.
- [x] Regression coverage added for Discord auto-discovery and Google-only isolation.

Still to verify:

- [ ] Verify a clean future-user flow skips manual Ally Code entry when `/tb link` already exists.
- [ ] Add explicit Account Settings → Connect Discord flow for users whose Google and Discord identities are not already attached to the same Command Center account.

### Web ownership verification `Not found` defect

The pilot onboarding reached `Player found — verification required`, but `START OWNERSHIP VERIFICATION` returned `Not found.`

Root cause and fix:

- [x] Narrow `/v1/player/:allyCode/verification-profile` endpoint exists in the Live Gateway source.
- [x] Railway status showed the **SWGOH-Live-Gateway** deployment failed beginning with the verification-endpoint commit.
- [x] Root cause identified: `gateway/recovery.js` imported `verification-service.js`, but the gateway Dockerfile did not copy `verification-service.js` into the image.
- [x] Gateway Docker packaging fixed in commit `f73f3eba9a818da5c09f4b89138a799bbc520e95`.
- [x] Railway reports the SWGOH-Live-Gateway packaging-fix deployment successful.

Current acceptance test:

- [ ] Refresh `/onboarding`.
- [ ] Click `START OWNERSHIP VERIFICATION`.
- [ ] Confirm the previous `Not found.` error is gone.
- [ ] Confirm a portrait/title challenge is returned.
- [ ] Change the requested cosmetic in SWGOH.
- [ ] Run the verification check.
- [ ] Confirm player ownership becomes verified.
- [ ] Confirm Guild membership transitions from `pending` to `active`.

**Do not advance to Stage 7 until this website ownership-verification path is green.**

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
- [ ] Unavailable member is excluded from ROTE donor candidate planning.
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

Run:

```text
/tb phase phase:P1
/tb assignments phase:P1
/tb farms phase:P1
```

Then repeat representative checks for later phases.

- [ ] `/tb phase` returns live phase command-board metrics.
- [ ] `/tb assignments` returns a mission-safe Operation donor draft.
- [ ] `/tb farms` returns verified mission-impact farm priorities.
- [ ] Availability exclusions alter candidates correctly.
- [ ] GIVE/KEEP preferences alter donor priority correctly.
- [ ] Mission protections remain enforced.
- [ ] Hard reserves remain enforced.
- [ ] Forced/risky assignments are clearly marked HELP/risk.
- [ ] Verify planner GP tie-break inputs are non-zero/credible before accepting donor ranking behavior.
- [ ] Generic fleet gates are not presented as exact-ready when selectable-ship evidence is incomplete.

The bot currently does **not** infer the live in-game ROTE phase. Officers select P1-P6 explicitly until a verified live TB-state source exists.

---

## Stage 9 — assignment plan safety before outbound delivery

Do not enable public assignment publishing or member DMs before this stage is complete.

- [ ] Add immutable assignment plan versions.
- [ ] Persist plan hash/version metadata.
- [ ] Add explicit officer preview.
- [ ] Add explicit officer approval.
- [ ] Prevent edited/stale plans from being published under a previous approval.
- [ ] Add approval audit trail.
- [ ] Add cancellation/supersede behavior.
- [ ] Add officer-readable delta between plan versions.

---

## Stage 10 — controlled publishing + delivery

Currently intentionally disabled:

```text
DISCORD_TB_DELIVERY_ENABLED=false
```

Required before enabling:

- [ ] Build rate-limited outbound queue.
- [ ] Add per-message delivery status.
- [ ] Retry transient Discord failures safely.
- [ ] Dead-letter/report permanent failures.
- [ ] Add preview → approve → publish flow.
- [ ] Restrict targets to configured guild destinations.
- [ ] Add safe member mention handling.
- [ ] Add controlled/opt-in member DM delivery.
- [ ] Audit each public post/DM delivery event.
- [ ] Ensure recalculation cannot silently alter an already-approved plan.
- [ ] Enable delivery only after pilot acceptance.

---

# PARKED COMMERCIAL / SCALE BACKLOG

These items are deliberately recorded so they are not forgotten, but **they are not the current task**.

## Multi-guild commercial onboarding

- [ ] Replace pilot-only `DISCORD_DEFAULT_GUILD_ID` restriction with safe multi-guild tenancy.
- [ ] Replace environment Ally Code bootstrap with per-server administrator onboarding.
- [ ] Let each Discord guild provide its own SWGOH guild bootstrap Ally Code.
- [ ] Verify tenant isolation by Discord guild ID at every read/write boundary.
- [ ] Add Discord Guild Install production flow.
- [ ] Move command registration from pilot guild scope to the production/global installation model.
- [ ] Add uninstall/offboarding cleanup policy.

## Production persistence

Current atomic JSON-on-Railway-Volume state is suitable for pilot validation, not the intended high-scale persistence layer.

- [ ] Design PostgreSQL schema for Discord guilds, SWGOH bindings, player links, member controls, plans, audits, subscriptions, and entitlements.
- [ ] Add migrations.
- [ ] Add transactional tenant-scoped writes.
- [ ] Add indexes for Discord guild ID, player ID, Ally Code, and plan versions.
- [ ] Add backup/restore procedure.
- [ ] Migrate pilot JSON state safely.
- [ ] Remove the single-file state-size bottleneck.

## Production hosting + OAuth branding

Railway is the current deployment host, not the intended public-facing brand domain.

- [ ] Attach the final SWGOH Command Center custom domain to the production app.
- [ ] Set Supabase Auth Site URL to the production Command Center URL.
- [ ] Add exact production OAuth redirect URLs, including the Command Center callback path.
- [ ] Keep Railway preview/deployment URLs only where operationally required; do not present them as the normal production login destination.
- [ ] Update Google/Discord provider console callback configuration where required during the domain cutover.
- [ ] Decide whether to configure a Supabase Auth custom domain so the Supabase project domain is also removed from user-visible OAuth callback branding.
- [ ] Re-test Google and Discord sign-in after custom-domain cutover.
- [ ] Re-test sign-out, refresh-session, email confirmation, and password-reset redirects on the production domain.

## Monetization / entitlements

- [ ] Define Free / Officer / Guild Pro / higher-tier feature matrix.
- [ ] Decide production payment provider(s) and Discord-native vs external billing approach.
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
- [ ] Event/rotation notifications only after reliable verified data sources and delivery controls exist.

## Legal / platform launch review

- [ ] Review Discord production application requirements and app-install permissions before public launch.
- [ ] Review commercial use of SWGOH/EA/CG names, data, imagery, and third-party sources before paid public launch.
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

`/tb setup` requires:

- Manage Guild / Manage Server; or
- Administrator.

The custom officer role cannot bootstrap itself before setup exists.

## Officer commands

Guild-wide officer commands require:

- Manage Guild; or
- Administrator; or
- the durably configured `@Commands Officer` role where configured-role authorization applies.

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

The bot should refuse/degrade safely when:

- Discord request signature is invalid;
- signed `application_id` mismatches the deployment;
- pilot guild restriction fails;
- setup has no valid bootstrap Ally Code;
- durable shared state is unavailable for a write command;
- live SWGOH gateway is unavailable when live verification is required;
- link target is not in the bound guild;
- GIVE/KEEP target unit is not owned by the linked player;
- a non-officer targets another Discord member;
- verified mission evidence is incomplete.

Website auto-discovery must also fail safely: a missing/mismatched Discord identity must fall back to manual Ally Code entry rather than guessing by Discord display name, SWGOH name, or guild membership.

Safe clears such as `DEFAULT` preference or `AVAILABLE` may remove stale controls during an upstream outage where implemented.

---

# Immediate next action — do not skip

1. Open the existing signed-in Command Center `/onboarding` page.
2. Hard refresh the page once so the latest frontend is loaded.
3. Confirm it still shows **Warm Bacon / 732-764-286 / Ludus Venatus** as the pending player identity.
4. Click **START OWNERSHIP VERIFICATION**.
5. Capture the exact result.
6. If a portrait/title challenge is displayed, follow the requested change in SWGOH and save it.
7. Return to Command Center and run the verification check.
8. Do not begin Stage 7 availability/preferences until ownership verification is green.

---

# Change log

- 2026-08-17: Live `/tb me` GP re-test passed: **Warm Bacon**, **732-764-286**, **Ludus Venatus**, **12,654,861 GP**, **394 hydrated units**. `cache: miss` was a normal cold rich-cache fetch. GP defect closed.
- 2026-08-17: Added website Discord identity bridge so a signed Command Center account can reuse an existing durable `/tb link` Ally Code instead of retyping it; Discord discovery remains pending until SWGOH ownership verification succeeds.
- 2026-08-17: Verified production Supabase contains Discord + Google social identities attached to the same pilot Command Center account; added regression coverage preventing Google-only false Discord matches.
- 2026-08-17: Traced onboarding `START OWNERSHIP VERIFICATION → Not found.` to failed SWGOH-Live-Gateway deployments; Dockerfile omitted `verification-service.js`. Fixed gateway packaging in `f73f3eba9a818da5c09f4b89138a799bbc520e95`; Railway subsequently reported the Live Gateway deployment successful.
- 2026-08-17: Added production custom-domain/OAuth branding cutover checklist; Railway hostnames are temporary deployment origins.
- 2026-08-17: `/tb link`, `/tb links`, and `/tb me` verified the pilot operator's durable live player identity against **Ludus Venatus**; the first `/tb me` exposed a `Galactic Power: 0` defect while correctly hydrating 394 roster units.
- 2026-08-17: Added linked-player rich-roster GP normalization and regression coverage.
- 2026-08-17: `/tb setup` succeeded with `#bot-for-raid` and `@Commands Officer`; durable atomic write and audit event verified.
- 2026-08-17: `/tb sync` succeeded against live guild **Ludus Venatus**, hydrating **50/50** rosters at **574,260,422 GP** with refreshed cache state.
- 2026-08-17: Added explicit Discord officer-role creation checkpoint before setup.
- 2026-08-17: Converted this document into the authoritative master checklist and recorded Discord registration, signed interactions, Railway `/data` Volume, player-link/preference/availability functionality, safety roadmap, and parked commercial scaling work.
