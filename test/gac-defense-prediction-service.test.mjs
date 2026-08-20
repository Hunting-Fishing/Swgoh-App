import test from "node:test";
import assert from "node:assert/strict";

import {
  battlePlacementRows,
  createGacDefensePredictionService,
  historicalEvent,
  summarizePredictionPlacements,
  verifiedPlacementRows,
} from "../gac-defense-prediction-service.mjs";

function battle(overrides = {}) {
  return {
    swgoh_player_id: "OBSERVER_A",
    ally_code: "111111111",
    event_instance_id: "EVENT_OLD",
    season_id: "S1",
    format: "5v5",
    round_number: 1,
    match_index: 0,
    match_id: "MATCH_A",
    opponent_swgoh_player_id: "TARGET_PID",
    opponent_ally_code: "222222222",
    defender_leader_base_id: "DEF_LEAD",
    defender_members: ["DEF_LEAD", "D2", "D3", "D4", "D5"],
    source: "c3po-gahistory",
    source_updated_at: "2026-07-01T00:00:00.000Z",
    metadata: { battleType: "character" },
    ...overrides,
  };
}

function verifiedBoard(overrides = {}) {
  return {
    round_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    owner: "opponent",
    side: "defense",
    zone: "FRONT_TOP",
    squad_slot: 0,
    leader_base_id: "DEF_LEAD",
    members: ["DEF_LEAD", "D2", "D3", "D4", "D5"],
    datacron: { id: "DC-1", level: 9 },
    source: "user-confirmed-current-board",
    observed_at: "2026-07-02T00:00:00.000Z",
    metadata: { opponentAllyCode: "222222222", eventInstanceId: "EVENT_OLD", round: 1, size: 5 },
    ...overrides,
  };
}

test("repeated attempts against the same exact defense count as one historical placement", () => {
  const placements = battlePlacementRows([
    battle(),
    battle({ source_updated_at: "2026-07-01T00:10:00.000Z" }),
    battle({ match_id: "MATCH_B", match_index: 1, source_updated_at: "2026-07-10T00:00:00.000Z" }),
    battle({ match_id: "MATCH_C", source: "verified-owner-war-room" }),
  ], "5v5");

  assert.equal(placements.length, 2);
  assert.equal(new Set(placements.map((row) => row.boardKey)).size, 2);
  assert.equal(placements[0].leaderBaseId, "DEF_LEAD");
});

test("verified zone evidence is released only after the parent event is historical", () => {
  const oldRoundId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const activeRoundId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const oldEventId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const activeEventId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const rounds = new Map([
    [oldRoundId, { id: oldRoundId, event_id: oldEventId, round_number: 1 }],
    [activeRoundId, { id: activeRoundId, event_id: activeEventId, round_number: 3 }],
  ]);
  const events = new Map([
    [oldEventId, { id: oldEventId, event_instance_id: "EVENT_OLD", format: "5v5", status: "history-published" }],
    [activeEventId, { id: activeEventId, event_instance_id: "EVENT_ACTIVE", format: "5v5", status: "attack-phase" }],
  ]);

  const result = verifiedPlacementRows([
    verifiedBoard(),
    verifiedBoard({
      round_id: activeRoundId,
      zone: "BACK_BOTTOM",
      metadata: { opponentAllyCode: "222222222", eventInstanceId: "EVENT_ACTIVE", round: 3, size: 5 },
      observed_at: "2026-08-20T00:00:00.000Z",
    }),
  ], rounds, events, { format: "5v5", nowMs: Date.parse("2026-08-20T00:00:00.000Z") });

  assert.equal(result.included.length, 1);
  assert.equal(result.included[0].zone, "FRONT_TOP");
  assert.equal(result.withheld.length, 1);
  assert.equal(result.withheld[0].zone, "BACK_BOTTOM");
});

test("prediction summary keeps zone frequency separate from broad reconstructed frequency", () => {
  const broad = battlePlacementRows([
    battle({ match_id: "MATCH_A", swgoh_player_id: "P1" }),
    battle({ match_id: "MATCH_B", swgoh_player_id: "P2", season_id: "S2" }),
    battle({ match_id: "MATCH_C", swgoh_player_id: "P3", defender_leader_base_id: "OTHER", defender_members: ["OTHER", "O2", "O3", "O4", "O5"] }),
  ], "5v5");
  const verified = [
    {
      format: "5v5",
      boardKey: "VB1",
      signature: "5v5|DEF_LEAD|D2,D3,D4,D5,DEF_LEAD",
      leaderBaseId: "DEF_LEAD",
      members: ["D2", "D3", "D4", "D5", "DEF_LEAD"],
      zone: "FRONT_TOP",
      slot: 0,
      datacron: null,
      lastSeenAt: "2026-06-01T00:00:00.000Z",
    },
    {
      format: "5v5",
      boardKey: "VB2",
      signature: "5v5|DEF_LEAD|D2,D3,D4,D5,DEF_LEAD",
      leaderBaseId: "DEF_LEAD",
      members: ["D2", "D3", "D4", "D5", "DEF_LEAD"],
      zone: "FRONT_TOP",
      slot: 1,
      datacron: null,
      lastSeenAt: "2026-07-01T00:00:00.000Z",
    },
  ];

  const result = summarizePredictionPlacements(broad, verified);
  const prediction = result.predictions.find((row) => row.leaderBaseId === "DEF_LEAD");
  assert.equal(prediction.battleObservedMatchups, 2);
  assert.equal(prediction.battleObservedAppearanceRate, 2 / 3);
  assert.equal(prediction.verifiedHistoricalBoards, 2);
  assert.equal(prediction.verifiedBoardAppearanceRate, 1);
  assert.equal(prediction.zoneTendencies[0].zone, "FRONT_TOP");
  assert.equal(prediction.zoneTendencies[0].shareOfVerifiedAppearances, 1);
  assert.equal(prediction.evidenceClass, "verified-zone-recurring");
});

test("service withholds active verified board rows and returns only published historical recurrence", async () => {
  const target = "222222222";
  const oldRoundId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const activeRoundId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const oldEventId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const activeEventId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  const store = {
    async select(table, query) {
      if (table === "players") return [{ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", ally_code: target, swgoh_player_id: "TARGET_PID", name: "Navygators" }];
      if (table === "gac_battles") {
        assert.equal(query.source, "eq.c3po-gahistory");
        return [
          battle({ swgoh_player_id: "P1", match_id: "MATCH_A" }),
          battle({ swgoh_player_id: "P1", match_id: "MATCH_A", source_updated_at: "2026-07-01T00:20:00.000Z" }),
          battle({ swgoh_player_id: "P2", match_id: "MATCH_B", season_id: "S2" }),
        ];
      }
      if (table === "gac_rounds") {
        assert.equal(query.opponent_ally_code, `eq.${target}`);
        return [
          { id: oldRoundId, event_id: oldEventId, round_number: 1, recorded_at: "2026-07-02T00:00:00.000Z" },
          { id: activeRoundId, event_id: activeEventId, round_number: 3, recorded_at: "2026-08-20T00:00:00.000Z" },
        ];
      }
      if (table === "gac_events") {
        return [
          { id: oldEventId, event_instance_id: "EVENT_OLD", format: "5v5", status: "history-published", ends_at: null },
          { id: activeEventId, event_instance_id: "EVENT_ACTIVE", format: "5v5", status: "attack-phase", ends_at: "2026-08-25T00:00:00.000Z" },
        ];
      }
      if (table === "gac_round_squads") {
        assert.equal(query.owner, "eq.opponent");
        assert.equal(query.source, "eq.user-confirmed-current-board");
        return [
          verifiedBoard(),
          verifiedBoard({
            round_id: activeRoundId,
            zone: "BACK_BOTTOM",
            metadata: { opponentAllyCode: target, eventInstanceId: "EVENT_ACTIVE", round: 3, size: 5 },
            observed_at: "2026-08-20T00:00:00.000Z",
          }),
        ];
      }
      return [];
    },
  };

  const service = createGacDefensePredictionService({ store, now: () => Date.parse("2026-08-20T00:00:00.000Z") });
  const report = await service.getDefensePrediction(target, { format: "5v5" });
  assert.equal(report.truth, "historical-prediction-not-current-board");
  assert.equal(report.player.name, "Navygators");
  assert.equal(report.coverage.publishedHistoricalBattleRows, 3);
  assert.equal(report.coverage.deduplicatedBattlePlacements, 2);
  assert.equal(report.coverage.verifiedHistoricalBoardRows, 1);
  assert.equal(report.coverage.withheldCurrentOrUnresolvedBoardRows, 1);
  assert.equal(report.predictions[0].leaderBaseId, "DEF_LEAD");
  assert.equal(report.predictions[0].zoneTendencies[0].zone, "FRONT_TOP");
  assert.match(report.notes.join(" "), /never a claim about the opponent's current hidden board/i);
  assert.match(report.notes.join(" "), /withheld/i);
});

test("historical-event gate fails closed for active or timing-unknown events", () => {
  const now = Date.parse("2026-08-20T00:00:00.000Z");
  assert.equal(historicalEvent({ status: "attack-phase", ends_at: "2026-08-21T00:00:00.000Z" }, now), false);
  assert.equal(historicalEvent({ status: "attack-phase" }, now), false);
  assert.equal(historicalEvent({ status: "history-published" }, now), true);
  assert.equal(historicalEvent({ status: "", ends_at: "2026-08-19T00:00:00.000Z" }, now), true);
});
