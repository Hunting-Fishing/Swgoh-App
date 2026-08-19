const state = { requestId: 0, timer: null };

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function validStatus(value) {
  const status = clean(value).toLowerCase();
  return new Set(["planned", "attempted", "win", "loss", "abandoned"]).has(status) ? status : "";
}
function assignmentByDefense(assignments = []) {
  return new Map((Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => Number.isInteger(Number(assignment?.defenseId)) && Number(assignment.defenseId) > 0)
    .map((assignment) => [Number(assignment.defenseId), assignment]));
}
function warMapStatus(assignment = null) {
  const status = validStatus(assignment?.status);
  const attempts = Math.max(0, Number(assignment?.attemptCount || 0));
  const history = Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : [];
  const failedAttempts = history.filter((attempt) => clean(attempt?.status).toLowerCase() === "loss").length;
  const wins = history.filter((attempt) => clean(attempt?.status).toLowerCase() === "win").length;
  if (!assignment || !status) return Object.freeze({ key: "unplanned", label: "UNPLANNED", attempts: 0, failedAttempts: 0, tone: "neutral" });
  if (status === "planned") return Object.freeze({ key: "planned", label: failedAttempts ? "RETRY LOCKED" : "COUNTER LOCKED", attempts, failedAttempts, tone: "locked" });
  if (status === "attempted") return Object.freeze({ key: "attempted", label: "ATTEMPT LIVE", attempts, failedAttempts, tone: "active" });
  if (status === "win") return Object.freeze({ key: "win", label: "CLEARED", attempts: Math.max(attempts, wins), failedAttempts, tone: "win" });
  if (status === "loss") return Object.freeze({ key: "loss", label: "FAILED · REPLAN", attempts, failedAttempts: Math.max(failedAttempts, 1), tone: "loss" });
  return Object.freeze({ key: "abandoned", label: "PLAN RELEASED", attempts, failedAttempts, tone: "neutral" });
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function injectStyles() {
  if (document.querySelector('style[data-gac-war-map-status="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacWarMapStatus = "true";
  style.textContent = `
    .gac-saved-board-tile { position:relative; }
    .gac-war-map-badge { justify-self:end; align-self:start; padding:.16rem .32rem; border:1px solid rgba(255,255,255,.12); border-radius:999px; font-size:.48rem; font-weight:900; letter-spacing:.06em; white-space:nowrap; }
    .gac-war-map-badge.is-neutral { color:#8490a0; background:rgba(255,255,255,.035); }
    .gac-war-map-badge.is-locked { color:#9edbff; border-color:rgba(99,192,245,.3); background:rgba(36,119,169,.13); }
    .gac-war-map-badge.is-active { color:#ffd876; border-color:rgba(242,193,75,.36); background:rgba(166,116,25,.14); }
    .gac-war-map-badge.is-win { color:#8cf0b4; border-color:rgba(92,222,146,.34); background:rgba(41,142,84,.14); }
    .gac-war-map-badge.is-loss { color:#ff9e9e; border-color:rgba(239,92,92,.35); background:rgba(145,43,43,.16); }
    .gac-war-map-attempts { grid-column:2/-1; color:#6f7e91; font-size:.49rem; }
    .gac-saved-board-tile.is-war-cleared { border-color:rgba(92,222,146,.31); background:rgba(41,142,84,.08); }
    .gac-saved-board-tile.is-war-active { border-color:rgba(242,193,75,.3); }
    .gac-saved-board-tile.is-war-failed { border-color:rgba(239,92,92,.3); background:rgba(145,43,43,.07); }
  `;
  document.head.append(style);
}

function decorate(assignments = []) {
  injectStyles();
  const index = assignmentByDefense(assignments);
  const tiles = [...document.querySelectorAll("#gacSavedBoardMap [data-saved-defense-id]")];
  for (const tile of tiles) {
    tile.querySelector(".gac-war-map-badge")?.remove();
    tile.querySelector(".gac-war-map-attempts")?.remove();
    tile.classList.remove("is-war-cleared", "is-war-active", "is-war-failed");
    const assignment = index.get(Number(tile.dataset.savedDefenseId)) || null;
    const status = warMapStatus(assignment);
    const badge = document.createElement("span");
    badge.className = `gac-war-map-badge is-${status.tone}`;
    badge.textContent = status.label;
    tile.append(badge);
    if (status.key === "win") tile.classList.add("is-war-cleared");
    if (status.key === "attempted") tile.classList.add("is-war-active");
    if (status.key === "loss") tile.classList.add("is-war-failed");
    if (status.attempts || status.failedAttempts) {
      const line = document.createElement("span");
      line.className = "gac-war-map-attempts";
      line.textContent = `${status.attempts} attempt${status.attempts === 1 ? "" : "s"}${status.failedAttempts ? ` · ${status.failedAttempts} failed` : ""}`;
      tile.append(line);
    }
  }
}

async function refresh() {
  const mine = allyCode(byId("allyCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  if (!/^\d{9}$/.test(mine) || !round) {
    decorate([]);
    return;
  }
  const requestId = ++state.requestId;
  try {
    const body = await fetchJson(`/api/gac/attack-plan/${mine}?round=${round}`);
    if (requestId !== state.requestId) return;
    decorate(Array.isArray(body?.assignments) ? body.assignments : []);
  } catch (error) {
    if (requestId !== state.requestId) return;
    decorate([]);
    if (![401, 409].includes(Number(error?.status))) console.warn("GAC War Map status unavailable", error);
  }
}

function schedule(delay = 180) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(), Math.max(0, delay));
}

function bind() {
  if (document.documentElement.dataset.gacWarMapStatusBound === "true") return;
  document.documentElement.dataset.gacWarMapStatusBound = "true";
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacBracketRound"].includes(event.target?.id)) schedule(160);
  });
  window.addEventListener("gac-war-room-updated", () => schedule(80));
  window.addEventListener("gac-saved-board-rendered", () => schedule(80));
  window.addEventListener("gac-board-evidence-updated", () => schedule(120));
  window.addEventListener("hashchange", () => schedule(180));
}

function addedBoardContent(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes || []) {
      if (!(node instanceof Element)) continue;
      if (node.id === "gacSavedBoardMap" || node.matches?.("[data-saved-defense-id]") || node.querySelector?.("[data-saved-defense-id]")) return true;
    }
  }
  return false;
}

function ensureMounted() {
  bind();
  schedule(120);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  new MutationObserver((mutations) => {
    if (addedBoardContent(mutations)) schedule(80);
  }).observe(document.documentElement, { childList: true, subtree: true });
}

export { addedBoardContent, assignmentByDefense, validStatus, warMapStatus };
