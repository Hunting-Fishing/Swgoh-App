const state = { requestId: 0, assignments: [], roster: null, busy: new Set() };
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}
function currentRound() { return validRound(byId("gacBracketRound")?.value); }

function injectStyles() {
  if (document.querySelector('link[data-gac-war-room="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-round-war-room.css?v=20260819-gacwar1";
  link.dataset.gacWarRoom = "true";
  document.head.append(link);
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function assignmentByDefense(assignments = []) {
  return new Map((Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => Number.isInteger(Number(assignment?.defenseId)))
    .map((assignment) => [Number(assignment.defenseId), assignment]));
}

function consumedBaseIds(assignments = []) {
  const ids = new Set();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of Array.isArray(attempt?.members) ? attempt.members : []) if (clean(id)) ids.add(clean(id));
    }
    if (["planned", "attempted"].includes(clean(assignment?.status).toLowerCase())) {
      for (const id of Array.isArray(assignment?.members) ? assignment.members : []) if (clean(id)) ids.add(clean(id));
    }
  }
  return Object.freeze([...ids]);
}

function rosterIndex(roster = {}) {
  return new Map((Array.isArray(roster?.units) ? roster.units : []).map((unit) => [clean(unit?.baseId), unit]));
}

function portrait(unit, fallback = "") {
  const name = clean(unit?.name || fallback) || "Unknown";
  const image = clean(unit?.image);
  return image
    ? `<span class="gac-live-unit" title="${escapeHtml(name)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`
    : `<span class="gac-live-unit" title="${escapeHtml(name)}"><span class="gac-live-unit-placeholder">${escapeHtml(name.slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}

function assignmentStatusLabel(assignment = {}) {
  const status = clean(assignment?.status).toLowerCase();
  if (status === "planned") return "LOCKED PLAN";
  if (status === "attempted") return "ATTEMPT IN PROGRESS";
  if (status === "win") return "CLEARED";
  if (status === "loss") return "FAILED · REPLAN";
  if (status === "abandoned") return "PLAN RELEASED";
  return "UNPLANNED";
}

function attemptHistoryHtml(assignment = {}) {
  const attempts = Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : [];
  if (!attempts.length) return "";
  return `<div class="gac-war-attempt-log"><strong>ATTEMPT HISTORY</strong>${attempts.map((attempt, index) => {
    const members = Array.isArray(attempt?.members) ? attempt.members : [];
    const banners = attempt?.banners == null ? "" : ` · ${number.format(Number(attempt.banners))} banners`;
    return `<span>${number.format(index + 1)} · ${escapeHtml(clean(attempt?.status).toUpperCase())}${banners} · ${escapeHtml(members.join(" / "))}</span>`;
  }).join("")}</div>`;
}

function lockedCounterHtml(assignment, index) {
  const lane = assignment?.members?.length
    ? assignment.members.map((id) => portrait(index.get(clean(id)), id)).join("")
    : `<div class="gac-board-no-counter">Locked plan has no usable attacker list.</div>`;
  return lane;
}

function recommendationPayload(card) {
  const defenseId = Number(card?.dataset?.defenseId);
  const members = clean(card?.dataset?.recommendedAttackerMembers).split(",").map(clean).filter(Boolean);
  const leaderBaseId = clean(card?.dataset?.recommendedAttackerLeader);
  const datacronId = clean(card?.dataset?.recommendedDatacronId);
  if (!Number.isInteger(defenseId) || defenseId <= 0 || !members.length || !leaderBaseId) return null;
  return Object.freeze({ defenseId, members: Object.freeze(members), leaderBaseId, datacronId });
}

function controlsHtml(assignment, hasRecommendation) {
  const status = clean(assignment?.status).toLowerCase();
  if (!assignment || ["loss", "abandoned"].includes(status)) {
    return hasRecommendation
      ? `<button type="button" class="gac-war-action is-lock" data-war-action="lock">${status === "loss" ? "Lock Retry Counter" : "Lock Counter"}</button>`
      : `<span class="gac-war-no-action">No remaining recommendation to lock.</span>`;
  }
  if (status === "planned") {
    return `<button type="button" class="gac-war-action" data-war-action="attempt">Mark Attempt</button><button type="button" class="gac-war-action is-muted" data-war-action="abandoned">Release Plan</button>`;
  }
  if (status === "attempted") {
    return `<label class="gac-war-banners">Banners <input type="number" min="0" step="1" data-war-banners placeholder="0"></label><button type="button" class="gac-war-action is-win" data-war-action="win">Win</button><button type="button" class="gac-war-action is-loss" data-war-action="loss">Loss</button>`;
  }
  if (status === "win") return `<span class="gac-war-cleared">DEFENSE CLEARED${assignment?.banners == null ? "" : ` · ${number.format(assignment.banners)} banners`}</span>`;
  return "";
}

function decorateCards() {
  const cards = [...document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")];
  if (!cards.length) return;
  const assignments = assignmentByDefense(state.assignments);
  const units = rosterIndex(state.roster);
  for (const card of cards) {
    card.querySelector(".gac-war-room")?.remove();
    card.classList.remove("gac-war-is-cleared", "gac-war-is-locked", "gac-war-is-loss");
    const defenseId = Number(card.dataset.defenseId);
    const assignment = assignments.get(defenseId) || null;
    const status = clean(assignment?.status).toLowerCase();
    const recommendation = recommendationPayload(card);
    const lane = card.querySelector(".gac-war-room-counter-lane .gac-board-units");
    if (assignment && ["planned", "attempted"].includes(status) && lane) {
      lane.innerHTML = lockedCounterHtml(assignment, units);
      card.classList.add("gac-war-is-locked");
    } else if (assignment && status === "win" && lane) {
      lane.innerHTML = `<div class="gac-war-cleared-lane">✓ CLEARED</div>`;
      card.classList.add("gac-war-is-cleared");
    } else if (assignment && status === "loss") {
      card.classList.add("gac-war-is-loss");
    }

    const panel = document.createElement("div");
    panel.className = "gac-war-room";
    panel.dataset.assignmentId = assignment?.id == null ? "" : String(assignment.id);
    panel.innerHTML = `
      <div class="gac-war-room-head"><strong>ROUND WAR ROOM</strong><span>${escapeHtml(assignmentStatusLabel(assignment))}</span></div>
      ${assignment ? `<small>Attempts ${number.format(Number(assignment.attemptCount || 0))}${assignment?.datacron?.id ? ` · DC ${escapeHtml(clean(assignment.datacron.id).slice(-8))}` : ""}</small>` : `<small>Locking a counter reserves every attacker in that squad for this defense.</small>`}
      ${attemptHistoryHtml(assignment)}
      <div class="gac-war-actions">${controlsHtml(assignment, Boolean(recommendation))}</div>`;
    card.append(panel);
  }
}

async function refresh() {
  const mine = allyCode(byId("allyCode")?.value);
  const round = currentRound();
  if (!/^\d{9}$/.test(mine) || !round) return;
  const requestId = ++state.requestId;
  try {
    const [warRoom, roster] = await Promise.all([
      fetchJson(`/api/gac/attack-plan/${mine}?round=${round}`),
      fetchJson(`/api/player/${mine}`),
    ]);
    if (requestId !== state.requestId) return;
    state.assignments = Array.isArray(warRoom?.assignments) ? warRoom.assignments : [];
    state.roster = roster;
    decorateCards();
    const banner = byId("gacSavedBoardBanner");
    if (banner) banner.dataset.warRoomConsumed = String(consumedBaseIds(state.assignments).length);
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (![401, 409].includes(Number(error?.status))) console.warn("GAC war room unavailable", error);
  }
}

async function lockRecommendation(card) {
  const mine = allyCode(byId("allyCode")?.value);
  const round = currentRound();
  const payload = recommendationPayload(card);
  if (!mine || !round || !payload) return;
  const key = `lock:${payload.defenseId}`;
  if (state.busy.has(key)) return;
  state.busy.add(key);
  try {
    await fetchJson(`/api/gac/attack-plan/${mine}`, {
      method: "POST",
      body: JSON.stringify({ ...payload, round }),
    });
    window.dispatchEvent(new CustomEvent("gac-war-room-updated"));
    await refresh();
  } finally {
    state.busy.delete(key);
  }
}

async function updateAssignment(card, status) {
  const mine = allyCode(byId("allyCode")?.value);
  const round = currentRound();
  const assignmentId = Number(card.querySelector(".gac-war-room")?.dataset?.assignmentId);
  if (!mine || !round || !Number.isInteger(assignmentId) || assignmentId <= 0) return;
  const key = `status:${assignmentId}`;
  if (state.busy.has(key)) return;
  state.busy.add(key);
  const bannerInput = card.querySelector("[data-war-banners]");
  const banners = bannerInput?.value === "" || bannerInput?.value == null ? null : Number(bannerInput.value);
  try {
    await fetchJson(`/api/gac/attack-plan/${mine}`, {
      method: "PATCH",
      body: JSON.stringify({ id: assignmentId, status, banners, round }),
    });
    window.dispatchEvent(new CustomEvent("gac-war-room-updated"));
    await refresh();
  } finally {
    state.busy.delete(key);
  }
}

function bindActions() {
  const grid = byId("gacBoardPlannerGrid");
  if (!grid || grid.dataset.warRoomBound === "true") return false;
  grid.dataset.warRoomBound = "true";
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-war-action]");
    if (!button) return;
    const card = button.closest(".gac-saved-board-card");
    if (!card) return;
    const action = clean(button.dataset.warAction);
    if (action === "lock") void lockRecommendation(card).catch((error) => console.warn("Could not lock GAC counter", error));
    else void updateAssignment(card, action).catch((error) => console.warn("Could not update GAC war room", error));
  });
  return true;
}

function ensureMounted() {
  injectStyles();
  bindActions();
  void refresh();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("gac-saved-board-rendered", () => void refresh());
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
}

export {
  assignmentByDefense,
  assignmentStatusLabel,
  consumedBaseIds,
  recommendationPayload,
};
