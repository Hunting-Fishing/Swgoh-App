import { buildTestReport, buildTestSnapshot } from "./gac-live-test-console-model.js";

let latestDetail = {};
let timer = null;

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return clean(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function gateState(element) {
  if (!element) return "unknown";
  if (element.classList.contains("is-ready")) return "pass";
  if (element.classList.contains("is-warning")) return "warn";
  if (element.classList.contains("is-blocked")) return "fail";
  return "unknown";
}
function truthGateStates() {
  return [...document.querySelectorAll("#gacLiveTruthDashboard .gac-truth-gate")].slice(0, 5).map(gateState);
}
function currentRound() {
  const value = Number(byId("gacBracketRound")?.value || 0);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}
function currentFormat() {
  return Number(byId("gacMode")?.value) === 3 ? "3v3" : Number(byId("gacMode")?.value) === 5 ? "5v5" : "unknown";
}
function truthNote() {
  return clean(document.querySelector("#gacLiveTruthDashboard .gac-truth-policy p")?.textContent);
}
function snapshot() {
  return buildTestSnapshot({
    capturedAt: new Date().toISOString(),
    myAllyCode: allyCode(byId("allyCode")?.value),
    opponentAllyCode: latestDetail.opponentAllyCode || allyCode(byId("gacOpponentCode")?.value),
    round: currentRound(),
    format: currentFormat(),
    boardSource: latestDetail.boardSource,
    boardCount: latestDetail.boardCount,
    recommendationMode: latestDetail.recommendationMode,
    actionable: latestDetail.actionable === true || document.documentElement.dataset.gacCurrentMatchupReady === "true",
    truthGates: truthGateStates(),
    truthNote: truthNote(),
  });
}
function statusLabel(status) {
  return status === "pass" ? "READY TO TEST" : status === "fail" ? "BLOCKED" : "TEST WITH WARNINGS";
}
function statusIcon(status) {
  return status === "pass" ? "✓" : status === "fail" ? "✕" : status === "warn" ? "!" : "?";
}
function ensureStyles() {
  if (document.querySelector('link[data-gac-live-test-console="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-live-test-console.css?v=20260820-b01t1";
  link.dataset.gacLiveTestConsole = "true";
  document.head.append(link);
}
function ensurePanel() {
  const host = document.querySelector(".gac-live-matchup-panel");
  if (!host) return null;
  let panel = byId("gacLiveTestConsole");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "gacLiveTestConsole";
  panel.className = "gac-live-test-console";
  const truth = byId("gacLiveTruthDashboard");
  if (truth?.parentElement === host) truth.insertAdjacentElement("afterend", panel);
  else host.prepend(panel);
  return panel;
}
async function copyReport(report, button) {
  try {
    await navigator.clipboard.writeText(report);
    if (button) {
      const original = button.textContent;
      button.textContent = "Copied Test Report";
      setTimeout(() => { button.textContent = original; }, 1600);
    }
  } catch {
    const output = byId("gacLiveTestReportText");
    if (output) {
      output.hidden = false;
      output.value = report;
      output.focus();
      output.select();
    }
  }
}
function render() {
  ensureStyles();
  const panel = ensurePanel();
  if (!panel) return false;
  const model = snapshot();
  panel.dataset.status = model.status;
  const gateHtml = model.gates.map((gate) => `
    <article class="gac-live-test-gate is-${escapeHtml(gate.status)}">
      <b>${statusIcon(gate.status)}</b>
      <div><strong>${escapeHtml(gate.label)}</strong><span>${escapeHtml(gate.detail)}</span></div>
    </article>`).join("");
  panel.innerHTML = `
    <div class="gac-live-test-head">
      <div><span class="kicker">🧪 LIVE GAC TEST CONSOLE</span><h3>${escapeHtml(statusLabel(model.status))}</h3><p>B01 · T1 diagnostics. Compare these gates directly with what you see in-game.</p></div>
      <button id="gacCopyLiveTestReport" type="button">COPY TEST REPORT</button>
    </div>
    <div class="gac-live-test-context">
      <span><small>ROUND</small><strong>${model.round ?? "—"}</strong></span>
      <span><small>FORMAT</small><strong>${escapeHtml(model.format.toUpperCase())}</strong></span>
      <span><small>OPPONENT</small><strong>${escapeHtml(model.opponentAllyCode || "UNRESOLVED")}</strong></span>
      <span><small>BOARD</small><strong>${escapeHtml(model.boardSource.toUpperCase())}</strong></span>
      <span><small>KNOWN SQUADS</small><strong>${model.boardCount}</strong></span>
    </div>
    <div class="gac-live-test-gates">${gateHtml}</div>
    <div class="gac-live-test-instructions">
      <strong>WHAT TO VERIFY IN GAME NOW</strong>
      <span>Opponent identity · 3v3/5v5 format · current round · roster ownership · every defense you manually save · Datacron state.</span>
      <small>If anything differs, copy this report and send it with a screenshot of the exact in-game screen. Hidden defenses and unknown state remain intentionally gated.</small>
    </div>
    <textarea id="gacLiveTestReportText" hidden readonly></textarea>`;
  const report = buildTestReport(model);
  byId("gacCopyLiveTestReport")?.addEventListener("click", (event) => void copyReport(report, event.currentTarget));
  return true;
}
function schedule(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(render, delay);
}
function mount() {
  ensureStyles();
  window.addEventListener("gac-live-truth-updated", (event) => {
    latestDetail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    schedule(20);
  });
  window.addEventListener("gac-board-evidence-updated", () => schedule(60));
  window.addEventListener("gac-current-opponent-updated", () => schedule(60));
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacOpponentCode", "gacBracketRound", "gacMode"].includes(event.target?.id)) schedule(60);
  });
  document.addEventListener("DOMContentLoaded", () => schedule(180), { once: true });
  new MutationObserver(() => {
    if (!byId("gacLiveTestConsole") && byId("gacLiveTruthDashboard")) schedule(100);
  }).observe(document.documentElement, { childList: true, subtree: true });
  schedule(220);
}

if (typeof window !== "undefined" && typeof document !== "undefined") mount();

export { currentFormat, currentRound, gateState, snapshot, truthGateStates };
