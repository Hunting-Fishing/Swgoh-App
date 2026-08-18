import test from "node:test";
import assert from "node:assert/strict";

import { createGacScoutingService, summarizeTeams } from "../gac-scouting-service.mjs";

function battle(overrides = {}) {
  return {
    swgoh_player_id: "OBSERVER",
    ally_code: "111111111",
    season_id: "S1",
    format: "5v5",
    round_number: 3,
    opponent_swgoh_player_id: "TARGET",
    opponent_ally_code: "222222222",
    opponent_name: "Target Player",
    attacker_leader_base_id: "ATTACK_LEAD",
    attacker_members: ["ATTACK_LEAD", "A2", "A3", "A4", "A5"],
    defender_leader_base_id: "DEFENSE_LEAD",
    defender_members: ["DEFENSE_LEAD", "D2", "D3", "D4", "D5"],
    battle_outcome: "win",
    source_updated_at: "2026-08-18T00:00:00.000Z",
    metadata: { battleType: "character" },
    ...overrides,
  };
}

test("defense summaries invert attacker losses into defensive holds", () => {
  const rows = [
    battle({ battle_outcome: "loss", swgoh_player_id: "P1" }),
    battle({ battle_outcome: "win", swgoh_player_id: "P2", source_updated_at: "2026-08-19T00:00:00.000Z" }),
  ];
  const [summary] = summarizeTeams(rows, "defense");
  assert.equal(summary.observations, 2);
  assert.equal(summary.holds, 1);
  assert.equal(summary.beaten, 1);
  assert.equal(summary.holdRate, 0.5);
  assert.equal(summary.observedByPlayers, 2);
  assert.equal(summary.lastSeenAt, "2026-08-19T00:00:00.000Z");
});

test("scouting report combines target offense with defenses observed by other players", async () => {
  const targetAllyCode = "222222222";
  const offenseRows = [
    battle({
      swgoh_player_id: "TARGET",
      ally_code: targetAllyCode,
      opponent_swgoh_player_id: "OTHER",
      opponent_ally_code: "333333333",
      attacker_leader_base_id: "TARGET_ATTACK",
      attacker_members: ["TARGET_ATTACK", "T2", "T3", "T4", "T5"],
      defender_leader_base_id: "OTHER_DEFENSE",
      defender_members: ["OTHER_DEFENSE", "O2", "O3", "O4", "O5"],
      battle_outcome: "win",
    }),
    battle({
      swgoh_player_id: "TARGET",
      ally_code: targetAllyCode,
      opponent_swgoh_player_id: "OTHER2",
      opponent_ally_code: "444444444",
      attacker_leader_base_id: "TARGET_ATTACK",
      attacker_members: ["TARGET_ATTACK", "T2", "T3", "T4", "T5"],
      defender_leader_base_id: "OTHER_DEFENSE_2",
      defender_members: ["OTHER_DEFENSE_2", "Q2", "Q3", "Q4", "Q5"],
      battle_outcome: "win",
    }),
  ];
  const defenseRows = [
    battle({ swgoh_player_id: "P1", battle_outcome: "loss" }),
    battle({ swgoh_player_id: "P2", battle_outcome: "win" }),
  ];

  const store = {
    async select(table, query) {
      if (table === "players") {
        return [{ id: "PLAYER-ID", ally_code: targetAllyCode, swgoh_player_id: "TARGET", name: "Navygators" }];
      }
      assert.equal(table, "gac_battles");
      if (query.ally_code === `eq.${targetAllyCode}`) return offenseRows;
      if (query.opponent_ally_code === `eq.${targetAllyCode}`) return defenseRows;
      return [];
    },
  };

  const service = createGacScoutingService({ store });
  const report = await service.getScoutingReport(targetAllyCode);
  assert.equal(report.player.name, "Navygators");
  assert.equal(report.coverage.defensiveBattleRows, 2);
  assert.equal(report.coverage.offensiveBattleRows, 2);
  assert.equal(report.coverage.observedByPlayers, 2);
  assert.equal(report.defensiveTendencies[0].leaderBaseId, "DEFENSE_LEAD");
  assert.equal(report.defensiveTendencies[0].holdRate, 0.5);
  assert.equal(report.offensiveTendencies[0].leaderBaseId, "TARGET_ATTACK");
  assert.equal(report.offensiveTendencies[0].attempts, 2);
  assert.equal(report.offensiveTendencies[0].winRate, 1);
});
