# Stage 10 — Controlled ROTE Discord Delivery

Status: implementation in PR #197; live channel publishing remains disabled until pilot acceptance.
Master tracker: #194.

## Purpose

Stage 10 is the first outbound-delivery layer for ROTE assignments. It may deliver only an exact Stage 9 immutable assignment version that is still current and officer-approved.

Stage 10 does not regenerate assignments, mutate an immutable version, auto-publish after roster changes, or send member DMs in the first acceptance slice.

## Discord command surface

Stage 9 leaves `/tb` at 24 of Discord's 25 available root options. Stage 10 therefore consumes the final slot with one multi-action command instead of adding separate preview/publish/status subcommands:

`/tb plan-delivery action:PREVIEW|STATUS|PUBLISH phase:<P1-P6> version:<n> [hash] [confirm]`

- `PREVIEW`: verifies the selected artifact and durable destination and renders the exact channel-delivery plan. No Discord assignment message is sent.
- `STATUS`: reads durable per-chunk delivery receipts for that artifact/destination.
- `PUBLISH`: requires the exact approved artifact, a 12+ character matching hash prefix, and `confirm:PUBLISH`.

After this change `/tb` is 25/25. Future top-level TB features must consolidate/reorganize the command surface rather than append another subcommand.

## Fail-closed gates

Publishing requires all of the following:

1. Signed Discord interaction in the configured pilot Guild.
2. Discord officer authorization plus active linked Command Center owner/officer membership.
3. Current persisted ROTE plan.
4. Requested immutable version exists in the same Guild/plan/phase.
5. Authoritative Stage 9 `assertPublishable` succeeds:
   - deterministic payload hash verifies;
   - version is not cancelled;
   - version is not superseded/stale;
   - exact-hash officer approval exists;
   - source plan is still active;
   - selected version is still latest for its plan/phase.
6. Durable verified Discord Guild binding and configured command channel.
7. Supplied Stage 10 hash confirmation matches the approved immutable hash.
8. Explicit `confirm:PUBLISH`.
9. Dedicated `DISCORD_STAGE10_TB_CHANNEL_ENABLED=true` gate.
10. A durable per-chunk `sending` receipt is claimed before each external Discord request.
11. Stage 9 publishability is rechecked immediately before every new channel message.

The legacy `DISCORD_TB_DELIVERY_ENABLED` gate is intentionally not used by this flow and should remain disabled during the first Stage 10 pilot slice.

## Delivery behavior

- Channel only.
- Discord member mentions disabled (`allowed_mentions.parse=[]`).
- Member DMs disabled.
- Webhook fallback disabled.
- Automatic/proactive delivery disabled.
- Discord 429 responses may be retried because the rejected rate-limited request was not accepted.
- Timeout, ambiguous failure, or receipt-finalization failure is fail-closed and requires manual receipt review before any resend.

## Idempotency

Each chunk uses the existing unique delivery-receipt key over:

- immutable run ID;
- immutable plan hash;
- durable destination ID;
- channel delivery mode;
- mentions=false;
- memberDms=false;
- chunk index.

A `delivered` receipt is reused on an identical replay and no duplicate Discord request is sent. An existing `sending` or `failed` receipt blocks automatic replay so uncertain delivery cannot create duplicate assignments.

## Pilot artifact

Stage 9 accepted clean baseline:

- Guild: Ludus Venatus
- Phase: P6
- Version: v3
- Run ID: `8bcf3626-0c77-4605-add4-90e44902980a`
- SHA-256: `abdb319097b2af08b2fd1482d45ee155f287b28b4ff4ba1fbb2597c6e82d6ef0`
- 112 assigned / 158 unfilled / 3 HELP

## First live acceptance sequence

Keep `DISCORD_STAGE10_TB_CHANNEL_ENABLED` false initially.

1. Run `/tb plan-delivery action:PREVIEW phase:P6 version:3`.
2. Confirm publishability PASS, exact v3 hash, correct verified channel, chunk count, DMs OFF, webhook OFF, and safety gate LOCKED.
3. Only after the preview is accepted, enable `DISCORD_STAGE10_TB_CHANNEL_ENABLED=true` on the Swgoh-App Railway service.
4. Re-run PREVIEW; require safety gate ARMED.
5. Run one exact PUBLISH for P6 v3 with hash prefix `abdb319097b2` and `confirm:PUBLISH`.
6. Run STATUS and reconcile every durable receipt to Discord message IDs.
7. Repeat the exact PUBLISH once; require zero new messages and all chunks reused from delivered receipts.
8. Disable the Stage 10 gate again after pilot acceptance unless the next rollout step explicitly keeps controlled officer publishing armed.

Member DMs remain out of scope for this acceptance.

## Validation constraints

GitHub Actions is currently affected by repository/account runner infrastructure issue #180: jobs terminate with `steps=null` before tests execute. Added Stage 10 tests therefore must not be represented as executed CI passes until that infrastructure issue is resolved. A container clone attempt also failed because the execution environment could not resolve `github.com`.
