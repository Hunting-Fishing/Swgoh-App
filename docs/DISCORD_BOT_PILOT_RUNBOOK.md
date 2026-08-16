# SWGOH Command Center Discord Bot — Pilot Runbook & Master Checklist

**Purpose:** this is the authoritative Discord bot bring-up checklist for the SWGOH Command Center project. Update this file as work is completed. Do not skip ahead simply because later architecture has been discussed.

**Current checkpoint:** **Stage 4D — create the pilot Discord officer role before running `/tb setup`.**

**Current operating mode:** signed HTTP Discord interactions, guild-scoped `/tb` pilot, live SWGOH gateway reads, durable Railway Volume attached, outbound publishing/DM delivery still disabled.

---

## 0. Ground rules

- Production behavior must use live SWGOH data; do not silently substitute mock roster data.
- Discord interactions remain ephemeral during the pilot unless a later approved publishing flow explicitly says otherwise.
- Public assignment publishing and member DMs remain disabled until preview/approval/audit/queue safeguards exist.
- Manage Guild / Administrator remains bootstrap authority. A durably configured officer role may authorize supported officer commands after setup.
- Discord-to-player linking is officer-mediated and verifies that the Ally Code belongs to the currently bound SWGOH guild. It is not cryptographic game-account ownership proof.
- Member self-service is limited to the signed Discord caller's own linked profile/preferences/availability unless the caller has officer authority.
- When a new task is discovered, add it to this runbook before moving past the current stage.

---

# MASTER CHECKLIST

## Stage 1 — Discord application + signed interaction endpoint

- [x] Discord application ID configured in Railway.
- [x] Discord bot token configured in Railway.
- [x] Discord public key configured in Railway.
- [x] Pilot Discord guild ID configured in Railway.
- [x] `DISCORD_TB_INTERACTIONS_ENABLED` present.
- [x] `/api/discord/interactions` accepts Discord signed interactions.
- [x] Ed25519 request signature verification implemented.
- [x] Signed application ID validation implemented.
- [x] Discord PING verification works.
- [x] Guild restriction works for the pilot server.
- [x] `/tb status` responds successfully in Discord.
- [x] Responses are ephemeral by default.
- [x] `allowed_mentions` suppresses accidental pings.

### Verified pilot Discord server

```text
1422643338586099745
```

---

## Stage 2 — `/tb` command registration

- [x] Guild-scoped `/tb` command registration script exists.
- [x] Discord command option-ordering bug fixed.
- [x] Registration diagnostics expanded to print nested Discord schema errors.
- [x] `/tb` successfully registered with Discord.
- [x] Command ID returned successfully by Discord.

Successful registration observed:

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

> Re-run `npm run discord:register-tb` only when the Discord slash-command schema changes. It is not required for ordinary deploys that do not change the command manifest.

---

## Stage 3 — durable Discord state

The bot uses durable state for Discord↔SWGOH guild binding, officer roles, player links, preferences, availability, audit history, and later plan versions.

- [x] Persistent Railway Volume attached to **Swgoh-App**.
- [x] Volume mount path `/data` exists inside the deployed service.
- [x] Bash verification succeeded:

```text
drwxr-xr-x ... /data
```

- [ ] Confirm the running app sees `RAILWAY_VOLUME_MOUNT_PATH=/data`.
- [ ] Confirm `/tb status` / `/api/discord/status` reports durable state `enabled=true`, `durable=true`, `reason=ready` after the volume deployment.
- [ ] Confirm first durable state file is created after `/tb setup`.

Expected state path with the Railway mount:

```text
/data/swgoh-command-center/discord-state-v1.json
```

Optional console verification:

```bash
echo "$RAILWAY_VOLUME_MOUNT_PATH"
ls -ld /data
```

Expected first command output:

```text
/data
```

Do not fake durability by pointing state at an ordinary ephemeral container directory.

---

## Stage 4 — CURRENT CHECKPOINT: bootstrap the pilot guild with `/tb setup`

### 4A. Configure the pilot SWGOH guild seed

- [x] `DISCORD_DEFAULT_ALLY_CODE` is configured in **Swgoh-App → Variables**.
- [x] `/tb status` reports `Pilot SWGOH guild seed: configured`.

This is a **pilot bootstrap seed**, not the long-term commercial multi-guild onboarding model. Once `/tb setup` durably binds this Discord server to its SWGOH guild, normal live read commands resolve the durable binding first.

### 4B. Wait for Railway deployment

- [x] Updated Swgoh-App deployment is serving the new configuration.

### 4C. Verify status before setup

Run in Discord:

```text
/tb status
```

Verified:

- [x] `HTTP interactions: enabled`.
- [x] Pilot Discord server ID is correct.
- [x] `Pilot SWGOH guild seed: configured`.
- [ ] Durable state reports ready rather than `durable-storage-not-configured`.
- [x] Publishing/DM delivery remains disabled.

### 4D. Create the Discord officer role — CURRENT ACTION

The pilot Discord server currently has no custom roles; only `@everyone` exists. Do **not** use `@everyone` for `officer_role`. The bot intentionally rejects it because that would authorize every server member as an officer.

Create this pilot role:

```text
SWGOH Officer
```

Recommended pilot policy:

- this role identifies people authorized to operate SWGOH Command Center officer commands;
- do **not** enable Discord `Administrator` merely for the bot;
- do **not** enable Discord `Manage Roles` merely for the bot;
- do **not** enable Discord `Manage Server` merely for ordinary bot officer access;
- role membership itself is persisted by `/tb setup` as the Command Center officer authorization signal;
- the server owner/Administrator can still bootstrap setup independently of the custom role.

Create and assign it in Discord:

1. Server name → **Server Settings**.
2. **Roles** → **Create Role**.
3. Name it `SWGOH Officer`.
4. Choose a visible role color if desired.
5. Leave dangerous administrative permissions disabled for the pilot unless independently required for Discord administration.
6. Save changes.
7. Open **Members** / **Manage Members**.
8. Assign `SWGOH Officer` to the pilot operator account.
9. Ensure the SWGOH Command Center bot's managed bot role remains in a sane hierarchy and is not replaced by `SWGOH Officer`.

Acceptance:

- [ ] `SWGOH Officer` role exists.
- [ ] Pilot operator is assigned `SWGOH Officer`.
- [ ] `@everyone` is not used as the bot officer role.
- [ ] No unnecessary `Administrator` permission was granted.
- [ ] The role appears in the `/tb setup officer_role` picker.

### 4E. Run `/tb setup`

Run as the server owner or a Discord member with **Manage Guild / Manage Server** or **Administrator**:

```text
/tb setup
```

Recommended selections:

```text
channel: #bot-for-raid
officer_role: @SWGOH Officer
```

Expected setup behavior:

1. read the bootstrap Ally Code;
2. resolve the live SWGOH player/guild through the configured gateway;
3. verify the live guild can be resolved;
4. persist the Discord server → SWGOH guild binding;
5. persist the command channel;
6. persist the selected officer role ID;
7. write an audit entry to durable state;
8. return an ephemeral success response.

- [ ] `/tb setup` succeeds.
- [ ] Discord→SWGOH guild binding persisted.
- [ ] `#bot-for-raid` command channel persisted.
- [ ] `SWGOH Officer` role persisted.
- [ ] Durable state file exists on `/data`.
- [ ] Re-running `/tb status` reflects configured live guild state.

### Failure handling at this checkpoint

If `/tb setup` fails, **stop here** and capture the exact Discord response before moving to `/tb sync`.

Do not skip ahead to commercial onboarding, subscriptions, public publishing, DMs, or plan approval until this stage is green.

---

## Stage 5 — live guild synchronization

Only begin after Stage 4 is green.

Run:

```text
/tb sync
```

Expected behavior: force-refresh the bound SWGOH guild roster from the live gateway and return the live guild name, hydrated roster count, guild GP, and cache/source status.

- [ ] `/tb sync` succeeds.
- [ ] Correct SWGOH guild name returned.
- [ ] Correct guild GP returned.
- [ ] Guild member count/hydration looks credible.
- [ ] No fallback/mock roster data is presented as live.
- [ ] Re-run confirms durable guild binding works independently of the environment Ally Code fallback.

---

## Stage 6 — link the pilot Discord member to SWGOH

Run as an officer:

```text
/tb link member:@<Discord member> ally_code:<9-digit Ally Code>
```

Rules already implemented:

- claimed Ally Code must exist in the currently bound SWGOH guild roster;
- one Ally Code cannot be linked to two Discord users within the same Discord server;
- link is stored durably and audited;
- relinking to another Ally Code clears stale member preferences/availability;
- unlink clears stale member preferences/availability.

Pilot acceptance:

- [ ] Link the pilot operator account.
- [ ] `/tb links` shows the link to officers.
- [ ] `/tb me` returns the signed caller's live linked SWGOH profile.
- [ ] Normal member cannot inspect another member through self-service commands.

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
- [ ] Mission protections and hard reserves continue to override unsafe donor choices.

### UX improvement backlog for member controls

- [ ] Replace raw unit Base ID entry with user-friendly verified unit search/autocomplete.
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
- [ ] `/tb assignments` returns mission-safe Operation donor draft.
- [ ] `/tb farms` returns verified mission-impact farm priorities.
- [ ] Availability exclusions alter candidates correctly.
- [ ] GIVE/KEEP preferences alter donor priority correctly.
- [ ] Mission protections remain enforced.
- [ ] Hard reserves remain enforced.
- [ ] Forced/risky assignments are clearly marked HELP/risk rather than disguised as safe.
- [ ] Generic fleet gates are not presented as exact-ready when selectable-ship evidence is incomplete.

The bot currently does **not** infer the live in-game ROTE phase. Officers select P1-P6 explicitly until a verified live TB-state source is available.

---

## Stage 9 — assignment plan safety before outbound delivery

Do not enable public assignment publishing or member DMs before completing this stage.

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
- [ ] Add preview → approve → publish command flow.
- [ ] Restrict target channels to configured guild destinations.
- [ ] Add safe member mention handling.
- [ ] Add opt-in/controlled member DM delivery.
- [ ] Audit each public post/DM delivery event.
- [ ] Ensure a planner recalculation cannot silently change an already-approved plan.
- [ ] Enable delivery only after pilot acceptance.

---

# PARKED COMMERCIAL / SCALE BACKLOG

These items are deliberately recorded here so they are not forgotten, but **they are not the current task**. Do not jump to them before the pilot stages above are green.

## Multi-guild commercial onboarding

- [ ] Replace pilot-only `DISCORD_DEFAULT_GUILD_ID` restriction with safe multi-guild tenancy.
- [ ] Replace environment Ally Code bootstrap with per-server administrator onboarding.
- [ ] Let each Discord guild provide its own SWGOH guild bootstrap Ally Code.
- [ ] Verify tenant isolation by Discord guild ID at every read/write boundary.
- [ ] Add Discord Guild Install production flow.
- [ ] Move command registration from pilot guild scope to the appropriate production/global installation model.
- [ ] Add uninstall/offboarding cleanup policy.

## Production persistence

The current atomic JSON-on-Railway-Volume state is suitable for pilot validation, not the intended high-scale final persistence layer.

- [ ] Design PostgreSQL schema for Discord guilds, SWGOH guild bindings, links, member controls, plans, audits, subscriptions, and entitlements.
- [ ] Add database migrations.
- [ ] Add transactional tenant-scoped writes.
- [ ] Add indexes for Discord guild ID, player ID, Ally Code, and plan version lookups.
- [ ] Add backup/restore procedure.
- [ ] Migrate pilot JSON state into the database safely.
- [ ] Remove single-file state-size bottleneck after migration.

## Monetization / entitlement layer

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
- [ ] Review commercial use of SWGOH/EA/CG names, data, imagery, and third-party data sources before paid public launch.
- [ ] Record permissions/licenses/terms relied on for each external data/image source.

---

# Current Railway configuration checklist

Known configured variables from the pilot deployment:

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

`/tb setup` requires one of:

- Discord Manage Guild / Manage Server permission; or
- Discord Administrator permission.

A configured officer role cannot bootstrap setup before it exists.

## Officer commands

Guild-wide officer commands require:

- Manage Guild; or
- Administrator; or
- a durably configured officer role where the command supports configured-role authorization.

## Linked-member self-service

Normal linked members may use self-only behavior for:

```text
/tb me
/tb preference
/tb preferences
/tb availability
```

They cannot use the optional `member` target to act on another Discord user unless officer-authorized.

---

# Fail-closed expectations

The bot should refuse/degrade safely when:

- Discord request signature is invalid;
- signed `application_id` mismatches the deployment;
- pilot guild restriction fails during the pilot;
- `/tb setup` has no valid bootstrap Ally Code;
- durable shared state is unavailable for a write command;
- live SWGOH gateway is unavailable when live verification is required;
- link target is not in the bound SWGOH guild;
- GIVE/KEEP target unit is not owned by the linked player;
- a non-officer tries to target another Discord member;
- verified mission evidence is incomplete.

Safe clears such as `DEFAULT` preference or `AVAILABLE` may remove stale controls during an upstream outage where implemented, because clearing a restriction is safer than leaving an obsolete one stuck indefinitely.

---

# Immediate next action — do not skip

1. Create the `SWGOH Officer` Discord role.
2. Assign `SWGOH Officer` to the pilot operator account.
3. Confirm the role appears in `/tb setup officer_role`.
4. Run `/tb setup` with `channel:#bot-for-raid` and `officer_role:@SWGOH Officer`.
5. Capture the exact Discord result.
6. Only after setup succeeds, proceed to `/tb sync`.

---

## Change log

- 2026-08-17: Added explicit Discord officer-role creation checkpoint before `/tb setup`; recorded the Ally Code seed as configured and retained `/tb setup` as the active stage.
- 2026-08-17: Converted this document into the authoritative master checklist and reset the active checkpoint to `/tb setup`.
- 2026-08-17: Recorded successful `/tb` registration, live signed interaction response, Railway `/data` Volume mount, existing member-link/preference/availability functionality, safety roadmap, and parked commercial scaling work.
