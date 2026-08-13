# Gateway Enrichment — Next Safe Change

The current secure gateway should remain the only service that talks to Comlink and SWGOH Stats. Do not move Comlink keys into the browser.

## Immediate gateway changes

1. **Character and ship GP**
   - Prefer the sum of calculated per-unit GP from the SWGOH Stats result for `characterGalacticPower` and `shipGalacticPower`.
   - Set total GP to character GP + ship GP when all roster units normalized successfully.
   - Keep the upstream/reported total only as a diagnostic comparison.
   - The Phase 3 frontend already performs this reconciliation as a second safety check.

2. **Ship portraits**
   - The current gateway registers AE2 assets only when `type === CHARACTER_COMBAT_TYPE`.
   - Remove that type restriction so ships can use the same `thumbnailName` -> AE2 asset path.
   - Keep the frontend's static image fallback for resilience.

3. **Public-player summary from `/player`**
   Expose only fields that Comlink actually returns publicly:
   - `datacron.length`
   - `playerRating` / GAC skill rating, league, division
   - `pvpProfile` squad/fleet arena ranks
   - `profileStat` values
   - unlocked title/portrait counts
   - `seasonStatus` summary
   - equipped mod count from each roster unit's `equippedStatMod`
   - purchased special ability count from `purchasedAbilityId`

4. **6-dot mods**
   - Count equipped mods where the mod definition indicates 6+ pips.
   - Return `summary.sixDotMods`.

5. **Capability contract**
   Return a `capabilities` object that explicitly marks these as unavailable:
   - unequipped mods
   - materials
   - unequipped gear inventory
   - player currency balances

   Never return fake zero balances for unavailable account data.

## Ability upgrades

The Phase 3 frontend uses the static `skill.json` tier definitions plus the live roster skill tier to calculate applied Zeta, Omega and Omicron upgrades. This avoids depending on a single gateway counter and gives us a cross-check against live progression.

## Scale gate before tens of thousands of users

The gateway's current roster cache is process-local. Before horizontal scaling, add a shared cache (Redis/Valkey or equivalent) keyed by Ally Code with request coalescing. Recommended behavior:

- fresh TTL: 60–120 seconds
- stale-while-revalidate: 5–15 minutes
- only one upstream refresh per Ally Code at a time
- static game data never fetched per player request
- portraits cached at CDN/object-storage layer

This is the next infrastructure milestone after Phase 3 is deployed and verified against several known SWGOH.GG profiles.
