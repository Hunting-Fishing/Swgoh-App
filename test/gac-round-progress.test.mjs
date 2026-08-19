import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRoundProgress, uniquePositiveIds } from "../public/gac-round-progress.js";

test("round progress starts empty without saved defenses", () => {
  assert.deepEqual(summarizeRoundProgress([], []), {
    totalDefenses: 0,
    cleared: 0,
    open: 0,
    locked: 0,
    active: 0,
    failedOpen: 0,
    released: 0,
    unplanned: 0,
    attempts: 0,
    failedAttempts: 0,
    trackedBanners: 0,
    bannerWins: 0,
    unavailableAttackers: 0,
    completionRate: 0,
  });
});

test("HUD summarizes only saved defenses and keeps operational states distinct", () => {
  const defenseIds = [44, 45, 46, 47, 48, 49];
  const assignments = [
    {
      defenseId: 44,
      status: "win",
      attemptCount: 1,
      attemptLog: [{ status: "win", banners: 65, members: ["A", "B", "C"] }],
      members: ["A", "B", "C"],
    },
    { defenseId: 45, status: "planned", attemptCount: 0, attemptLog: [], members: ["D", "E", "F"] },
    { defenseId: 46, status: "attempted", attemptCount: 1, attemptLog: [], members: ["G", "H", "I"] },
    {
      defenseId: 47,
      status: "loss",
      attemptCount: 1,
      attemptLog: [{ status: "loss", banners: 0, members: ["J", "K", "L"] }],
      members: ["J", "K", "L"],
    },
    { defenseId: 48, status: "abandoned", attemptCount: 0, attemptLog: [], members: ["M", "N", "O"] },
    { defenseId: 999, status: "win", attemptCount: 1, attemptLog: [{ status: "win", banners: 99, members: ["X"] }] },
  ];
  const result = summarizeRoundProgress(assignments, defenseIds);
  assert.equal(result.totalDefenses, 6);
  assert.equal(result.cleared, 1);
  assert.equal(result.open, 5);
  assert.equal(result.locked, 1);
  assert.equal(result.active, 1);
  assert.equal(result.failedOpen, 1);
  assert.equal(result.released, 1);
  assert.equal(result.unplanned, 1);
  assert.equal(result.attempts, 3);
  assert.equal(result.failedAttempts, 1);
  assert.equal(result.trackedBanners, 65);
  assert.equal(result.bannerWins, 1);
  assert.equal(result.unavailableAttackers, 12);
  assert.equal(result.completionRate, 1 / 6);
});

test("retry lock keeps failed attackers consumed and current retry attackers reserved", () => {
  const result = summarizeRoundProgress([
    {
      defenseId: 44,
      status: "planned",
      attemptCount: 1,
      attemptLog: [{ status: "loss", banners: 0, members: ["A", "B", "C"] }],
      members: ["D", "E", "F"],
    },
  ], [44]);
  assert.equal(result.cleared, 0);
  assert.equal(result.open, 1);
  assert.equal(result.locked, 1);
  assert.equal(result.failedOpen, 0);
  assert.equal(result.failedAttempts, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.unavailableAttackers, 6);
});

test("owner-entered win banners are summed only from completed win attempts", () => {
  const result = summarizeRoundProgress([
    { defenseId: 1, status: "win", attemptCount: 1, attemptLog: [{ status: "win", banners: 64, members: ["A"] }] },
    { defenseId: 2, status: "win", attemptCount: 1, attemptLog: [{ status: "win", banners: 68, members: ["B"] }] },
    { defenseId: 3, status: "loss", attemptCount: 1, attemptLog: [{ status: "loss", banners: 50, members: ["C"] }] },
    { defenseId: 4, status: "win", attemptCount: 1, attemptLog: [{ status: "win", banners: null, members: ["D"] }] },
  ], [1, 2, 3, 4]);
  assert.equal(result.trackedBanners, 132);
  assert.equal(result.bannerWins, 2);
  assert.equal(result.failedAttempts, 1);
});

test("attacker availability and saved defense IDs are deduplicated", () => {
  assert.deepEqual(uniquePositiveIds([44, "44", 45, 0, -1, "bad"]), [44, 45]);
  const result = summarizeRoundProgress([
    {
      defenseId: 44,
      status: "attempted",
      attemptCount: 1,
      attemptLog: [{ status: "loss", members: ["A", "B"] }],
      members: ["B", "C", "C"],
    },
  ], [44, 44]);
  assert.equal(result.totalDefenses, 1);
  assert.equal(result.unavailableAttackers, 3);
});
