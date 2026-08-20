import { displaySlotFromBackend, readBoardPosition, ZONES, zoneLabel } from "./gac-board-position.js";
import { loadEligibilityContext } from "./gac-datacron-eligibility.js";
import { assessDefenseDatacron, exposureLabel } from "./gac-defense-datacron-risk.js";

const NONE_KEY = "__NONE__";
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
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.querySelector('link[data-gac-defense-datacron-risk="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-defense-datacron-risk.css?v=20260820-gacdefdc4";
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
  if (!Array.isArray(values) || !state.selectedKey || state.selectedKey === NONE_KEY) return null;
  return values.find((datacron, index) => datacronKey(datacron, index) === state.selectedKey) || null;
}

function selectedDatacronState() {
  if (state.selectedKey === NONE_KEY) return "none";
  const datacron = selectedDatacron();
  return clean(datacron?.id) ? "assigned" : "unknown";
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

function currentBoardPosition() {
  return readBoardPosition(byId("gacDefenseZone")?.value, byId("gacDefenseSlot")?.value);
}

function ensureControl() {
  const leader = byId("gacDefenseLeader");
  if (!leader) return null;
  let select = byId("gacDefenseDatacron");
  if (select) return select;

  const wrapper = document.createElement("div");
  wrapper.className = "gac-defense-datacron-control";
  wrapper.innerHTML = `
    <select id="gacDefenseDatacron">
      <option value="">Enemy Datacron · not confirmed</option>
      <option value="${NONE_KEY}">Enemy Datacron · confirmed none</option>
    </select>
    <div class="gac-board-position-controls">
      <select id="gacDefenseZone">
        <option value="">Board zone · optional</option>
        ${ZONES.map((entry) => `<option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>`).join("")}
      </select>
      <input id="gacDefenseSlot" type="number" min="1" max="100" step="1" inputmode="numeric" placeholder="Slot # · optional">
    </div>
    <div class="gac-board-persistence-controls">
      <select id="gacSavedDefense" disabled><option value="">Saved defenses · none</option></select>
      <button id="gacSaveDefense" type="button" disabled>Save Current Defense</button>
    </div>
    <small id="gacDefenseDatacronStatus">Leave Datacron unconfirmed unless you checked the defense in-game. Choose confirmed none only when you can verify no Datacron is assigned.</small>`;
  leader.insertAdjacentElement("afterend", wrapper);
  select = byId("gacDefenseDatacron");
  select?.addEventListener("change", () => {
    state.selectedKey = clean(select.value);
    void recomputeAssessment();
    updateSaveState();
  });
  byId("gacDefenseZone")?.addEventListener("change", updateSaveState);
  byId("gacDefenseSlot")?.addEventListener("input", updateSaveState);
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
  const baseOptions = `<option value="">Enemy Datacron · not confirmed</option><option value="${NONE_KEY}">Enemy Datacron · confirmed none</option>`;
  const inventoryOptions = Array.isArray(values) ? values.map((datacron, index) => {
    const key = datacronKey(datacron, index);
    return `<option value="${escapeHtml(key)}" ${key === state.selectedKey ? "selected" : ""}>${escapeHtml(optionLabel(datacron, index))}</option>`;
  }).join("") : "";
  select.disabled = false;
  select.innerHTML = `${baseOptions}${inventoryOptions}`;
  const validKeys = new Set(["", NONE_KEY, ...(Array.isArray(values) ? values.map(datacronKey) : [])]);
  if (!validKeys.has(state.selectedKey)) state.selectedKey = "";
  select.value = state.selectedKey;

  if (status) {
    if (message) status.textContent = message;
    else if (values === null) status.textContent = "Opponent individual Datacron inventory is unavailable. Assignment remains unknown unless you explicitly confirm no Datacron in-game.";
    else if (!values.length) status.textContent = "No opponent Datacron instances were returned. This alone does not prove this defense has none; confirm only what you can see in-game.";
    else status.textContent = "USER-CONFIRMED BOARD EVIDENCE · leave unconfirmed unless checked in-game; choose confirmed none only for a visibly DC-free defense.";
  }
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
  const status = byId("gacDefenseDatacronStatus");
  if (!datacron) {
    state.assessment = null;
    decorateCounterCards();
    if (status) {
      status.textContent = selectedDatacronState() === "none"
        ? "CONFIRMED NONE · this defense will be saved as visibly having no assigned Datacron."
        : "DATACRON UNKNOWN · no assigned Datacron and no absence are inferred.";
    }
    updateSaveState();
    return;
  }
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
  const position = currentBoardPosition();
  const selected = selectedDatacron();
  const assignedWithoutStableId = Boolean(selected) && !clean(selected?.id);
  const ready = /^\d{9}$/.test(mine) && /^\d{9}$/.test(opponent) && Boolean(currentRound()) && members.length === size && members.includes(leader) && position.complete && !assignedWithoutStableId;
  button.disabled = state.saveBusy || !ready;
  button.textContent = state.saveBusy ? "Saving Defense…" : "Save Current Defense";
  button.title = !position.complete
    ? "Enter both board zone and slot, or leave both blank."
    : assignedWithoutStableId
      ? "This Datacron has no stable instance ID and cannot be persisted as an exact assignment."
      : "";
}

function savedDefenseLabel(defense, index) {
  const unitIndex = new Map((state.roster?.units || []).map((unit) => [clean(unit?.baseId), clean(unit?.name)]));
  const leader = unitIndex.get(clean(defense?.leaderBaseId)) || clean(defense?.leaderBaseId) || `Defense ${index + 1}`;
  const datacronState = clean(defense?.datacronState).toLowerCase() || "unknown";
  const dc = clean(defense?.datacron?.id)
    ? ` · DC L${Number(defense?.datacron?.level || 0)}`
    : datacronState === "none"
      ? " · DC none"
      : " · DC ?";
  const zone = clean(defense?.zone) ? ` · ${zoneLabel(defense.zone)}` : "";
  const slot = displaySlotFromBackend(defense?.slot);
  const slotLabel = slot ? ` · Slot ${slot}` : "";
  return `${leader}${dc}${zone}${slotLabel}`;
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

  const zone = byId("gacDefenseZone");
  const slot = byId("gacDefenseSlot");
  if (zone) zone.value = clean(defense?.zone);
  if (slot) slot.value = displaySlotFromBackend(defense?.slot);

  const datacronId = clean(defense?.datacron?.id);
  const datacronState = clean(defense?.datacronState).toLowerCase() || (datacronId ? "assigned" : "unknown");
  const values = datacrons();
  const matchIndex = Array.isArray(values) ? values.findIndex((datacron) => clean(datacron?.id) === datacronId) : -1;
  state.selectedKey = datacronState === "none" ? NONE_KEY : matchIndex >= 0 ? datacronKey(values[matchIndex], matchIndex) : "";
  const dcSelect = byId("gacDefenseDatacron");
  if (dcSelect) dcSelect.value = state.selectedKey;
  const status = byId("gacDefenseDatacronStatus");
  if (status) {
    const position = currentBoardPosition();
    const positionLabel = position.specified && position.complete ? ` · ${zoneLabel(position.zone)} Slot ${position.displaySlot}` : "";
    if (datacronState === "none") status.textContent = `Saved current-round defense restored${positionLabel} · verified no Datacron assigned.`;
    else if (datacronId && matchIndex < 0) status.textContent = `Saved defense restored${positionLabel}. Its verified assigned Datacron is no longer present in the opponent's current live inventory; choose the current board state before re-saving.`;
    else if (datacronState === "unknown") status.textContent = `Saved current-round defense restored${positionLabel} · Datacron assignment was not verified.`;
    else status.textContent = `Saved current-round defense restored from verified owner evidence${positionLabel}.`;
  }
  void recomputeAssessment();
  renderSavedDefenses(defense?.id);
  updateSaveState();
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
  const datacronState = selectedDatacronState();
  const position = currentBoardPosition();
  if (!mine || !opponent || !round || members.length !== size || !members.includes(leaderBaseId) || !position.complete) return;
  if (datacron && !clean(datacron?.id)) return;

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
      datacronState,
      zone: position.zone,
      slot: position.slot,
    });
    if (status) {
      const positionLabel = position.specified ? ` at ${zoneLabel(position.zone)} Slot ${position.displaySlot}` : "";
      const savedState = clean(result?.defense?.datacronState).toLowerCase();
      status.textContent = savedState === "none"
        ? `Defense saved for Round ${result.round}${positionLabel} · verified no Datacron assigned.`
        : savedState === "assigned"
          ? `Defense saved for Round ${result.round}${positionLabel}. Server revalidated the opponent roster and exact Datacron ID.`
          : `Defense saved for Round ${result.round}${positionLabel} · Datacron assignment remains unknown.`;
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
  if (status) status.textContent = "Loading opponent live Datacron inventory…";
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
    renderSelector(error?.message || "Opponent Datacron inventory unavailable. Assignment remains unknown unless you explicitly confirm none in-game.");
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
  NONE_KEY,
  assessmentHtml,
  currentBoardPosition,
  datacronKey,
  optionLabel,
  restoreDefense,
  savedDefenseLabel,
  selectedDatacronState,
  selectedDefenseSquad,
  selectedMemberIds,
};
