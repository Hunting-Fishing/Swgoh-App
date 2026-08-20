import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildGateRows,
  buildTestReport,
  buildTestSnapshot,
  normalizeFormat,
  overallStatus,
} from "../public/gac-live-test-console-model.js";

const readyInput = {
  capturedAt: "2026-08-20T11:45:00Z",
  myAllyCode: "732764286",
  opponentAllyCode: "123456789",
  round: 1,
  format: "3v3",
  boardSource: "verified-manual",
  boardCount: 6,
  recommendationMode: "evidence-first-with-roster-fit",
  actionable: true,
  truthGates: ["pass", "pass", "pass", "pass", "pass"],
};

test("ready live GAC context produces a pass test snapshot", () => {
  const model = buildTestSnapshot(readyInput);
  assert.equal(model.status, "pass");
  assert.equal(model.round, 1);
  assert.equal(model.format, "3v3");
  assert.equal(model.actionable, true);
  assert.equal(model.gates.every((gate) => gate.status === "pass"), true);
});

test("missing current board is a warning instead of fabricated readiness", () => {
  const model = buildTestSnapshot({
    ...readyInput,
    boardSource: "manual-required",
    boardCount: 0,
    actionable: false,
    truthGates: ["pass", "pass", "pass", "warn", "warn"],
  });
  assert.equal(model.status, "warn");
  assert.equal(model.gates.find((gate) => gate.id === "board")?.status, "warn");
  assert.equal(model.gates.find((gate) => gate.id === "actionable")?.status, "warn");
});

test("unresolved exact opponent blocks the live test state", () => {
  const model = buildTestSnapshot({
    ...readyInput,
    opponentAllyCode: "",
    actionable: false,
    truthGates: ["fail", "pass", "unknown", "unknown", "warn"],
  });
  assert.equal(model.status, "fail");
  assert.equal(model.gates.find((gate) => gate.id === "opponent")?.status, "fail");
});

test("format normalization is strict to supported GAC squad formats", () => {
  assert.equal(normalizeFormat("3"), "3v3");
  assert.equal(normalizeFormat("5v5"), "5v5");
  assert.equal(normalizeFormat("fleet"), "unknown");
});

test("overall status fails closed on any fail and preserves warnings", () => {
  assert.equal(overallStatus([{ status: "pass" }, { status: "warn" }]), "warn");
  assert.equal(overallStatus([{ status: "pass" }, { status: "fail" }]), "fail");
  assert.equal(overallStatus([{ status: "pass" }, { status: "pass" }]), "pass");
});

test("copyable report includes truth boundaries and no predicted result language", () => {
  const report = buildTestReport(buildTestSnapshot(readyInput));
  assert.match(report, /GAC LIVE TEST REPORT/);
  assert.match(report, /Opponent Ally Code: 123456789/);
  assert.match(report, /Board: verified-manual/);
  assert.match(report, /does not infer hidden defenses/i);
  assert.doesNotMatch(report, /predicted win rate/i);
});

test("gate rows preserve historical unknown as non-blocking evidence status", () => {
  const rows = buildGateRows({
    ...readyInput,
    truthGates: ["pass", "pass", "pass", "warn", "pass"],
  });
  const history = rows.find((row) => row.id === "history");
  assert.equal(history.status, "warn");
  assert.match(history.detail, /Limited\/unknown is allowed/);
});

test("browser test console is read-only and activated by the canonical GAC browser chain", async () => {
  const controller = await readFile(new URL("../public/gac-live-test-console.js", import.meta.url), "utf8");
  const entry = await readFile(new URL("../public/gac-datacron-mechanics-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(controller, /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  assert.match(controller, /gac-live-truth-updated/);
  assert.match(controller, /COPY TEST REPORT/);
  assert.match(entry, /import "\.\/gac-live-test-console\.js"/);
});
