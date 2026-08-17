# Discord ROTE Hard Reservations

Hard reservations are the officer-level **absolute donor exclusion** used by the live Discord ROTE planner.

They are deliberately different from GIVE/KEEP preferences and automatic mission-protection signals.

## Safety hierarchy

From strongest to weakest:

1. **Hard reservation** — absolute exclusion for one linked member + unit + ROTE phase. The planner must not donate that unit from that member in the selected phase until the reserve is cleared.
2. **Automatic mission protection** — derived from verified mission-entry coverage. A protected owner is ranked behind every unprotected eligible owner. If no alternative exists, the planner may surface the protected assignment only as HELP / mission-risk evidence.
3. **GIVE / DEFAULT / KEEP** — member donation preference. These order owners only inside the same mission-safety class; they never override a hard reservation and they never make a protected unit safer than an unprotected owner.

## Officer commands

```text
/tb reserve member:<Discord member> unit:<autocomplete> phase:P1 state:RESERVE
/tb reserve member:<Discord member> unit:<autocomplete> phase:P1 state:CLEAR
/tb reserves
/tb reserves member:<Discord member>
/tb reserves phase:P1
/tb reserves member:<Discord member> phase:P1
```

`/tb reserve` and `/tb reserves` are officer-only. Normal linked members cannot create or inspect officer hard-reserve state through these commands.

Responses remain ephemeral and mention parsing is suppressed.

## Setting a hard reserve

A RESERVE write succeeds only when all of the following are true:

- the Discord server has completed durable SWGOH Guild setup;
- the target Discord member has a durable Discord↔SWGOH player link;
- durable hard-reservation storage is available;
- the target linked player is still a current member of the bound live SWGOH Guild roster;
- the target linked player currently owns the selected unit.

The unit picker reuses the verified static SWGOH unit autocomplete path; the final write still verifies ownership against the bound Guild roster.

## Clearing a hard reserve

CLEAR intentionally does **not** require a live-gateway read. Officers must be able to remove stale safety state even during a temporary Comlink/gateway outage.

The target Discord↔SWGOH link must still exist so the command cannot clear arbitrary unbound member state accidentally.

## Persistence

Pilot hard reservations are stored atomically in the configured durable state directory:

```text
discord-hard-reservations-v1.json
```

On the current Railway pilot this uses the same confirmed durable state directory/volume family as the Discord setup/member-control state, but a separate companion file to avoid destabilizing the established identity/link schema.

Each SET/CLEAR mutation writes an audit event:

```text
rote-hard-reservation-set
rote-hard-reservation-cleared
```

## Live planner behavior

`/tb assignments` and `/tb phase` read the current durable reservation set before planning.

A stored reservation is accepted into the plan only when it still matches the current durable Discord↔SWGOH link. Stale/unlinked reservation records are ignored rather than silently being applied to a different player identity.

If hard-reservation storage is configured as durable but becomes unreadable, the live planner fails closed instead of producing an assignment plan that silently ignores officer safety controls.

## Pilot acceptance

Use a unit that has at least one alternate eligible donor so the exclusion can be observed without intentionally creating an unfilled slot.

1. Run `/tb reserves` and record the starting state.
2. Run `/tb assignments phase:P1` and record the current donor for the chosen unit/slot.
3. Run `/tb reserve member:<pilot member> unit:<owned unit> phase:P1 state:RESERVE`.
4. Confirm the bot reports **HARD RESERVED** and verified bound-Guild ownership.
5. Run `/tb reserves member:<pilot member> phase:P1`; confirm the exact unit appears.
6. Run `/tb assignments phase:P1`; confirm the reserved member/unit is absent from donor selection for that phase.
7. Confirm an alternate eligible donor is used when available; if no alternate exists, the slot must remain unfilled rather than violate the hard reserve.
8. Run `/tb reserve member:<pilot member> unit:<same unit> phase:P1 state:CLEAR`.
9. Run `/tb reserves member:<pilot member> phase:P1`; confirm the explicit reserve is gone.
10. Run `/tb assignments phase:P1`; confirm the member can become eligible again subject to automatic mission protection and GIVE/KEEP rules.

Leave no unintended test hard reservations active after acceptance.

## Publishing boundary

Hard reservations affect the **assignment draft only**. They do not publish assignments, post public messages or send member DMs.

`DISCORD_TB_DELIVERY_ENABLED=false` remains the pilot safety position until immutable plan-version approval and controlled delivery are implemented.
