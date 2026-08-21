# GAC v1.1 — Manual Ally-Code Counter Planner

## Primary workflow

1. Load the signed-in player's roster from their configured Ally Code.
2. Enter the opponent's 9-digit Ally Code and load that public roster.
3. Mark the player's own GAC defense/unavailable characters manually.
4. Enter each enemy squad exactly as visible in-game, including territory, slot, members, and leader.
5. Allocate non-overlapping counters only from the remaining owned roster.

## Truth boundary

The primary planner does **not** require or claim automatic access to the live GAC bracket, current opponent, current round, or battle board. Comlink/player roster access is used for roster/progression intelligence. Pairing and board placement are user-entered observations.

Unknown information remains unknown. Full calculated Health, Protection, or Offense deltas are displayed only when both roster sources explicitly expose calculated-stat capability. Historical counter observations are labeled as evidence and are not presented as predicted win probabilities.

## Counter inputs

The existing roster-fit engine considers owned progression including relic level, Galactic Power, speed, Zetas, Omicrons, leader/faction synergy, ability readiness, and speed risk. Manual defense reservations are hard exclusions before board-wide allocation, and allocated offense squads cannot overlap each other.

## Legacy tools

The prior GAC War Room remains available under **Show Advanced War Room** for saved/canonical workflows, but it is no longer the default GAC interaction model.
