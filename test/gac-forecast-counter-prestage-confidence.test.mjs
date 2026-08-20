import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  forecastEligibleForPrestage,
  forecastEntries,
  forecastPrestageReason,
} from "../public/gac-forecast-counter-prestage-model.js";

function row(overrides = {}) {
  return {
    format: "5v5",
    leaderBaseId: "LEAD",
    members: ["LEAD", "A", "B", "C", "D"],
    evidenceClass: "battle-observed",
    battleObservedMatchups: 1,
    verifiedHistoricalBoards: 0,
    ...overrides,
  };
}

test("single or limited battle sightings do not reserve scarce squads automatically", () => {
  assert.equal(forecastEligibleForPrestage(row()), false);
  assert.equal(forecastEligibleForPrestage(row({ battleObservedMatchups: 2 })), false);
  assert.equal(forecastEligibleForPrestage(row({ battleObservedMatchups: 3, evidenceClass: "battle-recurring" })), true);
  assert.equal(forecastEligibleForPrestage(row({ verifiedHistoricalBoards: 1, evidenceClass: "verified-zone-once" })), true);
  assert.equal(forecastEligibleForPrestage(row({ battleObservedMatchups: 0, evidenceClass: "battle-recurring" })), false);
  assert.equal(forecastEligibleForPrestage(row({ verifiedHistoricalBoards: 0, evidenceClass: "verified-zone-recurring" })), false);
  assert.match(forecastPrestageReason(row(), "5"), /does not reserve a scarce squad/i);
});

test("forecast entry allocation skips low-confidence cards without shifting later card positions", () => {
  const entries = forecastEntries({
    predictions: [
      row({ leaderBaseId: "WATCH", members: ["WATCH", "A", "B", "C", "D"] }),
      row({ leaderBaseId: "RECUR", members: ["RECUR", "E", "F", "G", "H"], battleObservedMatchups: 4, evidenceClass: "battle-recurring" }),
    ],
  }, "5", 8);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].defense.leaderBaseId, "RECUR");
  assert.equal(entries[0].forecastIndex, 1);
  assert.equal(entries[0].defenseId, 900002);
});

test("limited forecast cards visibly disclose watchlist-only policy", async () => {
  const css = await readFile(new URL("../public/gac-forecast-counter-prestage.css", import.meta.url), "utf8");
  assert.match(css, /WATCHLIST ONLY · limited historical sighting · no scarce counter squad reserved automatically/);
});
