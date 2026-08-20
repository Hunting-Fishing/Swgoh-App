# SWGOH Command Center — Farm Gallery Tabs Checkpoint

Status: IMPLEMENTED ON FEATURE BRANCH
Program: Farm Tracker v3 / FT2.3b

## User problem addressed

The existing `/farm` workspace preserved a large amount of useful information but presented it as one long vertical report. Competitive examples showed a clearer pattern: portrait-led target cards, compact unit galleries, and drill-down only when the player asks for detail.

The implementation must not delete or weaken existing Farm information.

## Primary tabs

The Farm Command workspace now has six primary tabs:

1. **Tracked**
2. **Journey Gallery**
3. **Requirements**
4. **Shopping List**
5. **Priority Queue**
6. **Era Journeys**

## Tracked

- portrait-first tracked Journey cards;
- status/progress/blocker counts preserved;
- subfilters for All Tracked / Active / Ready / Completed;
- Requirements opens the selected Journey in the dedicated Requirements tab;
- Master Plan summary remains available as a compact disclosure rather than a permanent long report.

## Journey Gallery

- all supported legacy Journey targets displayed as a visual grid;
- live/static target portraits;
- progress, blocker count and state retained;
- Track/Untrack continues to delegate to the existing account-backed Journey tracker;
- search and state filtering supported.

## Requirements

- one selected Journey at a time;
- requirement units displayed side by side as portrait cards;
- information directly beneath every portrait:
  - Stars
  - Level
  - Gear
  - Relic
  - target requirement
  - explicit delta/blocker
  - status
- subfilters: Needs Work / Completed / All;
- unit inspector attributes preserved.

## Shopping List

Uses the existing `buildMasterFarmPlan()` contract rather than introducing a second calculation model.

Preserved information:

- tracked farm count;
- unique target count;
- still-needed count;
- shared targets;
- total Relic levels remaining;
- total Gear tiers remaining;
- material name;
- quantity;
- category;
- route;
- source;
- Copy Master Plan output.

Materials can be filtered by category without removing any material from the underlying plan.

## Priority Queue

Uses the existing deduplicated Master Farm Plan queue.

Preserved information:

- full queue rank;
- unit portrait/name;
- current -> target progression;
- remaining gap;
- readiness percent;
- number of tracked farms advanced;
- tracked farm tags;
- Inspect action;
- Plan Upgrade handoff to Gear / Relic planner.

All queue items remain accessible; the new layout does not truncate the queue to a fixed visible subset.

## Era Journeys

- current Era/reference Journey evidence remains in its own tab;
- known tier/star/Era-Level evidence preserved;
- source provenance retained;
- no legacy Relic percentage is substituted for Era-Level readiness.

## Compatibility boundary

The following existing systems remain authoritative underneath the new UI:

- `journey-tracker-v2.js` — durable/account-backed Track/Untrack state;
- `farm-tracker-v3-model.js` — legacy Journey target/readiness semantics;
- `farm-master-plan.js` — deduplicated shopping list and priority calculations;
- `farm-master-plan-pro.js` — retained compatibility producer;
- Journey canonicalization / data-quality safeguards.

The legacy FT2 command surface and long Master Plan report are hidden only after `farm-gallery-tabs-active` is established. If the new tab controller fails to initialize, the legacy surfaces remain available rather than leaving the user with an empty Farm page.

## Visual rules

- desktop target grid: up to five Journey targets per row;
- desktop requirement grid: up to seven unit portraits per row;
- portrait art is primary visual identity;
- progression is directly under the portrait;
- green = complete;
- yellow/gold = needs work;
- red = missing;
- responsive tablet/mobile reductions preserve the same information.

## Regression specifications

Added:

- `test/farm-gallery-tabs.test.mjs`
- updated `test/farm-workspace-v3-wiring.test.mjs`

Coverage locks:

- all six primary tabs;
- portrait-first requirement structure;
- Stars / Level / Gear / Relic display;
- Requirements dedicated-tab routing;
- Master Farm Plan material/queue reuse;
- durable Track/Untrack delegation;
- Era evidence boundary;
- legacy surfaces hidden only after successful Gallery activation;
- load ordering after Farm v3.

## Environment note

Full local repository execution is still blocked by the development environment failing DNS resolution for `github.com`. GitHub Actions must continue to be interpreted from actual job/step metadata rather than assumed to have run.
