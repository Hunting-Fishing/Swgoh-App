# Discord Player Linking Safety Model

## Purpose

Discord player linking must never accept an arbitrary Ally Code and silently attach it to a Discord identity. The first production-safe rollout is officer-mediated and guild-scoped.

## Current implementation

The player-link path is now implemented end-to-end for the pilot Discord application:

- `discord-player-link.mjs` verifies a claimed 9-digit Ally Code against the live roster of the SWGOH guild bound to the Discord server;
- `discord-player-link-service.mjs` performs the verified transaction and writes through the durable Discord state store;
- `discord-state-store.mjs` enforces one Ally Code per Discord user mapping inside a server, rejects duplicate Ally Code claims by another Discord user, and records audited link/unlink mutations;
- `discord-tb.mjs` exposes officer-authorized `/tb link`, `/tb unlink`, and `/tb links` interaction handlers;
- `scripts/register-discord-tb-commands.mjs` contains the guild-scoped Discord command definitions;
- focused tests cover durable-only operation, transaction routing, duplicate-safe state, unlinking, link listing, and fail-closed storage behavior.

## Guild membership verification

For `/tb link member:<discord-user> ally_code:<ally-code>`, the verifier:

1. validates the Discord server and Ally Code inputs;
2. resolves the durable Discord server → SWGOH guild binding first;
3. uses the pilot Ally Code only as a bootstrap/fallback when appropriate;
4. reads the bound guild through the shared live guild roster service;
5. requires the claimed Ally Code to be present in that guild roster;
6. captures matched player ID/name and guild evidence;
7. only then permits the durable player-link transaction;
8. fails closed if durable state is enabled but cannot be read.

A claim for an Ally Code outside the bound guild is rejected before persistence.

## Ownership boundary

Guild membership is **not cryptographic proof** that the selected Discord user personally owns the SWGOH account. The current command therefore remains officer-mediated and must not be described as self-service ownership verification.

The trust statement is:

> An authorized guild officer linked this Discord member to an Ally Code that was verified as belonging to the Discord server's bound live SWGOH guild roster.

A later self-service flow needs an additional ownership challenge or explicit officer approval mechanism before it can be described as verified account ownership.

## Slash commands

### `/tb link member:<user> ally_code:<code>`

Officer-only. Verifies guild membership first, then persists the Discord user ↔ SWGOH player mapping with an audit event.

### `/tb unlink member:<user>`

Officer-only. Removes an existing durable mapping through an audited transaction.

### `/tb links`

Officer-only. Lists the durable mappings for the Discord server. Discord mentions are suppressed so the listing does not ping members.

## Authorization

The existing Discord interaction authorization remains authoritative:

- Manage Guild / Manage Server permission; or
- Administrator permission; or
- a durably configured officer role for non-bootstrap `/tb` commands.

`/tb setup` remains restricted to Manage Guild or Administrator even if a configured officer role exists.

## Persistence and safety guarantees

Player links require durable state. If the Railway Volume / confirmed durable state directory is unavailable, link/unlink/list operations fail closed.

The state layer preserves:

- Discord guild ID;
- Discord user ID;
- normalized 9-digit Ally Code;
- SWGOH player ID when available;
- original `linkedAt` timestamp across relinks by the same Discord user;
- updated timestamp;
- audited actor and action metadata.

A single Ally Code cannot be durably assigned to two different Discord users in the same Discord server.

## Still disabled

Player identity linking does **not** enable any of the following by itself:

- self-service account claiming;
- direct messages;
- public assignment publishing;
- automatic @mentions;
- Operation locks from Discord;
- member donation-preference writes from Discord;
- automated officer actions;
- cross-guild linking.

Those capabilities should build on the durable player identity layer rather than bypass it.

## Next safe transport step

The next member-facing mutation should be donation preference / availability state for an already-linked player, with these boundaries:

- normal members may mutate only their own durable player record;
- officers may act for guildmates;
- every mutation is audited;
- the safe ROTE planner consumes the persisted preference state;
- no public posting or DMs are required to enable preference management.

Outbound assignment publishing and DMs should remain a separate later rollout with immutable plan versions, explicit officer approval, a delivery queue, rate-limit handling, and per-member delivery status.
