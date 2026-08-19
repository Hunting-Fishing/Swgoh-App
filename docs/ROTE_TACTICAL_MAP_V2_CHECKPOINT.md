# SWGOH Command Center — ROTE Tactical Map v2 Checkpoint

Updated: 2026-08-19 (GMT+8)
Branch: `feature/rote-tactical-map-v2`
Draft PR: #184

## Product decision locked

ROTE Tactical Map v2 treats **official mission entry legality** and **battle readiness** as different evidence layers.

Battle readiness must be able to account for:

- character Level;
- stars;
- Gear;
- Relic;
- ability tiers;
- required/high-priority Zetas;
- Omicrons only when active for the current TB mission type;
- mods and sourced combat-stat targets;
- team composition;
- mission mechanics and enemy interactions;
- Operations / Strategic Ability state where authoritative;
- observed Guild/player mission results.

Unknown evidence stays `UNKNOWN`. It must never become a fake zero, failure or pass.

## Implemented on this branch

### T1 — Readiness Contract v2

Added:

- `public/tb-mission-readiness-v2.js`
- `public/tb-mission-readiness-policy-v2.js`
- focused regression tests

Current evidence tracks:

- Level
- stars
- Gear
- Relic
- abilities
- Zetas
- mission-active TB Omicrons
- Speed
- Health
- Protection
- Offense / physical / special damage
- Potency
- Tenacity
- Critical Chance / Damage
- Defense / Armor / Resistance
- Accuracy / Critical Avoidance

Explicit tactical verdicts include:

- `BLOCKED — ENTRY`
- `NEEDS TEAM COMPOSITION`
- `NEEDS LEVEL`
- `NEEDS GEAR / RELICS`
- `NEEDS ABILITIES`
- `NEEDS ZETA`
- `NEEDS TB OMICRON`
- `NEEDS MODS`
- `NEEDS STATS`
- `ENTRY READY / BATTLE DATA UNKNOWN`
- `MINIMUM READY`
- `SAFER TARGET READY`

A higher community/safe target cannot turn an otherwise legal official mission entry into a false `BLOCKED — ENTRY` result.

### T2 — Canonical tactical mission-node model

Added `public/rote-tactical-node-model.js`.

It derives tactical nodes from the existing pinned mission-map coordinates and canonical mission records. It does not introduce a second coordinate source.

Regression anchors include:

- P2 Felucia Hondo at the existing Hondo node;
- P2 Bracca Zeffo unlock: Cere mandatory + Cal / JKCK alternatives under the shared 7-star / R7 gate;
- P3 Tatooine Reva shard mission: Grand Inquisitor required while Third Sister remains the reward, not a fabricated required unit;
- P3 Tatooine Jabba at the existing Jabba node;
- P2/P3 infrastructure nodes cannot fabricate character portraits.

### T3 — Tactical asset resolver

Added `public/rote-tactical-asset-model.js`.

Rules:

- required/alternative unit portraits resolve from the existing Command Center catalog/asset pipeline;
- mission icons reuse the existing TB visual asset registry;
- missing artwork is explicit;
- initials may be a UI fallback but are never labeled as game art;
- no generated/fabricated portrait is substituted for missing authoritative artwork.

### T4 — Tactical mission-node renderer prototype

Added:

- `public/rote-tactical-node-renderer.js`
- `public/rote-tactical-node-v2.css`

The renderer enhances existing `data-rote-zoom-node` buttons rather than rewriting map geometry/click behavior.

Prototype node content:

- mission icon;
- mission name;
- official gate text;
- `REQ` required portraits;
- `OR` legal alternative portraits;
- readiness badge;
- reward context.

This renderer is deliberately **not activated in `index.html` yet** because the branch is behind concurrently-changing `main`. Activation will happen after branch synchronization so newer GAC/front-end imports cannot be overwritten.

### T5 — Tactical readiness inspector foundation

Added:

- `public/rote-tactical-readiness-ui.js`
- `public/rote-tactical-readiness-v2.css`
- `public/rote-tactical-mission-intelligence.js`

The inspector can expose:

- official `ENTRY LEGAL` / `ENTRY BLOCKED` independently;
- per-unit Level / stars / Gear / Relic;
- ability evidence;
- Zeta evidence;
- TB-active Omicron evidence;
- mod/stat evidence;
- unknown-evidence count;
- mechanic coverage / enemies / battle strategy from the existing combat-intelligence engine;
- evidence provenance.

Evidence classes remain separate:

- `GAME DATA / VERIFIED`
- `COMMUNITY REFERENCE`
- `GUILD EVIDENCE`
- `PLAYER EVIDENCE`

### T7/T8 foundation — mission attempt evidence + observed completion

Added `public/tb-mission-attempt-evidence.js` as a pure model before database persistence.

Attempt snapshots can retain:

- mission / event / phase / planet / player identity;
- normalized squad signature with leader identity;
- Level / stars / Gear / Relic per unit;
- specific ability tier evidence;
- installed Zeta state when known;
- installed Omicron + activation mode when known;
- combat-stat snapshot;
- Strategic Ability state;
- Operation state;
- waves/result;
- source / reported timestamp.

Analytics currently support:

- complete / partial / failed / skipped / unknown;
- observed completion by mission;
- observed completion by normalized squad signature;
- skipped/unknown records excluded from result denominator;
- raw counts only below minimum sample;
- low-sample warning before adequate sample;
- `predictiveProbability` intentionally remains `null`.

The system may display **Observed completion rate**, not a predicted win probability.

## Test status

Regression files have been added for every implemented slice above.

GitHub Actions currently fails before executing any step. Current runs show jobs with `steps: null` and no log artifact. Therefore:

- do not claim these tests passed in GitHub CI;
- do not treat the workflow conclusion as a code-test failure;
- rerun/verify after Actions infrastructure is repaired.

## Safety / integration state

- No Stage 9 immutable assignment code changed.
- No Discord publication/delivery code changed.
- No production Supabase migration for mission attempts has been applied.
- No shared `index.html` or existing planet-workspace module has been modified on this branch yet.
- Current work is additive and isolated behind draft PR #184.

## Next build slices

### N1 — synchronize branch to current `main`

Do this before editing shared UI entrypoints.

### N2 — activate Tactical Map v2 prototype

After sync:

- load `rote-tactical-node-v2.css`;
- load tactical node enhancer after the existing planet zoom workspace;
- build each selected planet's tactical model from existing canonical map data;
- pass the current roster/catalog when available;
- preserve existing node click/selection behavior.

### N3 — wire readiness inspector into selected mission

Add the tactical readiness panel beside/inside the existing mission detail rather than replacing the current battle-prep and legal-roster panels.

### N4 — Guild readiness matrix per node

For each mission compute independently:

- official entry-ready members;
- minimum-ready members;
- safer-target-ready members;
- blocked members;
- unknown-evidence members;
- outstanding members once active event state is available.

### N5 — durable mission-attempt persistence

After branch sync and schema review, create one canonical attempt store and service. Do not apply a production migration from the unsynchronized feature branch.

### N6 — observed-results UI

Show:

- recorded attempts;
- 2/2 / partial / fail distribution;
- sample label;
- squad variants;
- Guild vs personal evidence.

### N7 — stat/ability segmentation

Only when sample sizes justify it, compare outcomes by:

- squad variant;
- relic band;
- exact required Zeta state;
- active TB Omicron state;
- Speed band;
- other sourced key-stat bands;
- Operations / Strategic Ability state.

No automatic causal claim should be made from a correlation.

## Acceptance reminder

Tactical Map v2 is not accepted until required portraits such as Hondo, Cere/Cal/JKCK, Grand Inquisitor/Reva-shard context, Jabba, Young Han and other mandatory missions are visibly located at their canonical mission nodes and their readiness cards distinguish official entry legality from Level/ability/Zeta/Omicron/mod preparation.
