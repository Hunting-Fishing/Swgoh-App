const state = { busy: new Set(), archived: new Set() };

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function verificationKey(assignmentId, attemptIndex) {
  return `${Number(assignmentId) || 0}:${Number(attemptIndex) || 0}`;
}
function verificationPayload(assignmentId, attemptIndex, round) {
  const id = Number(assignmentId);
  const index = Number(attemptIndex);
  const roundNumber = validRound(round);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(index) || index < 0 || !roundNumber) return null;
  return Object.freeze({ assignmentId: id, attemptIndex: index, round: roundNumber, confirm: true });
}

async function postJson(pathname, payload) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function injectStyles() {
  if (document.querySelector('style[data-gac-verified-battle-ui="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacVerifiedBattleUi = "true";
  style.textContent = `
    .gac-war-attempt-log span[data-gac-history-attempt] { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.55rem; align-items:center; }
    .gac-verify-battle { border:1px solid rgba(126,214,165,.4); border-radius:8px; padding:.34rem .48rem; background:rgba(48,167,105,.12); color:#a9f1c8; font-size:.68rem; font-weight:800; cursor:pointer; white-space:nowrap; }
    .gac-verify-battle:hover { background:rgba(48,167,105,.22); }
    .gac-verify-battle:disabled { opacity:.6; cursor:default; }
    .gac-verify-battle.is-archived { border-color:rgba(126,214,165,.22); background:rgba(48,167,105,.08); color:#7edca6; }
    .gac-verified-history-note { margin-top:.34rem; color:#7f8da1; font-size:.66rem; line-height:1.35; }
  `;
  document.head.append(style);
}

function attemptOutcome(row) {
  const text = clean(row?.textContent).toUpperCase();
  if (text.includes("· WIN") || text.includes("WIN ·")) return "WIN";
  if (text.includes("· LOSS") || text.includes("LOSS ·")) return "LOSS";
  return "RESULT";
}

function buttonLabel(key, outcome) {
  if (state.archived.has(key)) return "Archived to History";
  if (state.busy.has(key)) return "Saving…";
  return `Confirm ${outcome} to History`;
}

async function verifyRow(row, assignmentId, attemptIndex) {
  const mine = allyCode(byId("allyCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  const payload = verificationPayload(assignmentId, attemptIndex, round);
  if (!/^\d{9}$/.test(mine) || !payload) return;
  const key = verificationKey(assignmentId, attemptIndex);
  if (state.busy.has(key) || state.archived.has(key)) return;
  const outcome = attemptOutcome(row);
  const accepted = window.confirm(
    `Confirm this ${outcome} as completed GAC history?\n\n` +
    "Command Center will archive the persisted War Room attempt exactly as recorded. This does not edit the result or guess missing battle data."
  );
  if (!accepted) return;

  state.busy.add(key);
  decorate();
  try {
    const result = await postJson(`/api/gac/verified-battle/${mine}`, payload);
    state.archived.add(key);
    const note = row.closest(".gac-war-room")?.querySelector(".gac-verified-history-note");
    if (note) note.textContent = result?.alreadyVerified
      ? "This completed attempt was already archived. No duplicate history sample was created."
      : "Verified owner result archived as completed GAC history. It is historical evidence, not current hidden-board data.";
    window.dispatchEvent(new CustomEvent("gac-verified-battle-archived", { detail: { assignmentId, attemptIndex, round, battleKey: result?.battle?.battleKey || "" } }));
  } catch (error) {
    const note = row.closest(".gac-war-room")?.querySelector(".gac-verified-history-note");
    if (note) {
      if (Number(error?.status) === 401) note.textContent = "Sign in with the verified owner account before archiving battle history.";
      else note.textContent = `Result not archived: ${error?.message || "request failed"}`;
    }
  } finally {
    state.busy.delete(key);
    decorate();
  }
}

function decoratePanel(panel) {
  const assignmentId = Number(panel?.dataset?.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return;
  const log = panel.querySelector(".gac-war-attempt-log");
  if (!log) return;
  const rows = [...log.querySelectorAll(":scope > span")];
  rows.forEach((row, attemptIndex) => {
    row.dataset.gacHistoryAttempt = String(attemptIndex);
    let button = row.querySelector(".gac-verify-battle");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "gac-verify-battle";
      button.addEventListener("click", () => void verifyRow(row, assignmentId, attemptIndex));
      row.append(button);
    }
    const key = verificationKey(assignmentId, attemptIndex);
    const archived = state.archived.has(key);
    button.textContent = buttonLabel(key, attemptOutcome(row));
    button.disabled = archived || state.busy.has(key);
    button.classList.toggle("is-archived", archived);
  });
  if (!panel.querySelector(".gac-verified-history-note")) {
    const note = document.createElement("div");
    note.className = "gac-verified-history-note";
    note.textContent = "Completed attempts enter history only after explicit verified-owner confirmation.";
    log.insertAdjacentElement("afterend", note);
  }
}

function decorate() {
  injectStyles();
  document.querySelectorAll("#gacBoardPlannerGrid .gac-war-room").forEach(decoratePanel);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  decorate();
  document.addEventListener("DOMContentLoaded", decorate, { once: true });
  window.addEventListener("gac-war-room-updated", () => setTimeout(decorate, 0));
  window.addEventListener("gac-saved-board-rendered", () => setTimeout(decorate, 0));
  new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
}

export { attemptOutcome, verificationKey, verificationPayload };
