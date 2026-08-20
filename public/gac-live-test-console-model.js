const TEST_CONSOLE_VERSION = "B01-T1-20260820";

function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) {
  const code = clean(value).replace(/\D/g, "");
  return /^\d{9}$/.test(code) ? code : "";
}
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function normalizeFormat(value) {
  const text = clean(value).toLowerCase();
  if (text === "3" || text === "3v3") return "3v3";
  if (text === "5" || text === "5v5") return "5v5";
  return "unknown";
}
function gateStatus(value) {
  const status = clean(value).toLowerCase();
  return new Set(["pass", "warn", "fail", "unknown"]).has(status) ? status : "unknown";
}
function buildGateRows(input = {}) {
  const round = validRound(input.round);
  const format = normalizeFormat(input.format);
  const opponent = allyCode(input.opponentAllyCode);
  const truthGates = Array.isArray(input.truthGates) ? input.truthGates : [];
  const gateAt = (index) => gateStatus(truthGates[index]);
  const boardSource = clean(input.boardSource).toLowerCase();
  const boardCount = Math.max(0, Number(input.boardCount) || 0);
  return Object.freeze([
    Object.freeze({ id: "round", label: "Current round", status: round ? "pass" : "fail", detail: round ? `Round ${round}` : "Round unresolved" }),
    Object.freeze({ id: "format", label: "GAC format", status: format === "unknown" ? "warn" : "pass", detail: format.toUpperCase() }),
    Object.freeze({ id: "opponent", label: "Exact opponent", status: gateAt(0) !== "unknown" ? gateAt(0) : opponent ? "pass" : "fail", detail: opponent || "Opponent Ally Code unresolved" }),
    Object.freeze({ id: "mine-roster", label: "Your live roster", status: gateAt(1), detail: gateAt(1) === "pass" ? "Live roster loaded" : "Check Truth Gate" }),
    Object.freeze({ id: "opponent-roster", label: "Opponent live roster", status: gateAt(2), detail: gateAt(2) === "pass" ? "Live roster loaded" : "Check Truth Gate" }),
    Object.freeze({ id: "history", label: "Historical evidence", status: gateAt(3), detail: gateAt(3) === "pass" ? "Evidence loaded" : "Limited/unknown is allowed" }),
    Object.freeze({
      id: "board",
      label: "Current defense board",
      status: boardSource === "live" || boardSource === "verified-manual" || boardCount > 0 ? "pass" : boardSource === "manual-required" ? "warn" : gateAt(4),
      detail: boardSource ? `${boardSource}${boardCount ? ` · ${boardCount} squad${boardCount === 1 ? "" : "s"}` : ""}` : "Board source unresolved",
    }),
    Object.freeze({
      id: "actionable",
      label: "War Room actionable",
      status: input.actionable === true ? "pass" : opponent ? "warn" : "fail",
      detail: input.actionable === true ? clean(input.recommendationMode) || "Current-board planning ready" : "Waiting on one or more truth gates",
    }),
  ]);
}
function overallStatus(gates = []) {
  const rows = Array.isArray(gates) ? gates : [];
  if (rows.some((row) => row.status === "fail")) return "fail";
  if (rows.some((row) => row.status === "warn" || row.status === "unknown")) return "warn";
  return rows.length ? "pass" : "unknown";
}
function buildTestSnapshot(input = {}) {
  const gates = buildGateRows(input);
  return Object.freeze({
    version: TEST_CONSOLE_VERSION,
    capturedAt: clean(input.capturedAt) || new Date().toISOString(),
    myAllyCode: allyCode(input.myAllyCode),
    opponentAllyCode: allyCode(input.opponentAllyCode),
    round: validRound(input.round),
    format: normalizeFormat(input.format),
    boardSource: clean(input.boardSource) || "unknown",
    boardCount: Math.max(0, Number(input.boardCount) || 0),
    recommendationMode: clean(input.recommendationMode) || "unknown",
    actionable: input.actionable === true,
    truthNote: clean(input.truthNote),
    gates,
    status: overallStatus(gates),
  });
}
function buildTestReport(snapshot = {}) {
  const gates = Array.isArray(snapshot.gates) ? snapshot.gates : [];
  const lines = [
    `GAC LIVE TEST REPORT · ${clean(snapshot.version) || TEST_CONSOLE_VERSION}`,
    `Captured: ${clean(snapshot.capturedAt) || "unknown"}`,
    `My Ally Code: ${clean(snapshot.myAllyCode) || "unknown"}`,
    `Opponent Ally Code: ${clean(snapshot.opponentAllyCode) || "unknown"}`,
    `Round: ${snapshot.round ?? "unknown"}`,
    `Format: ${clean(snapshot.format) || "unknown"}`,
    `Board: ${clean(snapshot.boardSource) || "unknown"} · ${Number(snapshot.boardCount || 0)} known squads`,
    `Recommendation mode: ${clean(snapshot.recommendationMode) || "unknown"}`,
    `Actionable: ${snapshot.actionable === true ? "YES" : "NO"}`,
    `Overall: ${clean(snapshot.status).toUpperCase() || "UNKNOWN"}`,
    "Gates:",
    ...gates.map((row) => `- ${clean(row.status).toUpperCase()}: ${clean(row.label)} — ${clean(row.detail)}`),
  ];
  if (clean(snapshot.truthNote)) lines.push(`Truth note: ${clean(snapshot.truthNote)}`);
  lines.push("Truth boundary: this report describes what the app resolved; it does not infer hidden defenses, missing Datacrons, or unknown battle state.");
  return lines.join("\n");
}

export {
  TEST_CONSOLE_VERSION,
  allyCode,
  buildGateRows,
  buildTestReport,
  buildTestSnapshot,
  normalizeFormat,
  overallStatus,
};
