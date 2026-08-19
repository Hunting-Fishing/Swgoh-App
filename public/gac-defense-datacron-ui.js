import { loadEligibilityContext } from "./gac-datacron-eligibility.js";
import { assessDefenseDatacron, exposureLabel } from "./gac-defense-datacron-risk.js";

const state = {
  opponentCode: "",
  roster: null,
  selectedKey: "",
  assessment: null,
  requestId: 0,
};

function byId(id) { return document.getElementById(id); }
function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.querySelector('link[data-gac-defense-datacron-risk="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-defense-datacron-risk.css?v=20260819-gacdefdc1";
  link.dataset.gacDefenseDatacronRisk = "true";
  document.head.append(link);
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
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

function selectedDefenseSquad() {
  if (!state.roster || !Array.isArray(state.roster?.units)) return [];
  const selectedIds = new Set([...document.querySelectorAll('#gacDefensePicker input[type="checkbox"]:checked')].map((input) => clean(input.value)).filter(Boolean));
  const units = state.roster.units.filter((unit) => selectedIds.has(clean(unit?.baseId)));
  const leaderId = clean(byId("gacDefenseLeader")?.value);
  const leader = units.find((unit) => clean(unit?.baseId) === leaderId);
  return leader ? [leader, ...units.filter((unit) => clean(unit?.baseId) !== leaderId)] : units;
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
    <small id="gacDefenseDatacronStatus">Select only the exact datacron you can see assigned to this defense in-game.</small>`;
  leader.insertAdjacentElement("afterend", wrapper);
  select = byId("gacDefenseDatacron");
  select?.addEventListener("change", () => {
    state.selectedKey = clean(select.value);
    void recomputeAssessment();
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
    return;
  }
  if (!values.length) {
    select.disabled = true;
    select.innerHTML = `<option value="">Enemy Datacron · none returned</option>`;
    if (status) status.textContent = message || "No opponent datacron instances were returned by the live roster.";
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
    return;
  }
  const status = byId("gacDefenseDatacronStatus");
  if (status) status.textContent = "Resolving exact target categories and relic gates…";
  try {
    const context = await loadEligibilityContext();
    if (token !== state.requestId) return;
    state.assessment = assessDefenseDatacron(datacron, squad, context);
    if (status) {
      status.textContent = `${exposureLabel(state.assessment)} · ${state.assessment.eligibleMembers}/${state.assessment.squadSize} verified coverage · user-confirmed current board.`;
    }
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
}

async function loadOpponentDatacrons() {
  const code = allyCode(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(code)) return;
  if (code !== state.opponentCode) {
    state.opponentCode = code;
    state.selectedKey = "";
    state.assessment = null;
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
  } catch (error) {
    if (token !== state.requestId) return;
    state.roster = null;
    state.selectedKey = "";
    state.assessment = null;
    renderSelector(error?.message || "Opponent datacron inventory unavailable.");
    decorateCounterCards();
  }
}

function bind() {
  injectStyles();
  const select = ensureControl();
  const form = byId("gacMatchupForm");
  const picker = byId("gacDefensePicker");
  const leader = byId("gacDefenseLeader");
  const grid = byId("gacCounterGrid");
  if (!select || !form || !picker || !leader || !grid) return false;
  if (select.dataset.bound === "true") return true;
  select.dataset.bound = "true";

  form.addEventListener("submit", () => setTimeout(() => void loadOpponentDatacrons(), 0));
  picker.addEventListener("change", () => void recomputeAssessment());
  leader.addEventListener("change", () => void recomputeAssessment());
  new MutationObserver(() => decorateCounterCards()).observe(grid, { childList: true, subtree: false });

  const code = allyCode(byId("gacOpponentCode")?.value);
  if (/^\d{9}$/.test(code)) void loadOpponentDatacrons();
  return true;
}

function ensureMounted() {
  if (bind()) return;
  setTimeout(bind, 0);
}

ensureMounted();
document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });

export { assessmentHtml, datacronKey, optionLabel, selectedDefenseSquad };
