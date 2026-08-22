# SWGOH Command Center — ROTE Tactical Map v2 Build Plan

Updated: 2026-08-19 (GMT+8)
Branch: `feature/rote-tactical-map-v2`

## Objective

Turn `/guild/tb/map` into the authoritative visual ROTE battle-intelligence surface. Every mission must live at its real map position and explain:

1. what mission is here;
2. which characters/factions/ships are actually required;
3. what the mission mechanics and enemy encounters are;
4. which squads are recommended and why;
5. whether the current player is legally eligible to enter;
6. whether that specific squad is actually prepared to attempt the mission;
7. what the Guild and player have historically achieved with comparable squads/stats.

The map must reuse the existing canonical ROTE mission dataset, mission legality, combat preparation, kit intelligence, roster, Operations, farming and Discord systems. It must not create a competing planner.

---

# 1. Non-negotiable readiness model

`ENTRY LEGAL` and `BATTLE READY` are separate states.

A player can pass the game entry gate while still having an unsafe battle attempt because of missing ability levels, Zetas, active TB Omicrons, weak mods or weak combat stats.

## Layer A — ownership / official mission entry gate

Evaluate only evidence-backed game requirements:

- character/ship ownership;
- character level;
- stars;
- gear level;
- relic level;
- required unit IDs;
- required faction/category;
- required alignment;
- squad size;
- mandatory characters;
- mandatory ships;
- power requirement where authoritative;
- any special mission-specific entry restriction.

Output examples:

- `ENTRY LEGAL`
- `ENTRY BLOCKED — MISSING HONDO`
- `ENTRY BLOCKED — CERE R6 / R7 REQUIRED`
- `ENTRY BLOCKED — LEVEL 84 / 85 REQUIRED`

## Layer B — ability progression

For the selected recommended team evaluate, when evidence exists:

- basic/special/unique/leader ability tier;
- Omega requirements;
- required/high-priority Zetas;
- required/helpful TB-active Omicrons;
- mission-specific ability prerequisites;
- whether an Omicron is active in this mission type (Combat / Special / all TB), not merely installed somewhere on the unit.

A missing optional recommendation must not be converted into an official entry failure.

## Layer C — mods and combat stats

Evaluate source-backed minimum and safer targets independently per unit. Supported stat families should include at minimum:

- Speed;
- Health;
- Protection;
- Offense / Physical Damage / Special Damage where available;
- Potency;
- Tenacity;
- Critical Chance;
- Critical Damage;
- Defense / Armor / Resistance where available;
- Accuracy / Critical Avoidance where a strategy explicitly depends on them.

The system must support per-character targets, not just one team-wide speed threshold.

## Layer D — team composition and mechanics

Evaluate:

- exact recommended squad fit;
- verified mandatory members;
- legal substitutes;
- team interaction coverage;
- enemy/mechanic counters;
- mission-specific mechanics;
- Operation/Strategic Ability state where relevant;
- execution strategy evidence.

## Layer E — readiness verdict

Use explicit states instead of one opaque score:

- `BLOCKED — ENTRY`
- `ENTRY READY / BATTLE DATA UNKNOWN`
- `NEEDS ABILITIES`
- `NEEDS ZETA`
- `NEEDS TB OMICRON`
- `NEEDS MODS`
- `NEEDS STATS`
- `MINIMUM READY`
- `SAFER TARGET READY`
- `GUILD-PROVEN READY` (only after adequate recorded Guild evidence)

Readiness may expose component percentages for UI progress, but a universal percentage must never hide a hard blocker.

## Unknown evidence rule

Unknown evidence is `UNKNOWN`, not `0`, not `FAILED`, and not `READY`.

Examples:

- Mod detail unavailable => `MOD EVIDENCE UNKNOWN`.
- Ability ownership unavailable => `ABILITY EVIDENCE UNKNOWN`.
- No researched mission strategy => `NO VERIFIED STRATEGY YET`.
- No Guild attempts => `NO GUILD EVIDENCE YET`.

---

# 2. Evidence classes

Every tactical claim must retain provenance.

## GAME DATA / VERIFIED

Use for:

- mission location;
- phase/planet;
- entry requirements;
- mandatory units;
- faction restrictions;
- strategic abilities;
- unit/ability definitions;
- game-mode activation of Omicrons.

Primary internal authority: versioned game data and canonical mission records. External current references are validation sources, not a replacement for canonical storage.

## COMMUNITY REFERENCE

Use for:

- recommended squads;
- mod targets;
- kill order;
- battle execution notes;
- safer relic targets.

Sources may include GenSkaar, SWGOH.GG reference pages, SWGOH4Life, EchoBase, BitDynasty, Ahnald, Scribe and other tracked sources.

Community guidance must remain visibly separate from official legality.

## GUILD EVIDENCE

Use only for recorded Command Center attempts:

- attempts;
- 2/2, 1/2, 0/2 / success/fail;
- team composition;
- ability/Zeta/Omicron state where known;
- relics/gear;
- mod/stat snapshot where known;
- strategic ability / Operation state where known;
- event/phase/date.

## PLAYER EVIDENCE

Same model as Guild evidence, filtered to the current player.

---

# 3. Canonical tactical mission-node dataset

Extend mission records with map/tactical presentation metadata instead of storing character names as generic planet labels.

Each node should be able to represent:

```text
missionId
planetId
phase
nodeX
nodeY
nodeLayer
missionType
alignment
requiredCharacters[]
requiredShips[]
requiredCategories[]
entryRequirements
rewardBadges[]
enemyEncounterId
mechanics[]
operationLinks[]
strategicAbilityLinks[]
recommendedTeamIds[]
assetRefs
sourceRefs
```

Required character portraits must appear physically on the correct mission node. Priority anchors include Hondo, Jabba, Young Han Solo, Cere Junda / Cal Kestis / Jedi Knight Cal Kestis, Grand Inquisitor / Reva shard mission, Third Sister, Doctor Aphra, Merrin, Bo-Katan (Mand'alor), DTMG and other mandatory-unit missions already represented in the canonical ROTE dataset.

---

# 4. Map mechanics and assets

## Map geometry

- Replace generic planet-only mission labels with positioned mission nodes.
- Preserve planet coordinates and add mission-local coordinates.
- Support normal phases plus Zeffo and Mandalore bonus zones.
- Connect unlock routes visually (for example Bracca -> Zeffo).
- Support Operation / Strategic Ability influence links.

## Asset hierarchy

Prefer:

1. existing extracted/versioned game assets already shipped by Command Center;
2. AE2-backed game artwork where available;
3. versioned static fallback assets;
4. explicit placeholder only when no authoritative asset exists.

Never fabricate a character portrait or imply a placeholder is game art.

Node assets should support:

- planet art;
- character/ship portraits;
- mission type icon;
- enemy/boss portrait;
- reward icon;
- strategic ability icon;
- relic/gear badge;
- alignment badge;
- readiness state.

---

# 5. Mission inspector

Selecting a map node opens a single tactical inspector with these sections:

## Mission identity

- planet / phase / mission name;
- mission type;
- reward;
- official entry requirements;
- required characters/factions/ships with portraits.

## Your entry state

For every required/recommended member show:

- Level;
- stars;
- Gear / Relic;
- GP where useful;
- ability completion;
- Zeta state;
- active TB Omicron state;
- mod/stat evidence;
- exact gaps.

## Battle preparation

Reuse `tb-combat-intelligence.js` and the existing mechanic/interaction/strategy engines:

- mechanics covered/missing;
- enemy kit intelligence;
- Zetas;
- active TB Omicrons;
- abilities;
- mod targets;
- safer investment target;
- execution notes.

## Guild intelligence

- Guild members entry-ready;
- Guild members minimum-ready;
- attempts recorded;
- members still outstanding;
- observed result distribution;
- top evidence-backed team variants.

---

# 6. Mission attempt evidence and observed completion

Persist mission attempts as first-class evidence.

Minimum attempt payload:

```text
guildId
eventId
phase
planetId
missionId
playerId / allyCode
team[]
result
wavesCompleted
wavesTotal
rosterFingerprint
teamProgressionSnapshot
modStatSnapshot
strategicAbilitySnapshot
operationStateSnapshot
source
reportedAt
```

Results must support the mission's actual scoring shape while retaining a normalized success field for aggregation.

Initial UI wording:

- `Observed completion rate`
- `Guild recorded attempts`
- `Personal recorded attempts`

Do not label an observed ratio as a predicted win probability.

---

# 7. Win-ratio / performance analytics

## Phase 1 analytics

For each mission + normalized squad signature:

- attempts;
- complete successes;
- partial successes;
- failures;
- observed completion rate;
- sample size;
- last observed date.

## Phase 2 analytics

Segment by meaningful features when sample size permits:

- leader;
- fifth-slot variation;
- relic bands;
- required Zeta installed/not installed;
- TB Omicron installed/not installed;
- Speed bands;
- key stat bands;
- strategic ability/Operation state.

## Sample-size policy

- very small samples: show raw attempts only;
- moderate samples: show observed rate with a low-sample warning;
- adequate samples: allow comparison/breakpoint analysis;
- predictive probability is a future separate model and must include calibration/uncertainty if ever introduced.

---

# 8. Build sequence

## T1 — Readiness Contract v2

Create a pure readiness evaluator that exposes separate evidence tracks for:

- ownership;
- Level;
- stars;
- Gear;
- Relic;
- abilities;
- Zetas;
- TB-active Omicrons;
- mods/stats;
- team composition;
- strategy evidence.

It must reuse current mission legality and combat-intelligence semantics and preserve `UNKNOWN` evidence.

## T2 — Canonical mission-node coordinates

Add mission-level coordinates/asset references for the existing ROTE mission records. Do one phase at a time, beginning with P2/P3 because they contain high-recognition anchors: Hondo, Cere/Cal/Zeffo unlock, Jabba and Reva.

## T3 — Proper mission assets

Resolve required-unit portraits, mission icons, enemy/boss assets and reward/ability icons through the existing asset pipeline. Add deterministic fallback handling.

## T4 — Tactical map node renderer

Render positioned mission nodes, required portraits and readiness state directly on the map. Planet cards become containers for real mission nodes rather than free-text mission labels.

## T5 — Mission inspector integration

Merge the existing battle-prep, strategy, enemy-kit and interaction evidence into the selected node inspector.

## T6 — Guild readiness matrix on each node

Compute entry-ready / minimum-ready / blocked Guild counts and expose officer drill-down.

## T7 — Attempt evidence foundation

Add durable attempt tables/service/API and member/officer result reporting.

## T8 — Observed Guild statistics

Aggregate results by mission and normalized squad signature with sample-size labels.

## T9 — Stat breakpoint analytics

Add evidence-backed segmentation by progression, Zeta/Omicron and mod/stat bands only after enough Guild evidence exists.

## T10 — Operations/Strategic Ability influence graph

Visually connect Operation completion to the missions/bonuses it affects and incorporate the known state into battle preparation where authoritative.

---

# 9. Acceptance gates

The Tactical Map v2 is not accepted until:

1. official entry legality remains unchanged by community recommendations;
2. Level, stars, Gear/Relic are independently visible;
3. ability evidence distinguishes unknown from incomplete;
4. Zeta evidence distinguishes installed, missing and unknown;
5. Omicron evidence verifies that the Omicron is active for the current mission type;
6. mod/stat evidence distinguishes unknown from below target;
7. Hondo/Cere-Cal/Reva/Jabba/Young Han and other mandatory missions render required portraits on their actual mission nodes;
8. every map tactical claim has an evidence class/source;
9. no observed Guild ratio is presented as a predicted win probability;
10. mobile and desktop map interactions remain usable;
11. existing Stage 9 immutable assignment planning is unaffected;
12. existing ROTE mission legality tests continue to pass.

---

# 10. Immediate implementation slice

Start with **T1 Readiness Contract v2** as an additive pure module plus regression tests. Do not yet replace the current renderer. Once T1 is verified, wire it into P2/P3 mission-node prototypes so map work is driven by a stable readiness contract rather than ad-hoc UI logic.
