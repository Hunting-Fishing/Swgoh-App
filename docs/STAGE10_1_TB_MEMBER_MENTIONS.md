# Stage 10.1 — ROTE linked-member mentions and verified TB channels

## Objective

Stage 10.1 extends the accepted immutable Stage 10 ROTE channel delivery so officers can direct an approved assignment artifact to a verified TB channel and notify the Discord members who are durably linked to the assigned SWGOH players.

It does not weaken Stage 9/10 safety. The exact immutable plan version, hash approval, current-version checks, officer authorization, destination verification, durable receipts, and idempotency remain mandatory.

## Discord surface

Stage 10.1 reuses the existing final `/tb` subcommand slot:

`/tb plan-delivery`

Options:

- `action: PREVIEW | STATUS | PUBLISH`
- `phase: P1..P6`
- `version: <immutable version>`
- `channel: <optional Discord text/announcement channel>`
- `mentions: ON | OFF` — defaults to `ON` for TB public delivery
- `hash: <12+ hex confirmation>` — required for publish
- `confirm: PUBLISH` — required for publish

No new `/tb` subcommand is consumed; `/tb` remains within Discord's 25-subcommand limit.

## Verified channel selection

When `channel` is omitted, delivery uses the Guild's configured Command Center channel from durable `/tb setup` state.

When `channel` is provided, the selected channel must already exist in `guild_discord_destinations` as:

- `destination_kind = channel`
- `verified = true`
- owned by the currently bound Discord Guild
- a supported text/announcement channel for Stage 10.1

An arbitrary Discord channel ID is not enough. Unverified, wrong-Guild, or unsupported destinations fail closed before any message is sent.

Officers can verify a channel with the existing `/guild verify-channel` path. This permits a dedicated channel such as `#tb-assignments` or `#rote-assignments` without changing the generic command channel.

## Member registration and mention identity

A Discord member is mentionable only when Command Center has a durable Discord user ↔ SWGOH player link in the bound Guild state.

Safe registry population paths are:

1. `/guild register-mates` — exact normalized Discord-name ↔ current Guild-roster matcher. Only unambiguous exact matches are eligible for automatic linking.
2. `/tb link member:<discord-user> ally_code:<ally-code>` — officer-mediated explicit link; the Ally Code must resolve inside the currently bound SWGOH Guild roster.

Command Center does not fuzzy-guess an identity for outbound mentions. Unlinked assigned players remain visible by SWGOH name and are counted as unlinked in PREVIEW/STATUS.

## Mention behavior

With `mentions:ON`:

- linked assigned members render as `<@discordUserId>`;
- unlinked assigned members render as their SWGOH player name;
- PREVIEW reports `linked assigned members / assigned members` and the unlinked count;
- the Discord request uses `allowed_mentions.parse = []`;
- only explicit linked user IDs are placed in `allowed_mentions.users`;
- no `@everyone`, `@here`, or role parsing is enabled;
- each linked member is notification-allowlisted at most once across a multi-message delivery, even when that member has several Operation assignments;
- member DMs remain disabled.

With `mentions:OFF`, all members render by name and `allowed_mentions.users` is empty.

## Immutable audience safety

The assignment artifact remains immutable, but Discord↔SWGOH links can legitimately change over time. Stage 10.1 therefore computes a deterministic mention-audience fingerprint from the unique assigned-member identities and their resolved Discord link state.

Every mention-enabled receipt stores that audience fingerprint plus the rendered chunk hash.

If a delivery is partially completed and the member-link registry changes before a retry/resume:

- PREVIEW/STATUS refuse to treat the old receipt set as the current audience;
- PUBLISH fails with `STAGE10_MENTION_AUDIENCE_CHANGED` before another chunk is sent;
- the officer must reconcile the existing receipts and intentionally create/review a new delivery attempt.

This prevents one immutable assignment set from being delivered as a mixed old/new notification audience.

## Idempotency

The Stage 10 idempotency identity includes:

- immutable assignment run ID
- immutable plan hash
- verified destination ID
- Discord channel delivery kind
- mention policy ON/OFF
- DMs OFF

Therefore:

- identical artifact + channel + mention policy replays reuse durable receipts and send no duplicate messages;
- mentions ON and mentions OFF are separate delivery identities;
- different verified TB channels are separate delivery identities.

Rendered chunk hashes and mention-audience fingerprints provide additional fail-closed checks within an existing delivery identity.

## Required publishability gates

Before delivery, and again before each outbound message, Command Center requires:

- authorized Guild officer
- correct bound Guild/server
- current active ROTE plan
- selected immutable version exists for the requested phase
- deterministic stored hash verification passes
- exact officer-approved plan hash matches
- version is not cancelled
- version is not superseded/stale
- selected destination remains verified
- exact publish hash confirmation matches
- `confirm:PUBLISH`
- `DISCORD_STAGE10_TB_CHANNEL_ENABLED=true`

## Still disabled

Stage 10.1 does not enable:

- member DMs
- role, `@everyone`, or `@here` notifications
- fuzzy auto-linking
- publishing to unverified channels
- webhook fallback
- automatic/proactive publishing
- scheduled TB execution

Those are separate acceptance lanes.

## Pilot acceptance sequence

For a safe live pilot:

1. Create/select a dedicated private TB test channel.
2. Verify it with `/guild verify-channel`.
3. Run `/guild register-mates` to populate safe exact-name links; resolve remaining ambiguous members manually with `/tb link` as desired.
4. Run `/tb plan-delivery action:PREVIEW ... channel:<verified-channel> mentions:ON`.
5. Confirm the reported mention coverage and destination before publishing.
6. Publish only the exact approved immutable hash.
7. Confirm durable receipts match the Discord message IDs.
8. Replay the identical publish once and confirm `new messages: 0` / receipt reuse.

Do not use the already-delivered Stage 10 P6 no-mention receipt set as evidence for Stage 10.1 mention delivery; mentions ON intentionally has its own delivery identity.
