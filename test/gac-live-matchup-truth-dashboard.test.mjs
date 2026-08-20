import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  aggregateDefense,
  aggregateOffense,
  boardState,
  recordedRoundHistory,
  truthDashboardModel,
} from "../public/gac-live-matchup-truth-model.js";

const ROOT = path.resolve(process.cwd());
const liveRoster = (allyCode) => ({ source: "live", player: { allyCode }, units: [] });

test("recorded round history never converts unknown imported rounds into wins or losses", () => {
  const result = recordedRoundHistory({
    rounds: [
      { result: "unknown", verified: false },
      { result: "win", verified: true },
      { result: "loss", verified: true },
      { result: "unknown", verified: false },
    ],
  });
  assert.equal(result.rounds, 4);
  assert.equal(result.recordedResults, 2);
  assert.equal(result.wins, 1);
  assert.equal(result.losses, 1);
  assert.equal(result.unknown, 2);
  assert.equal(result.winRate, 0.5);
});

test("battle scouting aggregates observed offense and defense without inventing missing rates", () => {
  const offense = aggregateOffense([
    { attempts: 4, wins: 3, losses: 1, draws: 0, unknown: 0 },
    { attempts: 2, wins: 1, losses: 0, draws: 0, unknown: 1 },
  ]);
  const defense = aggregateDefense([
    { observations: 5, holds: 2, beaten: 2, draws: 0, unknown: 1 },
  ]);
  assert.equal(offense.wins, 4);
  assert.equal(offense.losses, 1);
  assert.equal(offense.winRate, 0.8);
  assert.equal(defense.holds, 2);
  assert.equal(defense.beaten, 2);
  assert.equal(defense.holdRate, 0.5);
  assert.equal(aggregateOffense([]).winRate, null);
  assert.equal(aggregateDefense([]).holdRate, null);
});

test("live defense is authoritative over a saved manual board", () => {
  const state = boardState({
    matchup: { opponent: { allyCode: "123456789" } },
    defense: { opponent: [{ members: ["A", "B", "C"] }] },
  }, {
    opponent: { allyCode: "123456789" },
    defenses: [{ members: ["D", "E", "F"] }],
  });
  assert.equal(state.ready, true);
  assert.equal(state.source, "live");
  assert.equal(state.count, 1);
});

test("verified manual board only counts when it belongs to the exact current opponent", () => {
  const matchup = { matchup: { opponent: { allyCode: "123456789" } }, defense: { opponent: [] } };
  assert.equal(boardState(matchup, {
    opponent: { allyCode: "123456789" },
    defenses: [{ members: ["A", "B", "C"] }],
  }).source, "verified-manual");
  assert.equal(boardState(matchup, {
    opponent: { allyCode: "987654321" },
    defenses: [{ members: ["A", "B", "C"] }],
  }).source, "manual-required");
});

test("current matchup recommendations are gated until exact identity, live rosters and current board exist", () => {
  const base = {
    matchup: {
      opponentResolution: { exact: true, method: "live-event-payload", source: "comlink-live" },
      matchup: {
        me: { allyCode: "732764286", name: "Warm Bacon" },
        opponent: { allyCode: "123456789", name: "Opponent" },
      },
      defense: { opponent: [] },
    },
    mineRoster: liveRoster("732764286"),
    opponentRoster: liveRoster("123456789"),
    scouting: { coverage: { offensiveBattleRows: 10, defensiveBattleRows: 8 }, offensiveTendencies: [], defensiveTendencies: [] },
    roundHistory: { rounds: [] },
  };
  const blocked = truthDashboardModel(base);
  assert.equal(blocked.actionable, false);
  assert.ok(blocked.blockers.some((item) => item.includes("defense")));

  const ready = truthDashboardModel({
    ...base,
    savedBoard: {
      opponent: { allyCode: "123456789" },
      defenses: [{ leaderBaseId: "LEADER", members: ["LEADER", "A", "B", "C", "D"] }],
    },
  });
  assert.equal(ready.actionable, true);
  assert.equal(ready.recommendationMode, "evidence-first-with-roster-fit");
});

test("canonical or stale roster payload cannot satisfy the live roster gate", () => {
  const model = truthDashboardModel({
    matchup: {
      opponentResolution: { exact: true },
      matchup: { me: { allyCode: "732764286" }, opponent: { allyCode: "123456789" } },
      defense: { opponent: [{ members: ["A", "B", "C"] }] },
    },
    mineRoster: { source: "canonical", player: { allyCode: "732764286" }, units: [] },
    opponentRoster: liveRoster("123456789"),
  });
  assert.equal(model.actionable, false);
  assert.equal(model.rosters.mineLoaded, false);
});

test("no history keeps current board actionable but forces explicitly labeled roster-fit fallback", () => {
  const model = truthDashboardModel({
    matchup: {
      opponentResolution: { exact: true },
      matchup: { me: { allyCode: "732764286" }, opponent: { allyCode: "123456789" } },
      defense: { opponent: [{ leaderBaseId: "LEADER", members: ["LEADER", "A", "B"] }] },
    },
    mineRoster: liveRoster("732764286"),
    opponentRoster: liveRoster("123456789"),
    scouting: null,
    roundHistory: null,
  });
  assert.equal(model.actionable, true);
  assert.equal(model.recommendationMode, "roster-fit-no-history");
});

test("truth dashboard browser controller is read-only and listens for manual board updates", () => {
  const controller = fs.readFileSync(path.join(ROOT, "public/gac-live-matchup-truth-dashboard.js"), "utf8");
  assert.match(controller, /gac-board-evidence-updated/);
  assert.match(controller, /\/api\/gac\/current-board\//);
  assert.doesNotMatch(controller, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(controller, /observed results/i);
  assert.match(controller, /roster-fit heuristic/i);
});

test("browser activation comes from an existing top-level GAC module", () => {
  const source = fs.readFileSync(path.join(ROOT, "public/gac-datacron-mechanics-ui.js"), "utf8");
  assert.match(source, /import "\.\/gac-live-matchup-truth-dashboard\.js"/);
});
