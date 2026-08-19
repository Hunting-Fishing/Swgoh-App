const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function uniquePositiveIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}
function validStatus(value) {
  const status = clean(value).toLowerCase();
  return new Set(["planned", "attempted", "win", "loss", "abandoned"]).has(status) ? status : "";
}
function attemptLog(assignment = {}) {
  return Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : [];
}
function assignmentIndex(assignments = []) {
  const index = new Map();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    const defenseId = Number(assignment?.defenseId);
    if (!Number.isInteger(defenseId) || defenseId <= 0) continue;
    index.set(defenseId, assignment);
  }
  return index;
}

function summarizeRoundProgress(assignments = [], defenseIds = []) {
  const ids = uniquePositiveIds(defenseIds);
  const index = assignmentIndex(assignments);
  const unavailableAttackers = new Set();
  let cleared = 0;
  let locked = 0;
  let active = 0;
  let failedOpen = 0;
  let released = 0;
  let unplanned = 0;
  let attempts = 0;
  let failedAttempts = 0;
  let trackedBanners = 0;
  let bannerWins = 0;

  for (const defenseId of ids) {
    const assignment = index.get(defenseId) || null;
    if (!assignment) {
      unplanned += 1;
      continue;
    }
    const status = validStatus(assignment.status);
    if (status === "win") cleared += 1;
    else if (status === "planned") locked += 1;
    else if (status === "attempted") active += 1;
    else if (status === "loss") failedOpen += 1;
    else if (status === "abandoned") released += 1;
    else unplanned += 1;

    attempts += Math.max(0, Math.floor(finite(assignment.attemptCount)));
    for (const attempt of attemptLog(assignment)) {
      const attemptStatus = clean(attempt?.status).toLowerCase();
      if (attemptStatus === "loss") failedAttempts += 1;
      if (attemptStatus === "win") {
        const banners = attempt?.banners === null || attempt?.banners === undefined || attempt?.banners === ""
          ? null
          : finite(attempt.banners, null);
        if (banners !== null) {
          trackedBanners += Math.max(0, banners);
          bannerWins += 1;
        }
      }
      for (const member of Array.isArray(attempt?.members) ? attempt.members : []) {
        if (clean(member)) unavailableAttackers.add(clean(member));
      }
    }
    if (["planned", "attempted"].includes(status)) {
      for (const member of Array.isArray(assignment?.members) ? assignment.members : []) {
        if (clean(member)) unavailableAttackers.add(clean(member));
      }
    }
  }

  const totalDefenses = ids.length;
  const open = Math.max(0, totalDefenses - cleared);
  const completionRate = totalDefenses ? cleared / totalDefenses : 0;
  return Object.freeze({
    totalDefenses,
    cleared,
    open,
    locked,
    active,
    failedOpen,
    released,
    unplanned,
    attempts,
    failedAttempts,
    trackedBanners,
    bannerWins,
    unavailableAttackers: unavailableAttackers.size,
    completionRate,
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.querySelector('style[data-gac-round-progress="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacRoundProgress = "true";
  style.textContent = `
    .gac-round-progress { margin:.55rem 0; padding:.7rem; border:1px solid rgba(113,198,255,.22); border-radius:.72rem; background:linear-gradient(180deg,rgba(14,31,48,.78),rgba(8,18,31,.84)); }
    .gac-round-progress-head { display:flex; justify-content:space-between; gap:.8rem; align-items:flex-start; }
    .gac-round-progress-head strong { display:block; color:#d9f1ff; font-size:.72rem; letter-spacing:.065em; }
    .gac-round-progress-head span { color:#6f8298; font-size:.54rem; line-height:1.35; text-align:right; }
    .gac-round-progress-track { height:7px; margin:.55rem 0 .62rem; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.06); }
    .gac-round-progress-track > span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#3aa873,#83e0ad); transition:width .2s ease; }
    .gac-round-progress-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.38rem; }
    .gac-round-progress-stat { min-width:0; padding:.4rem .45rem; border:1px solid rgba(255,255,255,.07); border-radius:.5rem; background:rgba(255,255,255,.025); }
    .gac-round-progress-stat b { display:block; color:#dce8f3; font-size:.76rem; }
    .gac-round-progress-stat span { display:block; margin-top:.08rem; color:#718095; font-size:.5rem; letter-spacing:.045em; }
    .gac-round-progress-stat.is-good b { color:#86e6ae; }
    .gac-round-progress-stat.is-warn b { color:#ffd276; }
    .gac-round-progress-stat.is-risk b { color:#ff9a9a; }
    .gac-round-progress-foot { margin-top:.48rem; color:#617188; font-size:.52rem; line-height:1.4; }
    @media(max-width:760px){.gac-round-progress-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.gac-round-progress-head{flex-direction:column}.gac-round-progress-head span{text-align:left}}
  `;
  document.head.append(style);
}

function mount() {
  const map = document.getElementById("gacSavedBoardMap");
  if (!map) return null;
  let panel = document.getElementById("gacRoundProgress");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "gacRoundProgress";
    panel.className = "gac-round-progress";
    map.insertAdjacentElement("beforebegin", panel);
  }
  return panel;
}

function stat(value, label, tone = "") {
  return `<div class="gac-round-progress-stat${tone ? ` is-${escapeHtml(tone)}` : ""}"><b>${escapeHtml(number.format(value))}</b><span>${escapeHtml(label)}</span></div>`;
}

function renderProgress(model, round = null) {
  injectStyles();
  const panel = mount();
  if (!panel) return;
  const pct = Math.max(0, Math.min(100, Math.round(model.completionRate * 100)));
  const roundLabel = Number.isInteger(Number(round)) ? `ROUND ${Number(round)}` : "CURRENT ROUND";
  const bannerLabel = model.bannerWins
    ? `${number.format(model.trackedBanners)} banners from ${number.format(model.bannerWins)} owner-entered win${model.bannerWins === 1 ? "" : "s"}`
    : "No owner-entered win banners yet";
  panel.innerHTML = `
    <div class="gac-round-progress-head">
      <div><strong>WAR ROOM TRACKED · ${escapeHtml(roundLabel)}</strong></div>
      <span>Operational tracker only · not the official GAC match score</span>
    </div>
    <div class="gac-round-progress-track" title="${pct}% of saved defenses cleared"><span style="width:${pct}%"></span></div>
    <div class="gac-round-progress-grid">
      ${stat(model.cleared, `CLEARED / ${model.totalDefenses} SAVED`, "good")}
      ${stat(model.open, "OPEN DEFENSES")}
      ${stat(model.locked, "COUNTERS LOCKED")}
      ${stat(model.active, "ATTEMPT LIVE", model.active ? "warn" : "")}
      ${stat(model.failedOpen, "FAILED · REPLAN", model.failedOpen ? "risk" : "")}
      ${stat(model.attempts, "TOTAL ATTEMPTS")}
      ${stat(model.failedAttempts, "FAILED ATTEMPTS", model.failedAttempts ? "risk" : "")}
      ${stat(model.unavailableAttackers, "ATTACKERS RESERVED / USED")}
    </div>
    <div class="gac-round-progress-foot">${escapeHtml(bannerLabel)} · ${number.format(model.unplanned)} unplanned · ${number.format(model.released)} released plan${model.released === 1 ? "" : "s"}. Only saved defenses and verified-owner War Room state are counted.</div>`;
}

function handleWarMapState(event) {
  const detail = event?.detail || {};
  const model = summarizeRoundProgress(detail.assignments, detail.defenseIds);
  renderProgress(model, detail.round);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("gac-war-map-state", handleWarMapState);
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
}

export { assignmentIndex, summarizeRoundProgress, uniquePositiveIds, validStatus };
