import test from "node:test";
import assert from "node:assert/strict";
import {
  battleOutcome,
  normalizePlayerBattles,
  squadInfo,
} from "../gac-c3po-source.mjs";

test("squadInfo identifies the actual character leader by squadUnitType", () => {
  const info = squadInfo([
    { definitionId: "MEMBER:SEVEN_STAR", squadUnitType: 1 },
    { definitionId: "REALLEADER:SEVEN_STAR", squadUnitType: 2 },
    { definitionId: "OTHER:SEVEN_STAR", squadUnitType: 1 },
  ]);
  assert.equal(info.kind, "character");
  assert.equal(info.leader, "REALLEADER");
});

test("battle outcome mapping preserves attacker win, hold and draw semantics", () => {
  assert.equal(battleOutcome(1), "win");
  assert.equal(battleOutcome(2), "loss");
  assert.equal(battleOutcome(3), "draw");
  assert.equal(battleOutcome(0), "unknown");
});

test("C-3PO player history normalizes duel squads, opponent metadata and round", () => {
  const battles = normalizePlayerBattles({
    matchResult: [{
      roundNumber: 3,
      matchId: "MATCH-3",
      opponent: { id: "P2", allyCode: "123-456-789", name: "Navygators" },
      attackResult: [{
        duelResult: [{
          attackerUnit: [
            { definitionId: "A1:SEVEN_STAR", squadUnitType: 1 },
            { definitionId: "ALEAD:SEVEN_STAR", squadUnitType: 2 },
            { definitionId: "A2:SEVEN_STAR", squadUnitType: 1 },
          ],
          defenderUnit: [
            { definitionId: "D1:SEVEN_STAR", squadUnitType: 1 },
            { definitionId: "DLEAD:SEVEN_STAR", squadUnitType: 2 },
            { definitionId: "D2:SEVEN_STAR", squadUnitType: 1 },
          ],
          battleOutcome: 1,
        }],
      }],
    }],
  }, {
    mode: "3v3",
    playerId: "PLAYER_1",
    allyCode: "732764286",
    eventInstanceId: "GAC81:O1",
    season: 81,
  });

  assert.equal(battles.length, 1);
  assert.equal(battles[0].roundNumber, 3);
  assert.equal(battles[0].opponentName, "Navygators");
  assert.equal(battles[0].opponentAllyCode, "123456789");
  assert.equal(battles[0].attackerLeaderBaseId, "ALEAD");
  assert.equal(battles[0].defenderLeaderBaseId, "DLEAD");
  assert.deepEqual(battles[0].attackerMembers, ["A1", "ALEAD", "A2"]);
  assert.equal(battles[0].outcome, "win");
});
