# Discord Player Linking + Preference Safety Model

## Purpose

Discord player linking must never accept an arbitrary Ally Code and silently attach it to a Discord identity. Player preference writes must likewise never target an unlinked or unrelated SWGOH account.

The current production-safe pilot is guild-scoped and officer-mediated.

## Current implementation

The player-link path is implemented end-to-end for the pilot Discord application:

- `discord-player-link.mjs` verifies a claimed 9-digit Ally Code against the roster of the SWGOH guild durably bound to the Discord server;
- `discord-player-link-service.mjs` performs the verified transaction and writes through the durable Discord state store;
- `discord-state-store.mjs` enforces one Ally Code mapping per Discord user inside a server, rejects duplicate Ally Code claims by another Discord user, and records audited link/unlink mutations;
- `discord-linked-player-service.mjs` resolves an existing Discord user link back to the current bound guild roster for read-only member workflows;
- `discord-tb.mjs` exposes officer-authorized `/tb link`, `/tb unlink`, `/tb links`, `/tb preference`, and `/tb preferences` handlers;
- `scripts/register-discord-tb-commands.mjs` contains the guild-scoped Discord command definitions;
- focused tests cover durable-only operation, transaction routing, duplicate-safe state, unlinking, preference state, ownership validation, command routing, planner consumption, and fail-closed storage behavior.

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

Guild membership is **not cryptographic proof** that the selected Discord user personally owns the SWGOH account. The current link command therefore remains officer-mediated and must not be described as self-service account ownership verification.

The trust statement is:

> An authorized guild officer linked this Discord member to an Ally Code that was verified as belonging to the Discord server's bound SWGOH guild roster.

A later self-service link flow needs an additional ownership challenge or explicit officer approval mechanism before it can be described as verified account ownership.

## Slash commands

### `/tb link member:<user> ally_code:<code>`

Officer-only. Verifies guild membership first, then persists the Discord user ↔ SWGOH player mapping with an audit event.

### `/tb unlink member:<user>`

Officer-only. Removes an existing durable mapping through an audited transaction. Any stored unit donation preferences for that Discord user are cleared so they cannot survive onto a different future player link.

### `/tb links`

Officer-only. Lists durable mappings for the Discord server. Discord mentions are suppressed so the listing does not ping members.

### `/tb preference member:<user> unit:<base-id> preference:<give|default|keep>`

Officer-only in the current pilot.

For `GIVE` and `KEEP`, the service requires:

- durable guild setup;
- a durable Discord user ↔ SWGOH player link;
- the linked player to still be present in the bound guild roster;
- the linked player to currently own the selected Base ID.

Only after those checks does the durable state write occur.

`DEFAULT` removes the explicit override and is intentionally allowed to clear durable state without requiring the live gateway. This lets officers recover from a stale/unwanted preference even during an upstream outage.

### `/tb preferences member:<optional-user>`

Officer-only. Lists current durable GIVE/KEEP overrides for one linked member or the guild. Mentions are suppressed.

## Planner integration

Discord donation preferences now feed the same mission-safe ROTE planner used by `/tb assignments` and `/tb phase`.

The planner contract is:

- `GIVE`: favor this legal donor before normal safe donors;
- `DEFAULT`: no explicit donor override;
- `KEEP`: push this donor behind normal and mission-protected alternatives, using it only when safer legal owners are exhausted;
- mission protections and hard reserves remain independent safety constraints;
- forced KEEP/protection usage remains visible as HELP/risk rather than being hidden.

The Discord planning result reports how many persisted GIVE/KEEP controls were consumed.

## Authorization

The current mutation surface remains officer-gated:

- Manage Guild / Manage Server permission; or
- Administrator permission; or
- a durably configured officer role for non-bootstrap `/tb` commands.

`/tb setup` remains restricted to Manage Guild or Administrator even if a configured officer role exists.

Member self-service is the next authorization layer; it must allow a normal Discord member to mutate only the durable SWGOH player linked to their own Discord user ID.

## Persistence and safety guarantees

Shared Discord state requires confirmed durable storage. If the Railway Volume / confirmed durable state directory is unavailable, identity and preference mutations fail closed.

The state layer preserves:

- Discord guild ID;
- Discord user ID;
- normalized 9-digit Ally Code;
- SWGOH player ID when available;
- original `linkedAt` timestamp across safe relinks;
- GIVE/KEEP unit Base ID controls;
- updated timestamps;
- audited actor and action metadata.

A single Ally Code cannot be durably assigned to two different Discord users in the same Discord server.

Preferences are cleared when a Discord member is relinked to a different Ally Code or unlinked, preventing stale controls from leaking to a different SWGOH identity.

## Still disabled

This identity/preference layer does **not** enable:

- self-service account claiming;
- normal-member preference writes yet;
- direct messages;
- public assignment publishing;
- automatic @mentions;
- Operation locks from Discord;
- automated officer actions;
- cross-guild linking.

## Next safe transport steps

1. Use the linked-player read service to add a member-safe `/tb me`/link-status workflow.
2. Allow a normal member to set or clear preferences only for their own linked Discord user ID while retaining officer override capability.
3. Add durable availability/ignore state using the same identity and audit boundary.
4. Keep outbound assignment publishing and DMs as a separate rollout with immutable plan versions, explicit officer approval, a delivery queue, rate-limit handling, and per-member delivery status.
