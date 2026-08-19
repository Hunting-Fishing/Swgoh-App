import { loadEligibilityContext } from "./gac-datacron-eligibility.js";
import { assessDefenseDatacron, exposureLabel } from "./gac-defense-datacron-risk.js";

const state = {
  opponentCode: "",
  roster: null,
  selectedKey: "",
  assessment: null,
  savedDefenses: [],
  requestId: 0,
  saveBusy: false,
};

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.querySelector('link[data-gac-defense-datacron-risk="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-defense-datacron-risk.css?v=20260819-gacdefdc2";
  link.dataset.gacDefenseDatacronRisk = "true";
  document.head.append(link);
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

async function postJson(pathname, payload) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function datacrons() {
  return Array.isArray(state.roster?.datacrons) ? state.roster.datacrons : null;
}

function datacronKey(datacron, index) {
  const id = clean(datacron?.id);
  return id ? `id:${id}` : `index:${index}`;
}

function selectedDatacron() {
  const values = datacrons();
  if (!Array.isArray(values) || !state.selectedKey) return null;
  return values.find((datacron, index) => datacronKey(datacron, index) === state.selectedKey) || null;
}

function optionLabel(datacron, index) {
  const level = Number.isFinite(Number(datacron?.level)) ? Number(datacron.level) : (Array.isArray(datacron?.affixes) ? datacron.affixes.length : 0);
  const setId = clean(datacron?.setId) || "?";
  const abilityNames = [...new Set((Array.isArray(datacron?.affixes) ? datacron.affixes : [])
    .filter((affix) => affix?.abilityTextResolved === true && clean(affix?.abilityName))
    .map((affix) => clean(affix.abilityName)))].slice(0, 2);
  const identity = clean(datacron?.id) ? ` · ${clean(datacron.id).slice(-8)}` : ` · inventory ${index + 1}`;
  return `L${level} · Set ${setId}${abilityNames.length ? ` · ${abilityNames.join(" / ")}` : ""}${identity}`;
}

function selectedMemberIds() {
  return [...document.querySelectorAll('#gacDefensePicker input[type="checkbox"]:checked')]
    .map((input) => clean(input.value))
    .filter(Boolean);
}

function selectedDefenseSquad() {
  if (!state.roster || !Array.isArray(state.roster?.units)) return [];
  const selectedIds = new Set(selectedMemberIds());
  const units = state.roster.units.filter((unit) => selectedIds.has(clean(unit?.baseId)));
  const leaderId = clean(byId("gacDefenseLeader")?.value);
  const leader = units.find((unit) => clean(unit?.baseId) === leaderId);
  return leader ? [leader, ...units.filter((unit) => clean(unit?.baseId) !== leaderId)] : units;
}

function currentRound() {
  return validRound(byId("gacBracketRound")?.value);
}

function ensureControl() {
  const leader = byId("gacDefenseLeader");
  if (!leader) return null;
  let select = byId("gacDefenseDatacron");
  if (select) return select;

  const wrapper = document.createElement("div");
  wrapper.className = "gac-defense-datacron-control";
  wrapper.innerHTML = `
    <select id="gacDefenseDatacron" disabled>
      <option value="">Enemy Datacron · none confirmed</option>
    </select>
    <div class="gac-board-persistence-controls">
      <select id="gacSavedDefense" disabled><option value="">Saved defenses · none</option></select>
      <button id="gacSaveDefense" type="button" disabled>Save Current Defense</button>
    </div>
    <small id="gacDefenseDatacronStatus">Select only the exact datacron you can see assigned to this defense in-game.</small>`;
  leader.insertAdjacentElement("afterend", wrapper);
  select = byId("gacDefenseDatacron");
  select?.addEventListener("change", () => {
    state.selectedKey = clean(select.value);
    void recomputeAssessment();
    updateSaveState();
  });
  byId("gacSaveDefense")?.addEventListener("click", () => void saveCurrentDefense());
  byId("gacSavedDefense")?.addEventListener("change", (event) => {
    const id = clean(event.target.value);
    const defense = state.savedDefenses.find((entry) => String(entry?.id ?? "") === id);
    if (defense) restoreDefense(defense);
  });
  return select;
}

function renderSelector(message = "") {
  const select = ensureControl();
  const status = byId("gacDefenseDatacronStatus");
  if (!select) return;
  const values = datacrons();
  if (values === null) {
    select.disabled = true;
    select.innerHTML = `<option value="">Enemy Datacron · details unavailable</option>`;
    if (status) status.textContent = message || "The opponent live roster did not expose individual datacrons. No assignment is inferred.";
    updateSaveState();
    return;
  }
  if (!values.length) {
    select.disabled = true;
    select.innerHTML = `<option value="">Enemy Datacron · none returned</option>`;
    if (status) status.textContent = message || "No opponent datacron instances were returned by the live roster.";
    updateSaveState();
    return;
  }

  select.disabled = false;
  const options = values.map((datacron, index) => {
    const key = datacronKey(datacron, index);
    return `<option value="${escapeHtml(key)}" ${key === state.selectedKey ? "selected" : ""}>${escapeHtml(optionLabel(datacron, index))}</option>`;
  }).join("");
  select.innerHTML = `<option value="">Enemy Datacron · none confirmed</option>${options}`;
  if (!values.some((datacron, index) => datacronKey(datacron, index) === state.selectedKey)) state.selectedKey = "";
  select.value = state.selectedKey;
  if (status) status.textContent = message || "USER-CONFIRMED BOARD EVIDENCE · choose only the datacron visibly assigned to this defense.";
  updateSaveState();
}

function assessmentClass(assessment) {
  if (!assessment?.selected) return "is-unknown";
  if (assessment.known !== true) return "is-partial";
  if (assessment.squadSize > 0 && assessment.eligibleMembers === assessment.squadSize) return "is-full";
  return "is-partial";
}

function assessmentHtml(assessment) {
  if (!assessment?.selected) return "";
  const coverage = assessment.coverage == null
    ? "coverage unresolved"
    : `${assessment.eligibleMembers}/${assessment.squadSize} defenders receive ≥1 verified ability target`;
  const mechanics = Array.isArray(assessment.mechanics) ? assessment.mechanics : [];
  const mechanicHtml = mechanics.length
    ? `<div class="gac-enemy-datacron-mechanics">${mechanics.map((label) => `<b>${escapeHtml(label)}</b>`).join("")}</div>`
    : `<small>No official-text mechanics labels were resolved for this instance.</small>`;
  return `
    <div class="gac-enemy-datacron-risk ${assessmentClass(assessment)}">
      <div class="gac-enemy-datacron-head"><strong>${escapeHtml(exposureLabel(assessment))}</strong><span>USER CONFIRMED</span></div>
      <div>${escapeHtml(assessment.label)} · ${escapeHtml(coverage)}${assessment.leaderEligible === true ? " · leader eligible" : ""}</div>
      ${mechanicHtml}
      <small>This is board-condition evidence only. It does not modify the displayed historical win rate or invent a datacron power multiplier.</small>
    </div>`;
}

function decorateCounterCards() {
  const cards = [...document.querySelectorAll("#gacCounterGrid .gac-counter-card")];
  for (const card of cards) {
    card.querySelector(".gac-enemy-datacron-risk")?.remove();
    delete card.dataset.enemyDatacronId;
    if (!state.assessment?.selected) continue;
    if (state.assessment.datacronId) card.dataset.enemyDatacronId = state.assessment.datacronId;
    card.insertAdjacentHTML("beforeend", assessmentHtml(state.assessment));
  }
}

async function recomputeAssessment() {
  const token = ++state.requestId;
  const datacron = selectedDatacron();
  const squad = selectedDefenseSquad();
  if (!datacron) {
    state.assessment = null;
    decorateCounterCards();
    updateSaveState();
    return;
  }
  const status = byId("gacDefenseDatacronStatus");
  if (status) status.textContent = "Resolving exact target categories and relic gates…";
  try {
    const context = await loadEligibilityContext();
    if (token !== state.requestId) return;
    state.assessment = assessDefenseDatacron(datacron, squad, context);
    if (status) status.textContent = `${exposureLabel(state.assessment)} · ${state.assessment.eligibleMembers}/${state.assessment.squadSize} verified coverage · user-confirmed current board.`;
  } catch {
    if (token !== state.requestId) return;
    state.assessment = Object.freeze({
      selected: true,
      known: false,
      source: "user-confirmed-current-board",
      datacronId: clean(datacron?.id),
      label: optionLabel(datacron, 0),
      level: Number(datacron?.level || 0),
      squadSize: squad.length,
      eligibleMembers: 0,
      unknownMembers: squad.length,
      coverage: null,
      leaderEligible: null,
      mechanics: Object.freeze([]),
    });
    if (status) status.textContent = "Datacron assignment is confirmed, but catalog eligibility could not be resolved. No coverage is inferred.";
  }
  decorateCounterCards();
  updateSaveState();
}

function updateSaveState() {
  const button = byId("gacSaveDefense");
  if (!button) return;
  const size = Number(byId("gacMode")?.value) === 3 ? 3 : 5;
  const members = selectedMemberIds();
  const leader = clean(byId("gacDefenseLeader")?.value);
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  const ready = /^\d{9}$/.test(mine) && /^\d{9}$/.test(opponent) && Boolean(currentRound()) && members.length === size && members.includes(leader);
  button.disabled = state.saveBusy || !ready;
  button.textContent = state.saveBusy ? "Saving Defense…" : "Save Current Defense";
}

function savedDefenseLabel(defense, index) {
  const unitIndex = new Map((state.roster?.units || []).map((unit) => [clean(unit?.baseId), clean(unit?.name)]));
  const leader = unitIndex.get(clean(defense?.leaderBaseId)) || clean(defense?.leaderBaseId) || `Defense ${index + 1}`;
  const dc = clean(defense?.datacron?.id) ? ` · DC L${Number(defense?.datacron?.level || 0)}` : "";
  const zone = clean(defense?.zone) ? ` · ${clean(defense.zone)}` : "";
  return `${leader}${dc}${zone}`;
}

function renderSavedDefenses(selectedId = "") {
  const select = byId("gacSavedDefense");
  if (!select) return;
  if (!state.savedDefenses.length) {
    select.disabled = true;
    select.innerHTML = `<option value="">Saved defenses · none this round</option>`;
    return;
  }
  select.disabled = false;
  select.innerHTML = `<option value="">Saved defenses · select</option>${state.savedDefenses.map((defense, index) => {
    const id = String(defense?.id ?? "");
    return `<option value="${escapeHtml(id)}" ${id && id === String(selectedId) ? "selected" : ""}>${escapeHtml(savedDefenseLabel(defense, index))}</option>`;
  }).join("")}`;
}

function restoreDefense(defense) {
  const size = Array.isArray(defense?.members) && defense.members.length === 3 ? 3 : 5;
  const mode = byId("gacMode");
  if (mode && Number(mode.value) !== size) {
    mode.value = String(size);
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const selected = new Set((defense?.members || []).map(clean));
  const inputs = [...document.querySelectorAll('#gacDefensePicker input[type="checkbox"]')];
  for (const input of inputs) {
    const shouldCheck = selected.has(clean(input.value));
    if (input.checked === shouldCheck) continue;
    input.checked = shouldCheck;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const leader = byId("gacDefenseLeader");
  if (leader && defense?.leaderBaseId) {
    leader.value = clean(defense.leaderBaseId);
    leader.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const datacronId = clean(defense?.datacron?.id);
  const values = datacrons();
  const matchIndex = Array.isArray(values) ? values.findIndex((datacron) => clean(datacron?.id) === datacronId) : -1;
  state.selectedKey = matchIndex >= 0 ? datacronKey(values[matchIndex], matchIndex) : "";
  const dcSelect = byId("gacDefenseDatacron");
  if (dcSelect) dcSelect.value = state.selectedKey;
  const status = byId("gacDefenseDatacronStatus");
  if (status) {
    status.textContent = datacronId && matchIndex < 0
      ? "Saved defense restored. Its saved datacron is not present in the opponent's current live inventory, so the assignment was not re-selected."
      : "Saved current-round defense restored from verified owner evidence.";
  }
  void recomputeAssessment();
  renderSavedDefenses(defense?.id);
}

async function loadSavedDefenses() {
  const mine = allyCode(byId("allyCode")?.value);
  const round = currentRound();
  if (!/^\d{9}$/.test(mine) || !round) {
    state.savedDefenses = [];
    renderSavedDefenses();
    return;
  }
  try {
    const body = await fetchJson(`/api/gac/current-board/${mine}/defense?round=${round}`);
    const opponent = allyCode(byId("gacOpponentCode")?.value);
    if (opponent && allyCode(body?.opponent?.allyCode) !== opponent) return;
    state.savedDefenses = Array.isArray(body?.defenses) ? body.defenses : [];
    renderSavedDefenses();
  } catch (error) {
    state.savedDefenses = [];
    renderSavedDefenses();
    if (![401, 409].includes(Number(error?.status))) {
      const status = byId("gacDefenseDatacronStatus");
      if (status) status.textContent = `Saved board evidence unavailable: ${error?.message || "request failed"}`;
    }
  }
}

async function saveCurrentDefense() {
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  const round = currentRound();
  const size = Number(byId("gacMode")?.value) === 3 ? 3 : 5;
  const members = selectedMemberIds();
  const leaderBaseId = clean(byId("gacDefenseLeader")?.value);
  const datacron = selectedDatacron();
  if (!mine || !opponent || !round || members.length !== size || !members.includes(leaderBaseId)) return;

  state.saveBusy = true;
  updateSaveState();
  const status = byId("gacDefenseDatacronStatus");
  if (status) status.textContent = "Validating current opponent roster and saving board observation…";
  try {
    const result = await postJson(`/api/gac/current-board/${mine}/defense`, {
      opponentAllyCode: opponent,
      round,
      size,
      leaderBaseId,
      members,
      datacronId: clean(datacron?.id),
    });
    if (status) {
      status.textContent = datacron && !clean(datacron?.id)
        ? "Defense saved. This live datacron had no stable instance ID, so its assignment was not persisted."
        : `Defense saved for Round ${result.round}. Server revalidated the opponent roster${result?.defense?.datacron?.id ? " and exact datacron ID" : ""}.`;
    }
    await loadSavedDefenses();
    renderSavedDefenses(result?.id);
  } catch (error) {
    if (status) {
      if (Number(error?.status) === 401) status.textContent = "Sign in with the verified owner account to save current-board evidence.";
      else if (Number(error?.status) === 409) status.textContent = `Board not saved: ${error?.message || "confirm the current opponent/round first"}`;
      else status.textContent = `Board not saved: ${error?.message || "request failed"}`;
    }
  } finally {
    state.saveBusy = false;
    updateSaveState();
  }
}

async function loadOpponentDatacrons() {
  const code = allyCode(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(code)) return;
  if (code !== state.opponentCode) {
    state.opponentCode = code;
    state.selectedKey = "";
    state.assessment = null;
    state.savedDefenses = [];
  }
  const token = ++state.requestId;
  const status = byId("gacDefenseDatacronStatus");
  if (status) status.textContent = "Loading opponent live datacron inventory…";
  try {
    const roster = await fetchJson(`/api/player/${code}`);
    if (token !== state.requestId) return;
    state.roster = roster;
    renderSelector();
    await recomputeAssessment();
    await loadSavedDefenses();
  } catch (error) {
    if (token !== state.requestId) return;
    state.roster = null;
    state.selectedKey = "";
    state.assessment = null;
    state.savedDefenses = [];
    renderSelector(error?.message || "Opponent datacron inventory unavailable.");
    renderSavedDefenses();
    decorateCounterCards();
  }
}

function bindRoundControl() {
  const round = byId("gacBracketRound");
  if (!round || round.dataset.boardPersistenceBound === "true") return;
  round.dataset.boardPersistenceBound = "true";
  round.addEventListener("change", () => {
    updateSaveState();
    void loadSavedDefenses();
  });
  updateSaveState();
}

function bind() {
  injectStyles();
  const select = ensureControl();
  const form = byId("gacMatchupForm");
  const picker = byId("gacDefensePicker");
  const leader = byId("gacDefenseLeader");
  const grid = byId("gacCounterGrid");
  if (!select || !form || !picker || !leader || !grid) return false;
  bindRoundControl();
  if (select.dataset.bound === "true") return true;
  select.dataset.bound = "true";

  form.addEventListener("submit", () => setTimeout(() => void loadOpponentDatacrons(), 0));
  picker.addEventListener("change", () => {
    void recomputeAssessment();
    updateSaveState();
  });
  leader.addEventListener("change", () => {
    void recomputeAssessment();
    updateSaveState();
  });
  byId("gacMode")?.addEventListener("change", updateSaveState);
  new MutationObserver(() => decorateCounterCards()).observe(grid, { childList: true, subtree: false });

  const code = allyCode(byId("gacOpponentCode")?.value);
  if (/^\d{9}$/.test(code)) void loadOpponentDatacrons();
  return true;
}

function ensureMounted() {
  bindRoundControl();
  if (bind()) return;
  setTimeout(bind, 0);
}

if (typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
  new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
}

export {
  assessmentHtml,
  datacronKey,
  optionLabel,
  restoreDefense,
  savedDefenseLabel,
  selectedDefenseSquad,
  selectedMemberIds,
};
