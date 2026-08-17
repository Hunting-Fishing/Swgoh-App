# Discord `/tb controls` Officer Drill-Down

`/tb activity` gives officers a compact Guild Activity summary that includes aggregate durable TB controls. `/tb controls` is the companion drill-down for inspecting the exact linked-member state behind those totals.

## Command

- `/tb controls` — show all durable linked members, AVAILABLE/UNAVAILABLE state, and active GIVE/KEEP unit overrides.
- `/tb controls member:<Discord member>` — scope the same read-only view to one linked member.

## Authorization and safety

The command is officer-only and uses the same signed Discord interaction authorization boundary as `/tb activity`: Manage Server / Administrator or a durably configured officer role.

Responses are ephemeral. Mention parsing is suppressed. The command does not change availability, preferences, assignments, locks, guild state, or DM delivery.

## Pilot acceptance

After the deployment is current and guild-scoped commands have been re-registered:

1. Run `/tb controls` as an authorized officer and confirm linked/unavailable/GIVE/KEEP totals match `/tb activity`.
2. Confirm individual linked members show the expected Ally Code and exact GIVE/KEEP Base IDs.
3. Run `/tb controls member:<linked member>` and confirm only that member appears.
4. Run `/tb controls` from a normal linked member account and confirm the request is denied as officer-only.
5. Confirm no Discord member receives a ping and no stored control state changes during these reads.
