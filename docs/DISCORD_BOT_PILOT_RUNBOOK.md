# SWGOH Command Center Discord Bot — Pilot Runbook & Master Checklist

**Purpose:** authoritative checklist for bringing the SWGOH Command Center Discord bot from pilot to production. Update this file as each checkpoint is actually verified. Do not skip ahead just because later architecture has been discussed.

**Current checkpoint:** **Stage 6 — player linking is verified; re-verify `/tb me` after the Galactic Power normalization fix deploys.**

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
- When new work is discovered, record it in this runbook before moving past the current stage.

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

Optional deployment verification remains useful:

```bash
echo "$RAILWAY_VOLUME_MOUNT_PATH"
ls -ld /data
ls -l /data/swgoh-command-center/
```

- [ ] Optional: explicitly verify `RAILWAY_VOLUME_MOUNT_PATH=/data` in a fresh Railway Console.
- [ ] Optional: inspect the state directory after setup to confirm `discord-state-v1.json` is present.

Do not fake durability by pointing state at an ordinary ephemeral container directory.

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

Verified success response:

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

Verified command:

```text
/tb sync
```

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

- [ ] After Stage 6 is fully green, confirm normal live reads continue from the durable guild binding independently of the environment Ally Code fallback.

---

## Stage 6 — CURRENT CHECKPOINT: verified player link + GP recheck 🔴

The pilot operator link has now been created successfully against the bound live guild.

Verified `/tb link` behavior:

- [x] Durable Discord→SWGOH guild binding resolved.
- [x] Submitted Ally Code matched a current **Ludus Venatus** guild member.
- [x] Correct SWGOH player name returned: **Warm Bacon**.
- [x] Guild membership reported `verified against bound guild roster`.
- [x] Binding source reported `durable-guild-binding`.
- [x] Link persisted durably and was audited.
- [x] No DM or assignment publishing was enabled.

Verified `/tb links` behavior:

- [x] Linked member count returned as **1**.
- [x] Officer view shows the Discord↔SWGOH link and stored player ID.
- [x] Mention suppression is active; listing links did not ping the member.

Verified `/tb me` behavior:

- [x] Signed caller resolved to the correct linked Discord member.
- [x] Correct SWGOH player name returned.
- [x] Correct guild returned: **Ludus Venatus**.
- [x] Hydrated roster returned **394 units**.
- [x] Roster cache reported `fresh`.
- [ ] Galactic Power must return a credible non-zero live value.
- [ ] Normal member cannot inspect another member through self-service commands.

### GP defect found during Stage 6 acceptance

The first live `/tb me` result showed:

```text
Galactic Power: 0
Hydrated roster units: 394
Roster cache: fresh
```

This is treated as a correctness defect, not a completed acceptance result. The identity and roster are correct; the linked-player read was using the compact guild roster path, while calculated character/ship GP is available on the gateway's rich guild snapshot.

Fixes committed:

- [x] Shared guild roster service normalizes `characterGalacticPower + shipGalacticPower` into total `member.galacticPower` when direct GP is absent.
- [x] Linked-player reads request the rich live guild snapshot using the existing separate rich cache key.
- [x] Regression coverage verifies linked-player reads request rich roster data.
- [x] Regression coverage verifies split character/ship GP normalizes into total member GP.
- [ ] Railway deployment containing the GP fixes is ACTIVE.
- [ ] Re-run `/tb me` after deployment and verify Galactic Power is non-zero and credible.

Do **not** advance to Stage 7 until this GP recheck is green.

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

Safe clears such as `DEFAULT` preference or `AVAILABLE` may remove stale controls during an upstream outage where implemented.

---

# Immediate next action — do not skip

1. Wait for the latest **Swgoh-App** Railway deployment containing the GP fix to show **ACTIVE / Deployment successful**.
2. In Discord run `/tb me` again.
3. Confirm the same linked player and guild are returned.
4. Confirm `Hydrated roster units` remains credible.
5. Confirm `Galactic Power` is now a credible non-zero value.
6. Capture the exact Discord response.
7. Only after the GP recheck is green do we proceed to Stage 7 availability/preferences.

---

# Change log

- 2026-08-17: `/tb link`, `/tb links`, and `/tb me` verified the pilot operator's durable live player identity against **Ludus Venatus**; `/tb me` exposed a `Galactic Power: 0` defect while correctly hydrating 394 roster units.
- 2026-08-17: Added linked-player rich-roster GP normalization, rich-read regression coverage, and a Stage 6 deployment/recheck gate before member-control testing.
- 2026-08-17: `/tb setup` succeeded with `#bot-for-raid` and `@Commands Officer`; durable atomic write and audit event verified.
- 2026-08-17: `/tb sync` succeeded against live guild **Ludus Venatus**, hydrating **50/50** rosters at **574,260,422 GP** with refreshed cache state. Active checkpoint advanced to Stage 6 player linking.
- 2026-08-17: Added explicit Discord officer-role creation checkpoint before setup.
- 2026-08-17: Converted this document into the authoritative master checklist and recorded Discord registration, signed interactions, Railway `/data` Volume, player-link/preference/availability functionality, safety roadmap, and parked commercial scaling work.
