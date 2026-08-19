import { bestCoverage, loadEligibilityContext } from "./gac-datacron-eligibility.js";
import { hybridBoardPlan } from "./gac-hybrid-board-plan.js";

const state = {
  requestId: 0,
  timer: null,
  contextKey: "",
  context: null,
  evidenceKey: "",
  evidenceByLeader: new Map(),
  expected: new Map(),
  applying: false,
};
const number = new Intl.NumberFormat("en-US");

function clean(value) { return String(value ?? "").trim(); }
function byId(id) { return document.getElementById(id); }
function allyCode(value) { return clean(value).replace(/\D/g, "").slice(0, 9); }
function validRound(value) {
  const round = Number(value);
  return Number.isInteger(round) && round >= 1 && round <= 3 ? round : null;
}
function squadSize() { return Number(byId("gacMode")?.value) === 3 ? 3 : 5; }
function normalizeBaseId(value) { return clean(value).split(":")[0].toUpperCase(); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char]));
}
function assignmentByDefense(assignments = []) {
  return new Map((Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => Number.isInteger(Number(assignment?.defenseId)) && Number(assignment.defenseId) > 0)
    .map((assignment) => [Number(assignment.defenseId), assignment]));
}
function consumedBaseIds(assignments = []) {
  const ids = new Set();
  for (const assignment of Array.isArray(assignments) ? assignments : []) {
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of Array.isArray(attempt?.members) ? attempt.members : []) if (normalizeBaseId(id)) ids.add(normalizeBaseId(id));
    }
    const status = clean(assignment?.status).toLowerCase();
    if (["planned", "attempted"].includes(status)) {
      for (const id of Array.isArray(assignment?.members) ? assignment.members : []) if (normalizeBaseId(id)) ids.add(normalizeBaseId(id));
    }
  }
  return [...ids];
}
function defenseReservedIds(defenses = []) {
  return [...new Set((Array.isArray(defenses) ? defenses : [])
    .flatMap((defense) => Array.isArray(defense?.members) ? defense.members : [])
    .map(normalizeBaseId)
    .filter(Boolean))];
}
function openDefenseEntries(defenses = [], assignments = []) {
  const index = assignmentByDefense(assignments);
  return (Array.isArray(defenses) ? defenses : []).map((defense) => ({
    defense,
    defenseId: Number(defense?.id || 0),
  })).filter((entry) => {
    const status = clean(index.get(entry.defenseId)?.status).toLowerCase();
    return !["planned", "attempted", "win"].includes(status);
  });
}
function batchEvidenceKey(size, defenses = [], assignments = []) {
  const leaders = [...new Set(openDefenseEntries(defenses, assignments)
    .map((entry) => normalizeBaseId(entry.defense?.leaderBaseId || entry.defense?.members?.[0]))
    .filter(Boolean))].sort();
  return Object.freeze({
    format: Number(size) === 3 ? "3v3" : "5v5",
    leaders: Object.freeze(leaders),
    key: `${Number(size) === 3 ? "3v3" : "5v5"}|${leaders.join(",")}`,
  });
}
function evidenceMapFromBatch(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : [])
    .map((entry) => [normalizeBaseId(entry?.enemyLeaderBaseId), entry])
    .filter(([leader]) => Boolean(leader)));
}
function evidencePercent(value) {
  const parsed = Number(value);
  const rate = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
  return Math.round(rate * 1000) / 10;
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
function contextIdentity() {
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  const size = squadSize();
  return /^\d{9}$/.test(mine) && /^\d{9}$/.test(opponent) && round
    ? Object.freeze({ mine, opponent, round, size, key: `${mine}|${opponent}|${round}|${size}` })
    : null;
}
async function loadContext(identity, force = false) {
  if (!force && state.contextKey === identity.key && state.context) return state.context;
  const [mineRoster, opponentRoster, enemyBoard, ownBoard, warRoom] = await Promise.all([
    fetchJson(`/api/player/${identity.mine}`),
    fetchJson(`/api/player/${identity.opponent}`),
    fetchJson(`/api/gac/current-board/${identity.mine}/defense?round=${identity.round}`),
    fetchJson(`/api/gac/current-board/${identity.mine}/my-defense?round=${identity.round}`),
    fetchJson(`/api/gac/attack-plan/${identity.mine}?round=${identity.round}`),
  ]);
  if (allyCode(enemyBoard?.opponent?.allyCode) !== identity.opponent) {
    const error = new Error("Saved enemy board does not match the selected opponent.");
    error.status = 409;
    throw error;
  }
  const context = Object.freeze({
    identity,
    mineRoster,
    opponentRoster,
    enemyDefenses: Object.freeze(Array.isArray(enemyBoard?.defenses) ? enemyBoard.defenses : []),
    ownDefenses: Object.freeze(Array.isArray(ownBoard?.defenses) ? ownBoard.defenses : []),
    assignments: Object.freeze(Array.isArray(warRoom?.assignments) ? warRoom.assignments : []),
  });
  state.contextKey = identity.key;
  state.context = context;
  return context;
}
async function loadEvidence(context, force = false) {
  const batch = batchEvidenceKey(context.identity.size, context.enemyDefenses, context.assignments);
  if (!batch.leaders.length) {
    state.evidenceKey = batch.key;
    state.evidenceByLeader = new Map();
    return state.evidenceByLeader;
  }
  if (!force && state.evidenceKey === batch.key) return state.evidenceByLeader;
  try {
    const body = await fetchJson(`/api/gac/counters/batch?format=${batch.format}&leaders=${encodeURIComponent(batch.leaders.join(","))}&limit=40`);
    state.evidenceKey = batch.key;
    state.evidenceByLeader = evidenceMapFromBatch(body);
  } catch (error) {
    if (![400, 404].includes(Number(error?.status))) console.warn("Evidence-first War Room unavailable; retaining roster-fit fallback", error);
    state.evidenceKey = batch.key;
    state.evidenceByLeader = new Map();
  }
  return state.evidenceByLeader;
}

function rosterIndex(roster = {}) {
  return new Map((Array.isArray(roster?.units) ? roster.units : [])
    .map((unit) => [normalizeBaseId(unit?.baseId), unit])
    .filter(([id]) => Boolean(id)));
}
function portrait(unit, fallback = "") {
  const name = clean(unit?.name || fallback) || "Unknown";
  const image = clean(unit?.image);
  return image
    ? `<span class="gac-live-unit" title="${escapeHtml(name)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`
    : `<span class="gac-live-unit" title="${escapeHtml(name)}"><span class="gac-live-unit-placeholder">${escapeHtml(name.slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}
function evidenceSummary(assignment, recommendation, coverage) {
  const battles = Math.max(0, Number(recommendation?.battles || 0));
  const wins = Math.max(0, Number(recommendation?.wins || 0));
  const avg = recommendation?.averageBanners == null ? "" : ` · Avg ${number.format(Math.round(Number(recommendation.averageBanners) * 10) / 10)} banners`;
  const dc = coverage?.datacron ? ` · DC L${number.format(Number(coverage.datacron?.level || 0))} ${number.format(coverage.eligibleMembers)}/${number.format(coverage.squadSize)} coverage` : "";
  const sources = Array.isArray(recommendation?.evidenceSources) && recommendation.evidenceSources.length
    ? recommendation.evidenceSources.map(clean).filter(Boolean).join(" + ")
    : clean(recommendation?.source);
  return `<div class="gac-war-recommendation is-evidence"><strong>HISTORICAL COUNTER EVIDENCE · EXACT TEAM</strong><span>${number.format(wins)}/${number.format(battles)} observed wins (${number.format(evidencePercent(recommendation?.observedWinRate))}%) · ${escapeHtml(assignment?.reliability?.label || recommendation?.reliability?.label || "Sourced historical sample")}${avg}${dc}</span><small>Observed evidence only${sources ? ` · ${escapeHtml(sources)}` : ""} · not a predicted win rate.</small></div>`;
}
function heuristicSummary(assignment, recommendation, coverage) {
  const dc = coverage?.datacron ? ` · DC L${number.format(Number(coverage.datacron?.level || 0))} ${number.format(coverage.eligibleMembers)}/${number.format(coverage.squadSize)} coverage` : "";
  return `<div class="gac-war-recommendation"><strong>REMAINING-ROSTER HEURISTIC FALLBACK</strong><span>${escapeHtml(recommendation?.confidence || "Roster-fit recommendation")} · Fit ${number.format(Number(recommendation?.score || 0))} · ${escapeHtml(assignment?.allocationReason || "remaining-roster allocation")}${dc}</span></div>`;
}
function expectedPayload(recommendation, coverage) {
  const members = (recommendation?.squad || []).map((unit) => normalizeBaseId(unit?.baseId)).filter(Boolean);
  return Object.freeze({
    members: members.join(","),
    leader: members[0] || "",
    datacronId: clean(coverage?.datacron?.id),
  });
}
function setCardPayload(card, payload) {
  card.dataset.recommendedAttackerMembers = payload.members;
  card.dataset.recommendedAttackerLeader = payload.leader;
  card.dataset.recommendedDatacronId = payload.datacronId;
}
function clearCardPayload(card) {
  card.dataset.recommendedAttackerMembers = "";
  card.dataset.recommendedAttackerLeader = "";
  card.dataset.recommendedDatacronId = "";
}

async function applyPlan(context, plan) {
  const index = rosterIndex(context.mineRoster);
  let eligibility = null;
  try { eligibility = await loadEligibilityContext(); } catch { eligibility = null; }
  const assignmentIndex = assignmentByDefense(context.assignments);
  state.expected = new Map();
  state.applying = true;
  try {
    for (const card of document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")) {
      const defenseId = Number(card.dataset.defenseId || 0);
      const status = clean(assignmentIndex.get(defenseId)?.status).toLowerCase();
      if (["planned", "attempted", "win"].includes(status)) continue;
      const assignment = plan.assignments.find((entry) => Number(entry.defenseId) === defenseId) || null;
      const recommendation = assignment?.recommendation || null;
      const lane = card.querySelector(".gac-war-room-counter-lane .gac-board-units");
      const metrics = card.querySelector(".gac-board-metrics");
      const strategy = card.querySelector(".gac-board-strategy");
      card.querySelector(".gac-war-recommendation")?.remove();
      if (!recommendation?.squad?.length) {
        if (lane) lane.innerHTML = `<div class="gac-board-no-counter">No non-overlapping exact historical counter or roster-fit fallback remained.</div>`;
        if (metrics) metrics.style.display = "none";
        if (strategy) strategy.innerHTML = `<span>EVIDENCE-FIRST WAR ROOM</span><strong>${escapeHtml(assignment?.allocationReason || "No remaining attack squad")}</strong>`;
        clearCardPayload(card);
        state.expected.set(defenseId, Object.freeze({ members: "", leader: "", datacronId: "" }));
        continue;
      }
      if (lane) lane.innerHTML = recommendation.squad.map((unit) => portrait(unit || index.get(normalizeBaseId(unit?.baseId)), normalizeBaseId(unit?.baseId))).join("");
      const coverage = eligibility && Array.isArray(context.mineRoster?.datacrons)
        ? bestCoverage(context.mineRoster.datacrons, recommendation.squad, eligibility.unitIndex, eligibility.datacronCatalog)
        : null;
      const payload = expectedPayload(recommendation, coverage);
      setCardPayload(card, payload);
      state.expected.set(defenseId, payload);
      const evidenceBacked = assignment?.source === "historical-counter-evidence" || recommendation?.source === "historical-counter-evidence";
      if (metrics) {
        if (evidenceBacked) metrics.style.display = "none";
        else {
          metrics.style.display = "";
          metrics.innerHTML = `<strong>${escapeHtml(recommendation.confidence || "Roster-fit")}</strong><span>Fit ${number.format(Number(recommendation.score || 0))}</span><span>Relic Δ ${number.format(Number(recommendation.relicDelta || 0))}</span><span>Fastest ${number.format(Number(recommendation.speedEdge || 0))}</span><span>${number.format(Number(assignment?.alternativesRemaining || 0))} alternates</span>`;
        }
      }
      if (strategy) strategy.innerHTML = `<span>${evidenceBacked ? "EVIDENCE-FIRST ALLOCATION" : "WAR ROOM HEURISTIC FALLBACK"}</span><strong>${escapeHtml(assignment?.allocationReason || "remaining-roster allocation")}</strong>`;
      const summary = evidenceBacked ? evidenceSummary(assignment, recommendation, coverage) : heuristicSummary(assignment, recommendation, coverage);
      card.querySelector(".gac-war-room")?.insertAdjacentHTML("beforebegin", summary);
    }
  } finally {
    state.applying = false;
  }
}

function expectedStateIntact() {
  for (const [defenseId, expected] of state.expected.entries()) {
    const card = document.querySelector(`#gacBoardPlannerGrid .gac-saved-board-card[data-defense-id="${defenseId}"]`);
    if (!card) continue;
    if (clean(card.dataset.recommendedAttackerMembers) !== expected.members) return false;
    if (clean(card.dataset.recommendedAttackerLeader) !== expected.leader) return false;
    if (clean(card.dataset.recommendedDatacronId) !== expected.datacronId) return false;
  }
  return true;
}

async function refresh(options = {}) {
  const identity = contextIdentity();
  if (!identity || !document.querySelector("#gacBoardPlannerGrid .gac-saved-board-card")) return;
  const requestId = ++state.requestId;
  try {
    const context = await loadContext(identity, options.forceContext === true);
    const evidence = await loadEvidence(context, options.forceEvidence === true);
    if (requestId !== state.requestId) return;
    const openEntries = openDefenseEntries(context.enemyDefenses, context.assignments);
    const excluded = [...new Set([
      ...defenseReservedIds(context.ownDefenses),
      ...consumedBaseIds(context.assignments),
    ])];
    const plan = hybridBoardPlan(context.mineRoster, context.opponentRoster, openEntries, evidence, {
      size: identity.size,
      excludeBaseIds: excluded,
    });
    await applyPlan(context, plan);
    const banner = byId("gacSavedBoardBanner");
    if (banner) banner.dataset.evidenceBackedDefenses = String(plan.evidenceDefenseCount || 0);
  } catch (error) {
    if (requestId !== state.requestId) return;
    if (![401, 409].includes(Number(error?.status))) console.warn("Evidence-first War Room planner unavailable; base War Room remains active", error);
  }
}

function schedule(delay = 220, options = {}) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void refresh(options), Math.max(0, delay));
}
function invalidateContext() {
  state.contextKey = "";
  state.context = null;
  state.expected = new Map();
}
function invalidateEvidence() {
  state.evidenceKey = "";
  state.evidenceByLeader = new Map();
}
function mutationTouchesWarRoom(mutations) {
  for (const mutation of mutations) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest?.("#gacBoardPlannerGrid .gac-saved-board-card")) return true;
    for (const node of mutation.addedNodes || []) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.(".gac-war-room,.gac-war-room-counter-lane,.gac-war-recommendation") || node.querySelector?.(".gac-war-room,.gac-war-room-counter-lane")) return true;
    }
  }
  return false;
}

function bind() {
  if (document.documentElement.dataset.gacEvidenceWarRoomBound === "true") return;
  document.documentElement.dataset.gacEvidenceWarRoomBound = "true";
  window.addEventListener("gac-saved-board-rendered", () => schedule(260));
  window.addEventListener("gac-war-room-updated", () => {
    invalidateContext();
    schedule(180, { forceContext: true });
  });
  window.addEventListener("gac-board-evidence-updated", () => {
    invalidateContext();
    invalidateEvidence();
    schedule(220, { forceContext: true, forceEvidence: true });
  });
  window.addEventListener("gac-verified-battle-archived", () => {
    invalidateEvidence();
    schedule(180, { forceEvidence: true });
  });
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacOpponentCode", "gacBracketRound", "gacMode"].includes(event.target?.id)) {
      invalidateContext();
      invalidateEvidence();
      schedule(240, { forceContext: true, forceEvidence: true });
    }
  });
  window.addEventListener("hashchange", () => {
    invalidateContext();
    invalidateEvidence();
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bind();
  document.addEventListener("DOMContentLoaded", () => schedule(300), { once: true });
  schedule(450);
  new MutationObserver((mutations) => {
    if (state.applying || !mutationTouchesWarRoom(mutations)) return;
    queueMicrotask(() => {
      if (!expectedStateIntact()) schedule(80);
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: false });
}

export {
  assignmentByDefense,
  batchEvidenceKey,
  consumedBaseIds,
  contextIdentity,
  defenseReservedIds,
  evidenceMapFromBatch,
  evidencePercent,
  expectedPayload,
  openDefenseEntries,
  mutationTouchesWarRoom,
};
