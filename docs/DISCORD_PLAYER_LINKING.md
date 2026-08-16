# Discord Player Linking Safety Model

## Purpose

Discord player linking must never accept an arbitrary Ally Code and silently attach it to a Discord identity. The first production-safe rollout is officer-mediated and guild-scoped.

## Current foundation

`discord-player-link.mjs` verifies that a claimed 9-digit Ally Code is present in the live roster of the SWGOH guild bound to the Discord server.

The verifier:

- resolves the durable Discord server → SWGOH guild binding first;
- uses the pilot Ally Code only when durable state is not active or no durable binding exists yet;
- reads the live guild roster through the shared guild roster service;
- requires the claimed Ally Code to be present in that bound guild;
- returns matched player/guild evidence for a future officer-approved link command;
- fails closed if enabled durable state cannot be read.

## Important ownership boundary

Guild membership is not cryptographic proof that the Discord user personally owns the SWGOH account. Therefore the bot must not label this check as self-service ownership verification.

Initial rollout should use an officer-authorized command that binds a Discord member to an Ally Code only after the live guild-membership check succeeds. A later self-service flow needs an additional ownership challenge or approval mechanism before it can be described as verified ownership.

## Not enabled yet

This foundation does not expose a slash command and does not write player links. It does not enable:

- self-service account claiming;
- DMs;
- assignment publishing;
- Operation locks;
- automated officer actions;
- cross-guild linking.

## Next transport step

Add an officer-only `/tb link` command with a Discord user option plus Ally Code option. The handler should call the guild-claim verifier first, reject claims outside the bound guild, then persist through the durable Discord state store with an audit event. Duplicate Ally Code protection and explicit unlink/reassignment controls should be added before broad rollout.
