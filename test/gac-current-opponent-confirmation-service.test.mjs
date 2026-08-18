import test from "node:test";
import assert from "node:assert/strict";
import { createGacCurrentOpponentConfirmationService } from "../gac-current-opponent-confirmation-service.mjs";

function harness(options = {}) {
  const writes = [];
  const store = {
    async select(table, query) {
      if (table === "players" && query.ally_code === "eq.732764286") {
        return [{ id: "PLAYER-ROW-1", ally_code: "732764286", swgoh_player_id: "PLAYER_1", name: "Warm Bacon" }];
      }
      if (table === "players" && query.ally_code === "eq.123456789") {
        return [{ id: "PLAYER-ROW-2", ally_code: "123456789", swgoh_player_id: "PLAYER_2", name: "Navygators" }];
      }
      if (table === "user_player_links") {
        return options.verified === false ? [] : [{
          user_id: "USER-1",
          player_id: "PLAYER-ROW-1",
          verification_status: "verified",
          verified_at: "2026-08-17T15:02:21Z",
        }];
      }
      if (table === "gac_events") return [{ id: "EVENT-ROW-1", event_instance_id: "GAC:CURRENT" }];
      return [];
    },
    async upsert(table, rows, config) {
      writes.push({ table, rows, config });
      return rows;
    },
  };
  const bracketIndex = {
    async findIndexedBracket() {
      return {
        source: "persisted-gac-bracket-index",
        event: { eventInstanceId: "GAC:CURRENT" },
        league: "KYBER",
        bracketIndex: 42,
        groupId: "GAC:CURRENT:KYBER:42",
        players: options.outsideBracket ? [
          { playerId: "PLAYER_1", allyCode: "732764286", name: "Warm Bacon" },
        ] : [
          { playerId: "PLAYER_1", allyCode: "732764286", name: "Warm Bacon" },
          { playerId: "PLAYER_2", allyCode: "123456789", name: "Navygators" },
        ],
      };
    },
  };
  const service = createGacCurrentOpponentConfirmationService({
    store,
    bracketIndex,
    now: () => new Date("2026-08-19T01:30:00+08:00"),
  });
  return { service, writes };
}

test("verified owner can persist a same-bracket current opponent as exact user evidence", async () => {
  const { service, writes } = harness();
  const result = await service.confirm("USER-1", {
    allyCode: "732-764-286",
    opponentAllyCode: "123-456-789",
    eventInstanceId: "GAC:CURRENT",
    round: 3,
    roundSource: "verified-user-confirmed",
  });
  assert.equal(result.opponent.name, "Navygators");
  assert.equal(result.resolution.exact, true);
  assert.equal(result.resolution.round, 3);
  assert.equal(result.resolution.confidence, 1);
  assert.equal(result.resolution.verified, true);

  const write = writes.find((entry) => entry.table === "gac_rounds");
  assert.equal(write.config.onConflict, "event_id,round_number,player_id,source");
  const row = write.rows[0];
  assert.equal(row.source, "user-confirmed-current-bracket");
  assert.equal(row.opponent_ally_code, "123456789");
  assert.equal(row.opponent_swgoh_player_id, "PLAYER_2");
  assert.equal(row.confidence, 1);
  assert.equal(row.verified, true);
  assert.equal(row.metadata.bracketVerified, true);
  assert.equal(row.metadata.exactOpponentEligible, true);
  assert.equal(row.metadata.confirmationMethod, "verified-user-selected-live-bracket-opponent");
});

test("unverified account cannot write canonical current opponent history", async () => {
  const { service, writes } = harness({ verified: false });
  await assert.rejects(
    () => service.confirm("USER-1", {
      allyCode: "732764286",
      opponentAllyCode: "123456789",
      eventInstanceId: "GAC:CURRENT",
      round: 3,
    }),
    (error) => error?.status === 403
  );
  assert.equal(writes.length, 0);
});

test("verified owner cannot confirm a player who is not in the indexed live bracket", async () => {
  const { service, writes } = harness({ outsideBracket: true });
  await assert.rejects(
    () => service.confirm("USER-1", {
      allyCode: "732764286",
      opponentAllyCode: "123456789",
      eventInstanceId: "GAC:CURRENT",
      round: 3,
    }),
    (error) => error?.status === 409
  );
  assert.equal(writes.length, 0);
});
