import { planBoardCounters } from "./gac-counter-engine.js";
import { bestCoverage, loadEligibilityContext } from "./gac-datacron-eligibility.js";
import { mechanicsLabels } from "./gac-datacron-mechanics.js";

const state = { requestId: 0, autoKey: "" };
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function byId(id) { return document.getElementById(id); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function currentRound() { return validRound(byId("gacBracketRound")?.value); }
function squadSize() { return Number(byId("gacMode")?.value) === 3 ? 3 : 5; }

function reservedBaseIds(ownDefenses = []) {
  return Object.freeze([...new Set((Array.isArray(ownDefenses) ? ownDefenses : [])
    .flatMap((defense) => Array.isArray(defense?.members) ? defense.members : [])
    .map(clean)
    .filter(Boolean))]);
}

function buildPersistedBoardPlan(ownBody, opponentBody, opponentDefenses, ownDefenses, options = {}) {
  const excludeBaseIds = reservedBaseIds(ownDefenses);
  const size = Number(options.size) === 3 ? 3 : 5;
  const plan = planBoardCounters(ownBody, opponentBody, opponentDefenses, {
    ...options,
    size,
    excludeBaseIds: [...excludeBaseIds, ...(options.excludeBaseIds || [])],
  });
  return Object.freeze({
    source: "user-confirmed-current-board",
    size,
    reservedBaseIds: excludeBaseIds,
    opponentDefenses: Object.freeze(Array.isArray(opponentDefenses) ? opponentDefenses : []),
    ownDefenses: Object.freeze(Array.isArray(ownDefenses) ? ownDefenses : []),
    assignments: Object.freeze(plan),
  });
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

function rosterIndex(roster) {
  return new Map((Array.isArray(roster?.units) ? roster.units : []).map((unit) => [clean(unit?.baseId), unit]));
}

function portrait(unit, fallback = "") {
  const name = clean(unit?.name || fallback) || "Unknown";
  const image = clean(unit?.image);
  return image
    ? `<span class="gac-live-unit" title="${escapeHtml(name)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`
    : `<span class="gac-live-unit" title="${escapeHtml(name)}"><span class="gac-live-unit-placeholder">${escapeHtml(name.slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}

function signed(value) {
  const numeric = n(value);
  return numeric > 0 ? `+${number.format(numeric)}` : numeric < 0 ? `−${number.format(Math.abs(numeric))}` : "0";
}

function mechanicsHtml(labels = [], className = "gac-saved-dc-tags") {
  return labels.length ? `<div class="${className}">${labels.slice(0, 6).map((label) => `<b>${escapeHtml(label)}</b>`).join("")}</div>` : "";
}

function enemyDatacronEvidence(defense = {}) {
  const datacron = defense?.datacron;
  if (!datacron?.id) return "";
  const level = Number(datacron?.level || (Array.isArray(datacron?.affixes) ? datacron.affixes.length : 0));
  const mechanics = mechanicsLabels(datacron, 6);
  return `<div class="gac-saved-enemy-dc"><strong>ENEMY DATACRON · L${number.format(level)}</strong><span>${escapeHtml(clean(datacron.id).slice(-10))}</span>${mechanicsHtml(mechanics)}</div>`;
}

function ownedDatacronEvidence(coverage) {
  if (!coverage?.datacron) return `<div class="gac-saved-own-dc is-unknown"><strong>OWN DATACRON</strong><span>No fully resolved owned loadout match.</span></div>`;
  const level = Number(coverage.datacron?.level || (Array.isArray(coverage.datacron?.affixes) ? coverage.datacron.affixes.length : 0));
  const mechanics = mechanicsLabels(coverage.datacron, 6);
  return `<div class="gac-saved-own-dc"><strong>RECOMMENDED OWN DATACRON · L${number.format(level)}</strong><span>${number.format(coverage.eligibleMembers)}/${number.format(coverage.squadSize)} verified coverage${coverage.leaderEligible === true ? " · leader eligible" : ""}</span>${mechanicsHtml(mechanics)}</div>`;
}

function ensureSavedBanner(output, model) {
  const parent = output?.parentElement;
  if (!parent) return;
  let banner = parent.querySelector("#gacSavedBoardBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "gacSavedBoardBanner";
    banner.className = "gac-saved-board-banner";
    output.insertAdjacentElement("beforebegin", banner);
  }
  banner.innerHTML = `<strong>VERIFIED SAVED BOARD · ROUND ${model.round || "?"}</strong><span>${number.format(model.enemyCount)} enemy defenses · ${number.format(model.reservedCount)} of your attackers reserved on defense</span>`;
}

async function renderPersistedPlan(model) {
  const output = byId("gacBoardPlannerGrid");
  if (!output) return;
  ensureSavedBanner(output, model);
  const enemyIndex = rosterIndex(model.opponentRoster);
  let eligibility = null;
  try { eligibility = await loadEligibilityContext(); } catch { eligibility = null; }

  output.dataset.boardSource = "verified-saved-board";
  output.innerHTML = model.plan.assignments.map((assignment, index) => {
    const defense = assignment.defense;
    const enemyUnits = (defense?.members || []).map((id) => enemyIndex.get(clean(id))).filter(Boolean);
    const recommendation = assignment.recommendation;
    const ownCoverage = recommendation?.squad?.length && eligibility && Array.isArray(model.mineRoster?.datacrons)
      ? bestCoverage(model.mineRoster.datacrons, recommendation.squad, eligibility.unitIndex, eligibility.datacronCatalog)
      : null;
    return `<article class="gac-board-card gac-saved-board-card">
      <div class="gac-board-card-head">
        <div><span>SAVED DEFENSE ${index + 1}${defense?.zone ? ` · ${escapeHtml(defense.zone)}` : ""}</span><strong>${escapeHtml(enemyUnits[0]?.name || defense?.leaderBaseId || "Enemy defense")}</strong></div>
        <span class="gac-saved-source-badge">VERIFIED OWNER</span>
      </div>
      <div class="gac-board-lane">
        <div><span class="gac-board-caption">ENEMY</span><div class="gac-board-units">${enemyUnits.length ? enemyUnits.map((unit) => portrait(unit)).join("") : (defense?.members || []).map((id) => portrait(null, id)).join("")}</div></div>
        <div class="gac-board-arrow">→</div>
        <div><span class="gac-board-caption">STRATEGIC COUNTER</span><div class="gac-board-units">${recommendation?.squad?.length ? recommendation.squad.map((unit) => portrait(unit)).join("") : `<div class="gac-board-no-counter">No non-overlapping roster-fit squad available.</div>`}</div></div>
      </div>
      ${enemyDatacronEvidence(defense)}
      ${recommendation ? `<div class="gac-board-metrics">
        <strong>${escapeHtml(recommendation.confidence)}</strong>
        <span>Fit ${number.format(recommendation.score)}</span>
        <span>Allocation ${number.format(Math.round(n(assignment.allocationScore)))}</span>
        <span>Relic Δ ${signed(recommendation.relicDelta)}</span>
        <span>Fastest ${signed(recommendation.speedEdge)}</span>
        <span>Scarcity −${number.format(Math.round(n(assignment.scarcityPenalty)))}</span>
        <span>${number.format(assignment.alternativesRemaining)} alternates</span>
      </div>${ownedDatacronEvidence(ownCoverage)}
      <div class="gac-board-strategy"><span>COMMAND CENTER LOGIC</span><strong>${escapeHtml(assignment.allocationReason || "Board-wide allocation")}</strong></div>` : `<div class="gac-board-strategy gac-board-strategy-risk"><span>COMMAND CENTER LOGIC</span><strong>${escapeHtml(assignment.allocationReason || "No attack squad remained")}</strong></div>`}
    </article>`;
  }).join("") || `<div class="workspace-note">Save at least one verified opponent defense to build the persisted whole-board attack plan.</div>`;
}

function contextKey() {
  const mineCode = allyCode(byId("allyCode")?.value);
  const opponentCode = allyCode(byId("gacOpponentCode")?.value);
  const round = currentRound();
  if (!byId("gacBoardPlannerGrid") || !/^\d{9}$/.test(mineCode) || !/^\d{9}$/.test(opponentCode) || !round) return "";
  return `${mineCode}|${opponentCode}|${round}|${squadSize()}`;
}

async function refreshSavedBoardPlan({ force = false } = {}) {
  const key = contextKey();
  if (!key) return;
  if (!force && state.autoKey === key) return;
  state.autoKey = key;
  const [mineCode, opponentCode, roundText] = key.split("|");
  const round = Number(roundText);
  const requestId = ++state.requestId;
  try {
    const [mineRoster, opponentRoster, opponentBoard, ownBoard] = await Promise.all([
      fetchJson(`/api/player/${mineCode}`),
      fetchJson(`/api/player/${opponentCode}`),
      fetchJson(`/api/gac/current-board/${mineCode}/defense?round=${round}`),
      fetchJson(`/api/gac/current-board/${mineCode}/my-defense?round=${round}`),
    ]);
    if (requestId !== state.requestId) return;
    if (allyCode(opponentBoard?.opponent?.allyCode) !== opponentCode) return;
    const enemyDefenses = Array.isArray(opponentBoard?.defenses) ? opponentBoard.defenses : [];
    const ownDefenses = Array.isArray(ownBoard?.defenses) ? ownBoard.defenses : [];
    if (!enemyDefenses.length) return;
    const plan = buildPersistedBoardPlan(mineRoster, opponentRoster, enemyDefenses, ownDefenses, { size: squadSize() });
    await renderPersistedPlan({
      mineRoster,
      opponentRoster,
      plan,
      round,
      enemyCount: enemyDefenses.length,
      reservedCount: plan.reservedBaseIds.length,
    });
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (![401, 409].includes(Number(error?.status))) console.warn("Persisted GAC board planner unavailable", error);
  }
}

function bind() {
  const form = byId("gacMatchupForm");
  if (form && form.dataset.savedBoardPlannerBound !== "true") {
    form.dataset.savedBoardPlannerBound = "true";
    form.addEventListener("submit", () => setTimeout(() => void refreshSavedBoardPlan({ force: true }), 0));
  }
  const round = byId("gacBracketRound");
  if (round && round.dataset.savedBoardPlannerBound !== "true") {
    round.dataset.savedBoardPlannerBound = "true";
    round.addEventListener("change", () => void refreshSavedBoardPlan({ force: true }));
  }
  const mode = byId("gacMode");
  if (mode && mode.dataset.savedBoardPlannerBound !== "true") {
    mode.dataset.savedBoardPlannerBound = "true";
    mode.addEventListener("change", () => void refreshSavedBoardPlan({ force: true }));
  }
}

function ensureMounted() {
  bind();
  void refreshSavedBoardPlan();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("gac-board-evidence-updated", () => void refreshSavedBoardPlan({ force: true }));
  ensureMounted();
  document.addEventListener("DOMContentLoaded", ensureMounted, { once: true });
  window.addEventListener("hashchange", () => {
    state.autoKey = "";
    setTimeout(ensureMounted, 0);
  });
  new MutationObserver(ensureMounted).observe(document.documentElement, { childList: true, subtree: true });
}

export { buildPersistedBoardPlan, reservedBaseIds };
