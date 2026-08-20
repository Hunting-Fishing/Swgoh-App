# GAC Command Center — Completion Build Plan

Last updated: 2026-08-20

## Objective

Complete the GAC product as an evidence-first battle co-pilot without crossing the SWGOH data boundary. Current hidden defenses, private inventory, turn order, target priority, kill order, win probability and post-failure TM/Health must never be fabricated when no authoritative or provenance-backed source exists.

## Production baseline

The production foundation already includes:

- current GAC event and round context
- exact current opponent only when authoritative
- live current player/opponent rosters
- verified manual current-board fallback when the upstream game source hides defenses
- historical scouting and defense recurrence forecasting
- 3v3/5v5-separated counter evidence
- evidence-first whole-board allocation with roster-fit fallback
- own-defense/current-attack resource protection
- Relic/Zeta/Omicron/fastest-speed/ability-readiness deltas
- Datacron inventory/eligibility evidence
- attack lock, attempt tracking, Win/Loss/Banners and verified-result persistence
- Why This Counter? provenance and recovery-safe alternates
- live matchup truth dashboard

## Completion stages

### GAC 11 — Correctness and dependency hardening

**11.1 Primary historical provenance gate — current slice**

- `Why This Counter?` may label the selected primary as exact historical evidence only when the exact composition also passes the same `evidenceReliability(...).automatic` gate used by the authoritative evidence allocator.
- Hold-heavy/non-actionable exact observations remain supporting history, not the claimed primary source.

**11.2 Matchup delta module extraction — next maintenance slice**

- Move shared `matchupDelta`, signed-format and roster metric helpers into a pure model.
- Make War Room deltas, inspector and Attack Brief import the pure model.
- Remove the inspector ↔ matchup-deltas ESM cycle.

**11.3 Lazy inspector detail computation**

- Keep shell rendering immediate.
- Resolve alternates/details only when the user opens the drawer.
- Preserve current read-only behavior.

Definition of done: no circular dependency, no primary-source overclaim, no authoritative planner rewrite.

### GAC 12 — Attack Brief / Battle Execution foundation

**12.1 Known Risks + source-gated execution shell — current slice**

For each authoritative current-board recommendation, expose:

- exact selected attacker squad
- recommendation source
- observed historical sample when actionable
- Relic/Zeta/Omicron/Fastest/Ability deltas
- selected owned Datacron and resolved ability-target coverage
- evidence-derived risk flags
- before-battle truth checklist
- explicit source-gated execution section
- recovery handoff to `Why This Counter?`

The brief is lazy-loaded only when opened and is read-only.

**12.2 Tactical strategy record contract**

Create a durable/versioned record keyed by:

- GAC format
- exact defender composition
- exact attacker composition or attacker leader/team variant
- Datacron set/mechanic applicability where required
- source name
- source reference
- source publication/update date
- game-data/version validity window

Structured guidance fields:

- opening sequence
- target priority
- kill order
- critical mechanics
- avoid/do-not-do warnings
- timeout/revive/instant-kill/TM-train notes
- source confidence/coverage metadata

No tactical field becomes user-visible without provenance.

**12.3 Tactical source ingestion**

Prioritize supported/public sources and curated strategy material, including SWGOH.GG, SWGOH4Life, Genskaar, BitDynasty, AhnaldT101, Scrybe/Scribe and other approved SWGOH strategy references where the exact claim can be sourced.

**12.4 Exact execution display**

Only after 12.2/12.3:

- show sourced opener
- show sourced target/kill priority
- show critical mechanics
- attach source/date/version directly to the brief
- clearly separate sourced guidance from local roster-risk inference

Definition of done: an opened Attack Brief can explain both **why this squad** and, when evidence exists, **how to execute it**, without generating unsourced tactics.

### GAC 13 — Failure and cleanup intelligence

- fast first-attempt failure capture
- surviving enemy units
- dead enemy units
- user-observed approximate Health/Protection
- preloaded TM known/unknown
- important cooldown/status notes
- recalculate recovery counters against the remaining state
- never infer carryover state when not supplied
- persist verified cleanup results separately from fresh-defense results

Definition of done: a failed first attack can produce a truth-bounded cleanup plan without pretending the app can see hidden post-battle state.

### GAC 14 — Fleet War Room

Build the fleet equivalent of the character War Room:

- capital ship
- starting lineup
- reinforcement pool/tendency evidence
- current crew/relic strength
- historical fleet counters
- scarce capital-ship allocation
- own-defense fleet reservations
- Datacron exclusion by mode
- fleet Attack Brief and sourced execution guidance
- fleet failure/cleanup workflow

Definition of done: 5v5/3v3 ground and fleet boards share one whole-round resource model.

### GAC 15 — Datacron mechanic-aware tactics

Extend beyond eligibility/coverage:

- versioned Datacron set/affix mechanics
- exact mechanic descriptions
- opponent threat flags
- counter-specific interaction evidence
- selected Datacron adjustment guidance
- no arbitrary power multiplier

Definition of done: Datacrons influence recommendations only through explainable eligibility/mechanic/evidence rules.

### GAC 16 — Multi-source counter evidence warehouse

Normalize evidence from:

- imported public GAC history
- verified Command Center battle results
- guild/user historical results
- additional licensed/public counter sources where permitted

Partition evidence by:

- 3v3 / 5v5 / fleet
- exact compositions
- Datacron era/set where known
- game-version/date window
- sample size and source provenance

Definition of done: observed rates remain source-separated and reproducible; no source row is silently converted into predicted probability.

### GAC 17 — Production acceptance suite

Run end-to-end acceptance for:

- 5v5 ground
- 3v3 ground
- fleet
- hidden-board/manual fallback
- no-history fallback
- no-Datacron/unknown-Datacron cases
- failed attack and cleanup
- full round resource non-overlap
- result persistence and evidence feedback

Required invariants:

- Unknown != 0
- Missing != false
- Hidden board != empty board
- No historical sample != 0% win rate
- Historical observed rate != predicted win probability
- Unsourced tactic != instruction

### INFRA 18 — Scale gate

Before broad public scale:

- Redis/Valkey shared player/GAC cache
- per-Ally-Code request coalescing
- stale-while-revalidate
- upstream rate limits/backoff
- queued/deduplicated history imports
- DB indexes for GAC history/counter queries
- CDN/object storage for artwork
- source-health telemetry
- error/latency telemetry
- load tests and capacity thresholds

Definition of done: multiple app instances can serve large concurrent traffic without multiplying Comlink/upstream calls per user.

### PRODUCT 19 — UX and release hardening

- mobile GAC board UX
- compact attack-mode view
- accessible status/risk labels
- source/provenance drawer
- notification hooks where useful
- onboarding for verified manual board capture
- acceptance checklist in production runbook

## After GAC completion

Next all-in-one Command Center expansion order:

1. Territory War defense/offense/scouting/counters
2. Raid roster/teams/readiness/history
3. Cross-Mode Farm Value across TB/Raid/TW/GAC/Fleet
4. Guild farm campaigns/commitments and publication adapters

## Release policy

Every GAC production merge must satisfy:

1. branch created from current green `main`
2. authoritative planner protected from unrelated rewrites
3. feature/main compare reviewed for expected file scope and zero unexpected divergence
4. focused tests/syntax checks pass where executable
5. GitHub Actions failure is classified as code failure only when steps actually execute and fail
6. Railway service statuses are the final deployment gate
