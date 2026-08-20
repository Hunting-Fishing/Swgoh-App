# GAC Tactical Strategy Source Ingestion

Status: source-intake pipeline implemented; no quarantined candidate is runtime-visible.

## Objective

Convert public/approved SWGOH tactical sources into short, provenance-backed Attack Brief instructions without allowing research notes, stale tactics or unsourced inference to become production advice.

## Two catalogs

### Research staging

`public/data/gac-strategy-source-candidates.json`

This catalog may contain incomplete or quarantined research. It is not loaded by Attack Brief.

### Production runtime

`public/data/gac-strategy-records.json`

This is the only tactical catalog loaded by Attack Brief. Every row must satisfy the exact production strategy contract.

## Required review gates

A source candidate cannot promote until all flags are true:

- `sourceVerified`
- `exactCompositionVerified`
- `baseIdsVerified`
- `guidanceParaphraseVerified`
- `datacronScopeVerified`
- `versionValidityVerified`
- `copyrightParaphraseReviewed`

The review status must also be `approved`, every runtime strategy-record validation rule must pass, and the proposed production ID must not already exist.

A candidate that remains `pending`, `quarantined` or `rejected` cannot promote even when its proposed record happens to be structurally valid.

## Quarantine reasons

Typical blockers include:

- exact composition not proven
- source is leader-only rather than exact-team guidance
- Base IDs not verified against current game data
- source does not expose attacker/defender Datacron conditions
- source predates a rework, Omicron change or important Datacron rotation
- current game-version validity is uncertain
- guidance was copied rather than safely paraphrased
- source reference/date is missing

## Datacron review

Every proposed runtime record must explicitly declare attacker and defender Datacron presence:

- `any`
- `none`
- `assigned`

Research that does not establish this scope remains quarantined.

A historical guide that omits Datacrons must **not** be automatically interpreted as `none` or `any`.

## Audit and promotion

Run from the repository root:

```sh
node gac-strategy-source-audit.mjs
```

This is read-only. It reports:

- candidate counts by review status
- promotion-ready candidate count
- invalid approved candidates
- duplicate candidate IDs
- duplicate proposed production IDs
- duplicate IDs already present in production
- candidate top-level schema validity
- production catalog validation state
- per-candidate blockers

To write reviewed approved records into the production catalog:

```sh
node gac-strategy-source-audit.mjs --write
```

The write path fails closed when:

- candidate catalog schema is unsupported
- any approved candidate still has blockers
- any approved candidate fails the runtime strategy validator
- candidate IDs or proposed record IDs collide
- an approved candidate would duplicate an existing production ID
- the current production catalog itself contains rejected/invalid rows

Quarantined candidates are ignored by the write path.

## First staged research candidate

The initial research seed is an exact 3v3 Baylan Skoll / Shin Hati / Marrok defense versus Jedi Master Luke / Jedi Knight Luke / Hermit Yoda attack sequence from a public SWGOH GA3 counter guide.

It is intentionally `quarantined` because its current Datacron scope, current-version validity and Base-ID review are not yet all approved. It therefore cannot alter Attack Brief or become live tactical advice.

This is the expected workflow: useful research can be captured immediately without weakening the production truth boundary.

## Traceability

This work is tracked as **B02** in GitHub issue #236. Promotion of actual live tactical guidance starts in B03/B04 and must reference the reviewed source candidate plus the resulting production strategy-record ID.
