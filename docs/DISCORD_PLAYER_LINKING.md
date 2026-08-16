# Discord Player Linking + Member Control Safety Model

## Purpose

Discord player linking must never accept an arbitrary Ally Code and silently attach it to a Discord identity. Member-controlled TB state must likewise never target an unlinked or unrelated SWGOH account.

The current production-safe pilot is guild-scoped: player linking remains officer-mediated, while already-linked members may use tightly scoped self-service for their own player record, unit donation preferences, and TB availability.

## Current implementation

The identity and member-control path is implemented end-to-end for the pilot Discord application:

- `discord-player-link.mjs` verifies a claimed 9-digit Ally Code against the roster of the SWGOH guild durably bound to the Discord server;
- `discord-player-link-service.mjs` performs the verified link transaction and writes through the durable Discord state store;
- `discord-state-store.mjs` enforces one Ally Code mapping per Discord user inside a server, rejects duplicate Ally Code claims, stores audited GIVE/KEEP and availability controls, and clears stale controls on relink/unlink;
- `discord-linked-player-service.mjs` resolves an existing Discord user link back to the current bound guild roster for member-safe read workflows;
- `discord-donation-preference-service.mjs` verifies current guild membership and unit ownership before GIVE/KEEP writes;
- `discord-member-availability-service.mjs` verifies current bound-guild membership before an UNAVAILABLE exclusion is persisted;
- `discord-tb-live.mjs` feeds persisted GIVE/KEEP and UNAVAILABLE controls into the mission-safe ROTE planner;
- `discord-tb.mjs` exposes officer and member-safe interaction handlers;
- `scripts/register-discord-tb-commands.mjs` contains the guild-scoped Discord command definitions;
- focused tests cover durable state, transaction routing, duplicate-safe identity, unit ownership validation, availability verification, planner consumption, self-target authorization, signed Discord interactions, and fail-closed storage behavior.

## Guild membership verification

For `/tb link member:<discord-user> ally_code:<ally-code>`, the verifier:

1. validates the Discord server and Ally Code inputs;
2. requires durable Discord guild setup;
3. resolves the persisted Discord server → SWGOH guild binding;
4. reads the bound guild through the shared guild roster service;
5. requires the claimed Ally Code to be present in that guild roster;
6. captures matched player ID/name and guild evidence;
7. only then permits the durable player-link transaction;
8. fails closed if durable state cannot be read.

A claim for an Ally Code outside the bound guild is rejected before persistence.

## Ownership boundary

Guild membership is **not cryptographic proof** that the selected Discord user personally owns the SWGOH account. The link command therefore remains officer-mediated and must not be described as self-service account ownership verification.

The trust statement is:

> An authorized guild officer linked this Discord member to an Ally Code that was verified as belonging to the Discord server's bound SWGOH guild roster.

After that officer-created mapping exists, self-service commands use the signed Discord caller ID as the authorization boundary: a normal member can access only the SWGOH player mapped to that same Discord user ID.

A future self-service linking flow would still require an additional ownership challenge or explicit officer approval mechanism before it could be described as verified account ownership.

## Slash commands

### `/tb me`

Available to a linked member. Resolves only the calling Discord user ID, checks that the linked Ally Code is still present in the bound guild roster, and returns that player's current roster summary. It cannot target another Discord user and performs no mutation.

### `/tb link member:<user> ally_code:<code>`

Officer-only. Verifies guild membership first, then persists the Discord user ↔ SWGOH player mapping with an audit event.

### `/tb unlink member:<user>`

Officer-only. Removes an existing durable mapping through an audited transaction. Stored unit preferences and availability state for that Discord user are cleared so stale controls cannot survive onto a different future player link.

### `/tb links`

Officer-only. Lists durable mappings for the Discord server. Discord mentions are suppressed so the listing does not ping members.

### `/tb preference member:<optional-user> unit:<base-id> preference:<give|default|keep>`

A linked normal member may omit `member` or explicitly select themselves. They cannot target another Discord user. Authorized officers may select another linked guild member.

For `GIVE` and `KEEP`, the service requires:

- durable guild setup;
- a durable Discord user ↔ SWGOH player link;
- the linked player to still be present in the bound guild roster;
- the linked player to currently own the selected Base ID.

Only after those checks does the durable state write occur.

`DEFAULT` removes the explicit override and is intentionally allowed to clear durable state without requiring the live gateway. This allows a stale or unwanted control to be removed during an upstream outage.

### `/tb preferences member:<optional-user>`

A normal linked member is automatically scoped to their own Discord user ID and cannot read another member's controls. Authorized officers may scope to a linked member or omit the member option to inspect all current GIVE/KEEP overrides. Mentions are suppressed.

### `/tb availability member:<optional-user> state:<optional-available|unavailable>`

A linked normal member may read or change only their own availability. Authorized officers may target another linked guild member.

When `state` is omitted, the command is read-only and reports the current durable state.

`UNAVAILABLE` requires the linked player to resolve successfully against the current bound guild roster before persistence. Once stored, the player's stable member ID is passed to the ROTE planner as an ignored member and removed from Operation donor candidates.

`AVAILABLE` clears the explicit exclusion. Clearing is intentionally allowed without the live gateway so a player can recover from an old exclusion during an upstream outage.

## Planner integration

Discord member controls feed the same mission-safe ROTE planner used by `/tb assignments` and `/tb phase`.

The planner contract is:

- `GIVE`: favor this legal donor before normal safe donors;
- `DEFAULT`: no explicit donor override;
- `KEEP`: push this donor behind normal and mission-protected alternatives, using it only when safer legal owners are exhausted;
- `UNAVAILABLE`: remove this linked player from donor eligibility and available-owner counts;
- `AVAILABLE`: no explicit availability exclusion;
- mission protections and hard reserves remain independent safety constraints;
- forced KEEP/protection usage remains visible as HELP/risk rather than being hidden.

Discord planning output reports how many GIVE/KEEP controls and unavailable-member exclusions were consumed.

## Authorization

### Officer surface

The existing officer authorization remains authoritative for guild-wide commands and cross-member mutation:

- Manage Guild / Manage Server permission; or
- Administrator permission; or
- a durably configured officer role for non-bootstrap `/tb` commands.

`/tb setup` remains restricted to Manage Guild or Administrator even if a configured officer role exists.

### Linked-member self-service

Normal Discord members are admitted only for the explicit self-service subcommands:

- `/tb me`;
- `/tb preference` for their own linked Discord user ID;
- `/tb preferences` for their own linked Discord user ID;
- `/tb availability` for their own linked Discord user ID.

A normal member cannot use self-service authorization to call `/tb sync`, `/tb phase`, `/tb assignments`, `/tb farms`, `/tb links`, `/tb link`, `/tb unlink`, or `/tb setup`.

A valid target belonging to a different Discord user fails authorization before the preference or availability transaction executes.

## Persistence and safety guarantees

Shared Discord state requires confirmed durable storage. If the Railway Volume / confirmed durable state directory is unavailable, identity and member-control mutations fail closed.

The state layer preserves:

- Discord guild ID;
- Discord user ID;
- normalized 9-digit Ally Code;
- SWGOH player ID when available;
- original `linkedAt` timestamp across safe relinks;
- GIVE/KEEP unit Base ID controls;
- explicit UNAVAILABLE state;
- updated timestamps;
- audited actor and action metadata.

A single Ally Code cannot be durably assigned to two different Discord users in the same Discord server.

Preferences and availability are cleared when a Discord member is relinked to a different Ally Code or unlinked, preventing stale controls from leaking to a different SWGOH identity.

## Still disabled

This identity/member-control layer does **not** enable:

- self-service account claiming/link creation;
- direct messages;
- public assignment publishing;
- automatic @mentions;
- Operation locks from Discord;
- automated officer actions;
- cross-guild linking.

## Next safe transport steps

1. Replace raw Base ID entry with a user-friendly verified unit search/autocomplete path while keeping Base IDs as the canonical stored key.
2. Persist immutable assignment-plan versions and explicit officer approval before any outbound publishing.
3. Add a rate-limited delivery queue and per-member delivery status before enabling DMs or proactive Discord posts.
4. Add officer-readable member-control summaries for fast pre-ROTE readiness review.
