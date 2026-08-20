# GAC Tactical Strategy Records

Status: v1 contract implemented; production catalog intentionally empty until sourced ingestion.

## Purpose

The tactical strategy catalog is the only path that may unlock opening moves, target priorities, kill-order guidance, matchup mechanics or explicit avoid/do-not-do instructions in **Attack Brief**.

Statistical counter history, roster deltas, ability readiness and Datacron eligibility are not sufficient to invent execution instructions.

## Storage and scale

Production records are versioned in:

`public/data/gac-strategy-records.json`

The browser loads the static catalog once, validates every row, caches the accepted records and performs exact matching locally. This makes tactical guidance CDN/static-host friendly and avoids a database or upstream request for every opened GAC defense.

Malformed records are rejected, not partially trusted.

## Required v1 fields

Every record requires:

- `schemaVersion: 1`
- stable `id`
- `status: active|disabled`
- `format: 3v3|5v5|fleet`
- exact defender leader and exact defender member composition
- exact attacker leader and exact attacker member composition
- explicit attacker Datacron `presence`
- explicit defender Datacron `presence`
- at least one structured guidance item
- source name
- source reference
- source type
- source update/publication date
- catalog capture date

Optional validity metadata:

- `validFrom`
- `validUntil`
- `gameDataVersion`
- notes

## Datacron presence contract

Every attacker and defender Datacron constraint must explicitly declare one of:

- `presence: "any"` — the source explicitly supports the tactic regardless of whether a Datacron is assigned.
- `presence: "none"` — the tactic may be used only when the current board is **verified as having no assigned Datacron**.
- `presence: "assigned"` — the tactic requires a verified assigned Datacron.

Optional assigned-Datacron constraints can additionally require:

- one of a set of Datacron set IDs
- specific resolved mechanic/ability IDs

`presence: "none"` cannot also require a set or mechanic.

`presence: "assigned"` fails when the assigned state is unknown. Set/mechanic-specific tactics additionally fail unless those details resolve and match.

`presence: "any"` is a strong source claim. With no set/mechanic rule it can match an unknown current Datacron state because the source explicitly says Datacron presence does not change the tactic. If a set/mechanic rule is present, assigned evidence must resolve.

### Current-board truth state

Verified board persistence exposes three states:

- `unknown` — the user did not confirm whether a Datacron is assigned.
- `none` — the user explicitly confirmed in-game that no Datacron is assigned.
- `assigned` — an exact current live Datacron ID was selected and revalidated.

Old saved boards with neither an assigned Datacron snapshot nor truth metadata remain `unknown`. They are **not** upgraded to `none`.

This distinction is required so an older no-Datacron-era guide cannot silently unlock against a current Datacron-modified defense.

## Exact-match rule

v1 execution guidance is exact-composition only.

A record for:

`DEF_LEAD + DEF_2 + DEF_3`

cannot unlock against:

`DEF_LEAD + OTHER_2 + DEF_3`

merely because the leader is the same.

The same rule applies to the attacker squad.

Member order is ignored; membership is not.

## Guidance fields

Each guidance section is a list of short paraphrased steps:

- `opening`
- `targets`
- `mechanics`
- `avoid`

Each step supports:

```json
{
  "text": "Short paraphrased tactical instruction.",
  "note": "Optional scope or caveat."
}
```

Do not paste long source transcripts, articles, guide text or video captions into the catalog. Store concise paraphrased tactical facts and retain the source reference for audit.

## Provenance policy

Allowed source types:

- `video`
- `article`
- `tool`
- `community`
- `first-party`
- `curated`

Preferred SWGOH source families for the ingestion stage include SWGOH.GG, SWGOH4Life, Genskaar, BitDynasty, AhnaldT101, Scrybe/Scribe and other approved strategy references where the exact tactical claim can be verified.

A source name without a source reference is invalid. A source reference without a source date is invalid. A record without a catalog capture date is invalid.

## Recency and invalidation

Game updates, character reworks, Omicron changes, Datacron rotations and bug fixes can invalidate tactics.

During ingestion/review:

1. Record the source update/publication date.
2. Record explicit attacker/defender Datacron presence scope.
3. Add `validFrom` when the tactic is tied to a known release/Datacron era.
4. Add `validUntil` when a tactic is known to expire.
5. Record `gameDataVersion` when available.
6. Disable or expire the old row instead of silently rewriting its provenance.
7. If multiple exact valid rows exist, the newest sourced row wins deterministically.

## Runtime truth boundary

Attack Brief behavior is:

```text
Exact current defense
+ exact selected attacker composition
+ record is active
+ record is inside validity window
+ attacker Datacron presence/rules match
+ defender Datacron presence/rules match
+ source provenance validates
+ guidance content validates
= sourced execution guidance may be shown
```

Otherwise:

`NO SOURCED EXECUTION SEQUENCE`

The Command Center continues to show its evidence-derived Known Risks and pre-battle checklist, but it does not generate opening ability, target priority, kill order or turn sequence.

## Example shape (fixture only, not production advice)

```json
{
  "schemaVersion": 1,
  "id": "strategy:fixture:3v3",
  "status": "active",
  "format": "3v3",
  "defender": {
    "leaderBaseId": "DEF_LEAD",
    "members": ["DEF_LEAD", "DEF_2", "DEF_3"]
  },
  "attacker": {
    "leaderBaseId": "ATT_LEAD",
    "members": ["ATT_LEAD", "ATT_2", "ATT_3"]
  },
  "attackerDatacron": {
    "presence": "any",
    "required": false,
    "setIds": [],
    "mechanicIds": []
  },
  "defenderDatacron": {
    "presence": "none",
    "required": false,
    "setIds": [],
    "mechanicIds": []
  },
  "guidance": {
    "opening": [{"text": "Paraphrased sourced opener."}],
    "targets": [],
    "mechanics": [],
    "avoid": []
  },
  "provenance": {
    "sourceName": "Example source",
    "sourceRef": "source-record-or-url",
    "sourceType": "curated",
    "sourceUpdatedAt": "2026-08-20T00:00:00Z",
    "capturedAt": "2026-08-20T00:00:00Z"
  },
  "validity": {
    "validFrom": "2026-08-20T00:00:00Z",
    "validUntil": "",
    "gameDataVersion": "",
    "notes": ""
  }
}
```

The example uses fictional Base IDs and is schema documentation only.
