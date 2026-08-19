import test from "node:test";
import assert from "node:assert/strict";

import {
  battlePlacementRows,
  summarizePredictionPlacements,
  suppliedHistoricalBattleRows,
} from "../gac-defense-prediction-service.mjs";

function row(format, matchId, leader, members, overrides = {}) {
  return {
    swgoh_player_id: `OBSERVER_${matchId}`,
    ally_code: "111111111",
    event_instance_id: `EVENT_${format}`,
    season_id: `SEASON_${format}`,
    format,
    match_id: matchId,
    opponent_swgoh_player_id: "TARGET_PID",
    opponent_ally_code: "222222222",
    defender_leader_base_id: leader,
    defender_members: members,
    source: "c3po-gahistory",
    source_updated_at: "2026-07-01T00:00:00.000Z",
    metadata: { battleType: "character" },
    ...overrides,
  };
}

test("appearance rates and coverage denominators are scoped to each GAC format", () => {
  const broad = battlePlacementRows([
    row("5v5", "FIVE_A", "FIVE_LEAD", ["FIVE_LEAD", "A", "B", "C", "D"]),
    row("5v5", "FIVE_B", "FIVE_LEAD", ["FIVE_LEAD", "A", "B", "C", "D"]),
    row("5v5", "FIVE_C", "OTHER_FIVE", ["OTHER_FIVE", "E", "F", "G", "H"]),
    row("3v3", "THREE_A", "THREE_LEAD", ["THREE_LEAD", "I", "J"]),
    row("3v3", "THREE_B", "OTHER_THREE", ["OTHER_THREE", "K", "L"]),
  ]);

  const result = summarizePredictionPlacements(broad, []);
  const five = result.predictions.find((entry) => entry.leaderBaseId === "FIVE_LEAD");
  const three = result.predictions.find((entry) => entry.leaderBaseId === "THREE_LEAD");

  assert.deepEqual(result.byFormat["5v5"], { battleObservedMatchups: 3, verifiedHistoricalBoards: 0 });
  assert.deepEqual(result.byFormat["3v3"], { battleObservedMatchups: 2, verifiedHistoricalBoards: 0 });
  assert.deepEqual(five.formatCoverage, { battleObservedMatchups: 3, verifiedHistoricalBoards: 0 });
  assert.deepEqual(three.formatCoverage, { battleObservedMatchups: 2, verifiedHistoricalBoards: 0 });
  assert.equal(five.battleObservedAppearanceRate, 2 / 3);
  assert.equal(three.battleObservedAppearanceRate, 1 / 2);
});

test("reused scouting rows keep only published C-3PO history for the requested opponent", () => {
  const rows = [
    row("5v5", "C3PO_OK", "DEF", ["DEF", "A", "B", "C", "D"]),
    row("5v5", "WAR_ROOM", "DEF", ["DEF", "A", "B", "C", "D"], { source: "verified-owner-war-room" }),
    row("5v5", "OTHER_TARGET", "DEF", ["DEF", "A", "B", "C", "D"], { opponent_ally_code: "999999999", opponent_swgoh_player_id: "OTHER_PID" }),
  ];
  const filtered = suppliedHistoricalBattleRows(rows, "222222222", "TARGET_PID");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].match_id, "C3PO_OK");
  assert.equal(filtered[0].source, "c3po-gahistory");
});
