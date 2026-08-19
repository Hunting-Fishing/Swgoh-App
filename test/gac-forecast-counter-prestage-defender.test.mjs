import test from "node:test";
import assert from "node:assert/strict";

import { defenderUnits, forecastEntries } from "../public/gac-forecast-counter-prestage-model.js";

const report = {
  predictions: [{
    format: "3v3",
    leaderBaseId: "ENEMY_LEAD",
    members: ["ENEMY_LEAD", "ENEMY_2", "ENEMY_3"],
    evidenceClass: "battle-recurring",
  }],
};

test("forecast matchup deltas fail closed when any defender roster unit is unresolved", () => {
  const [entry] = forecastEntries(report, "3", 8);
  const complete = defenderUnits(entry, {
    units: [
      { baseId: "ENEMY_LEAD", unitType: "Character" },
      { baseId: "ENEMY_2", unitType: "Character" },
      { baseId: "ENEMY_3", unitType: "Character" },
    ],
  });
  const partial = defenderUnits(entry, {
    units: [
      { baseId: "ENEMY_LEAD", unitType: "Character" },
      { baseId: "ENEMY_2", unitType: "Character" },
    ],
  });

  assert.equal(complete.length, 3);
  assert.deepEqual(partial, []);
});
