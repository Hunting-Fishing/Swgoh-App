import test from "node:test";
import assert from "node:assert/strict";
import {
  battleOutcome,
  chronologicalRoundMetadata,
  normalizePlayerBattles,
  squadInfo,
} from "../gac-c3po-source.mjs";

function duel(attacker = "ALEAD", defender = "DLEAD") {
  return {
    attackerUnit: [
      { definitionId: `${attacker}:SEVEN_STAR`, squadUnitType: 2 },
      { definitionId: "A2:SEVEN_STAR", squadUnitType: 1 },
      { definitionId: "A3:SEVEN_STAR", squadUnitType: 1 },
    ],
    defenderUnit: [
      { definitionId: `${defender}:SEVEN_STAR`, squadUnitType: 2 },
      { definitionId: "D2:SEVEN_STAR", squadUnitType: 1 },
      { definitionId: "D3:SEVEN_STAR", squadUnitType: 1 },
    ],
    battleOutcome: 1,
  };
}

function match(overrides = {}) {
  return {
    attackResult: [{ duelResult: [duel()] }],
    ...overrides,
  };
}

const context = {
  mode: "3v3",
  playerId: "PLAYER_1",
  allyCode: "732764286",
  eventInstanceId: "GAC81:O1",
  season: 81,
};

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

test("C-3PO player history normalizes duel squads, opponent metadata and explicit round", () => {
  const battles = normalizePlayerBattles({
    matchResult: [{
      roundNumber: 3,
      matchId: "MATCH-3",
      opponent: { id: "P2", allyCode: "123-456-789", name: "Navygators" },
      attackResult: [{ duelResult: [duel()] }],
    }],
  }, context);

  assert.equal(battles.length, 1);
  assert.equal(battles[0].roundNumber, 3);
  assert.equal(battles[0].roundDerivation, "explicit-source-field");
  assert.equal(battles[0].roundConfidence, 1);
  assert.equal(battles[0].opponentName, "Navygators");
  assert.equal(battles[0].opponentAllyCode, "123456789");
  assert.equal(battles[0].attackerLeaderBaseId, "ALEAD");
  assert.equal(battles[0].defenderLeaderBaseId, "DLEAD");
  assert.deepEqual(battles[0].attackerMembers, ["ALEAD", "A2", "A3"]);
  assert.equal(battles[0].outcome, "win");
});

test("exactly three ordered matchResult entries receive low-confidence inferred Round 1/2/3 chronology", () => {
  const battles = normalizePlayerBattles({
    matchResult: [match(), match(), match()],
  }, context);

  assert.equal(battles.length, 3);
  assert.deepEqual(battles.map((battle) => battle.roundNumber), [1, 2, 3]);
  assert.ok(battles.every((battle) => battle.roundDerivation === "three-match-result-order"));
  assert.ok(battles.every((battle) => battle.roundConfidence === 0.65));
});

test("three-match chronology never overrides an explicit source round", () => {
  const battles = normalizePlayerBattles({
    matchResult: [match(), match({ roundNumber: 3 }), match()],
  }, context);
  assert.equal(battles[1].roundNumber, 3);
  assert.equal(battles[1].roundDerivation, "explicit-source-field");
  assert.equal(battles[1].roundConfidence, 1);
});

test("match order is not converted into a round when the source does not contain exactly three matches", () => {
  const metadata = chronologicalRoundMetadata({ roundNumber: null, roundDerivation: "unavailable", roundConfidence: 0 }, 0, 2);
  assert.equal(metadata.roundNumber, null);
  const battles = normalizePlayerBattles({ matchResult: [match(), match()] }, context);
  assert.ok(battles.every((battle) => battle.roundNumber === null));
  assert.ok(battles.every((battle) => battle.roundDerivation === "unavailable"));
});
