# Gateway Enrichment — Current Safe Handoff

The secure gateway remains the only service that talks to Comlink and SWGOH Stats. Do not move Comlink keys into the browser.

## Completed / current behavior

1. **Authoritative player GP**
   - Comlink `/player` profile totals are authoritative for `galacticPower`, `characterGalacticPower`, and `shipGalacticPower` when present.
   - SWGOH Stats enriches per-unit statistics but must never replace valid Comlink account totals.
   - The frontend displays the Comlink profile totals first and keeps summed per-unit GP only as a diagnostic/fallback.
   - The recovery gateway preserves the complete raw Comlink roster when SWGOH Stats returns a partial calculated roster.

2. **Character and ship portraits**
   - Characters and ships may both register their `thumbnailName` / asset key with the AE2 proxy.
   - The frontend keeps the versioned static image as a fallback when the live AE2 image is unavailable.

3. **Current public-player enrichment**
   - datacron count
   - GAC skill rating when returned
   - squad arena rank when returned
   - fleet arena rank when returned
   - 6-dot equipped mod count when mod definitions can be resolved
   - live Zeta, Omega and Omicron progression merged with versioned static ability definitions

## Next gateway changes

1. **Capability contract**
   Return an explicit `capabilities` object. Account-private data that Comlink `/player` does not expose must be marked unavailable rather than represented as fake zero values:
   - unequipped mods
   - materials
   - unequipped gear inventory
   - player currency balances

   Also mark supported public-derived fields such as equipped mods, 6-dot mods, datacrons and competitive profile data.

2. **Additional public-player summary**
   Expose only fields actually present in the Comlink player payload:
   - equipped mod count from each roster unit's `equippedStatMod`
   - purchased special ability count from `purchasedAbilityId`
   - `profileStat` values
   - unlocked title count
   - unlocked portrait count
   - `seasonStatus` summary
   - GAC league/division when available

3. **Response provenance**
   Keep the existing `source: "live"` contract and add field-level provenance where useful so the UI can distinguish Comlink profile values, SWGOH Stats calculated values, static gamedata and AE2 artwork.

## Ability upgrades

The app uses versioned `skill` / recipe definitions plus each live roster skill tier to calculate applied Zeta, Omega and Omicron upgrades. Current CG `ability_mat_Omega`, `ability_mat_Zeta` and `ability_mat_Omicron` recipe ingredient IDs are recognized. Do not infer an applied upgrade from the ability name alone.

## Scale gate before tens of thousands of users

The gateway's current roster cache is process-local. Before horizontal scaling, add a shared cache (Redis/Valkey or equivalent) keyed by Ally Code with request coalescing. Recommended behavior:

- fresh TTL: 60–120 seconds
- stale-while-revalidate: 5–15 minutes
- only one upstream refresh per Ally Code at a time
- static game data never fetched per player request
- portraits cached at CDN/object-storage layer
- cache only public roster/profile responses; never expose service credentials to clients

This is the next infrastructure milestone after the live response contract is stable and verified against several known player profiles.
