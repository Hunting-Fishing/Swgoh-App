# GAC Manual Counter Planner v1.1 — Acceptance

- Opponent identity comes from manually entered Ally Code.
- Opponent roster/progression is loaded from `/api/player/:allyCode`.
- Own roster is loaded from the configured player Ally Code.
- Own defense/unavailable units are manually reserved and hard-excluded from offense.
- Enemy board squads are manually entered exactly as seen in-game.
- 3v3 and 5v5 sizes are enforced.
- Board-wide recommendations cannot reuse offense units.
- Relic, Zeta, Omicron, speed and GP deltas are displayed from available roster data.
- Full calculated Health/Protection/Offense deltas remain unavailable unless both roster sources explicitly expose them.
- Historical observations are evidence, not predicted win probability.
- Primary planner does not call current-event or current-opponent APIs.
- Legacy advanced War Room remains opt-in.
