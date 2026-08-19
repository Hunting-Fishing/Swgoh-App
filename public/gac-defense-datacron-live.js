import { loadEligibilityContext } from "./gac-datacron-eligibility.js";
import {
  assessDefenseDatacron,
  exposureLabel,
  extractAssignedDefenseDatacrons,
  placementKey,
  resolveAssignedDatacron,
  threatLabel,
} from "./gac-defense-datacron-risk.js";

let refreshToken = 0;
let scheduled = 0;

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}

async function fetchJson(pathname) {
  const response = await fetch(pathname, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

function rosterNameIndex(roster = {}) {
  const index = new Map();
  for (const unit of Array.isArray(roster?.units) ? roster.units : []) {
    const name = clean(unit?.name).toLowerCase();
    const baseId = clean(unit?.baseId).toUpperCase();
    if (!name || !baseId) continue;
    if (!index.has(name)) index.set(name, []);
    index.get(name).push(baseId);
  }
  return index;
}

function cardEnemyMemberIds(card, roster = {}) {
  const enemy = card.querySelector(".gac-board-lane > div:first-child");
  if (!enemy) return [];
  const names = [...enemy.querySelectorAll("[title]")]
    .map((node) => clean(node.getAttribute("title")).toLowerCase())
    .filter(Boolean);
  if (!names.length) return [];
  const index = rosterNameIndex(roster);
  const ids = [];
  for (const name of names) {
    const matches = index.get(name) || [];
    if (matches.length !== 1) return [];
    ids.push(matches[0]);
  }
  return ids;
}

function squadUnits(ids, roster = {}) {
  const index = new Map((Array.isArray(roster?.units) ? roster.units : []).map((unit) => [clean(unit?.baseId).toUpperCase(), unit]));
  return ids.map((id) => index.get(clean(id).toUpperCase())).filter(Boolean);
}

function liveAssessmentHtml(assessment, resolution = "") {
  const mechanics = Array.isArray(assessment?.mechanics) ? assessment.mechanics : [];
  const coverage = assessment?.coverage == null
    ? "coverage unresolved"
    : `${assessment.eligibleMembers}/${assessment.squadSize} defenders receive ≥1 verified ability target`;
  const mechanicHtml = mechanics.length
    ? `<div class="gac-enemy-datacron-mechanics">${mechanics.map((label) => `<b>${escapeHtml(label)}</b>`).join("")}</div>`
    : `<small>Assigned datacron is verified, but official mechanics text is unresolved for this instance.</small>`;
  return `
    <div class="gac-enemy-datacron-risk ${assessment?.known === true && assessment?.eligibleMembers === assessment?.squadSize ? "is-full" : "is-partial"}">
      <div class="gac-enemy-datacron-head"><strong>${escapeHtml(exposureLabel(assessment))}</strong><span>LIVE VERIFIED · ${escapeHtml(threatLabel(assessment))}</span></div>
      <div>${escapeHtml(assessment?.label || "Assigned datacron")} · ${escapeHtml(coverage)}${assessment?.leaderEligible === true ? " · leader eligible" : ""}</div>
      ${mechanicHtml}
      <small>Explicit live placement reference · ${escapeHtml(resolution || "assignment verified")}. Opponent inventory is used only to resolve that exact ID, never to guess an assignment.</small>
    </div>`;
}

function unknownHtml(message = "No explicit datacron assignment was exposed for this defense.") {
  return `<div class="gac-enemy-datacron-risk is-unknown"><div class="gac-enemy-datacron-head"><strong>ENEMY DATACRON · UNKNOWN</strong><span>NO GUESSING</span></div><small>${escapeHtml(message)} Opponent inventory is not used to infer one.</small></div>`;
}

async function enhanceBoard() {
  const grid = byId("gacBoardPlannerGrid");
  const cards = grid ? [...grid.querySelectorAll(".gac-board-card")] : [];
  if (!grid || !cards.length) return;
  const opponentCode = allyCode(byId("gacOpponentCode")?.value);
  if (!/^\d{9}$/.test(opponentCode)) return;
  const token = ++refreshToken;

  let event;
  let roster;
  let context;
  try {
    [event, roster, context] = await Promise.all([
      fetchJson("/api/gac/current-event"),
      fetchJson(`/api/player/${opponentCode}`),
      loadEligibilityContext(),
    ]);
  } catch {
    if (token !== refreshToken) return;
    for (const card of cards) {
      card.querySelector(".gac-enemy-datacron-risk")?.remove();
      card.insertAdjacentHTML("beforeend", unknownHtml("Live placement/datacron evidence is currently unavailable."));
    }
    return;
  }
  if (token !== refreshToken) return;

  const assignments = extractAssignedDefenseDatacrons(event);
  for (const card of cards) {
    card.querySelector(".gac-enemy-datacron-risk")?.remove();
    delete card.dataset.enemyDatacronId;
    delete card.dataset.enemyDatacronSource;

    const ids = cardEnemyMemberIds(card, roster);
    const placement = assignments.get(placementKey(ids));
    if (!ids.length || !placement) {
      card.insertAdjacentHTML("beforeend", unknownHtml());
      continue;
    }

    const resolved = resolveAssignedDatacron(placement.datacron, roster);
    const datacron = resolved?.datacron;
    if (!datacron) {
      card.insertAdjacentHTML("beforeend", unknownHtml("A placement reference was present, but the assigned datacron could not be resolved."));
      continue;
    }
    const assessment = assessDefenseDatacron(datacron, squadUnits(ids, roster), context, {
      source: "explicit-live-placement-reference",
    });
    if (assessment.datacronId) card.dataset.enemyDatacronId = assessment.datacronId;
    card.dataset.enemyDatacronSource = assessment.source;
    card.insertAdjacentHTML("beforeend", liveAssessmentHtml(assessment, resolved?.resolution));
  }
}

function scheduleEnhance() {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => void enhanceBoard(), 40);
}

function bind() {
  const grid = byId("gacBoardPlannerGrid");
  if (!grid || grid.dataset.liveEnemyDatacronBound === "true") return false;
  grid.dataset.liveEnemyDatacronBound = "true";
  new MutationObserver(scheduleEnhance).observe(grid, { childList: true, subtree: false });
  byId("gacMatchupForm")?.addEventListener("submit", () => setTimeout(scheduleEnhance, 0));
  scheduleEnhance();
  return true;
}

function ensureMounted() {
  if (bind()) return;
  setTimeout(bind, 0);
}

if (typeof document !== "undefined") {
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => setTimeout(ensureMounted, 0));
  new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
}

export { cardEnemyMemberIds, liveAssessmentHtml, squadUnits, unknownHtml };
