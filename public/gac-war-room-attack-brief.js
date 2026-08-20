import { datacronLabel, loadEligibilityContext, squadCoverage } from "./gac-datacron-eligibility.js";
import { squadAbilityReadiness } from "./gac-ability-intelligence.js";
import {
  abilityConcerns,
  normalizeBaseId,
  observedPercent,
  primaryEvidenceMatch,
  primaryHeuristicMatch,
  unitsForIds,
} from "./gac-counter-inspector-model.js";
import { buildAttackBrief, matchupDelta, signed } from "./gac-attack-brief-model.js";

const state = {
  key: "",
  context: null,
  contextPromise: null,
  evidenceKey: "",
  evidenceByLeader: new Map(),
  evidencePromise: null,
  evidenceLoaded: false,
  eligibilityPromise: null,
  timer: null,
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
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function identity() {
  const mine = allyCode(byId("allyCode")?.value);
  const opponent = allyCode(byId("gacOpponentCode")?.value);
  const round = validRound(byId("gacBracketRound")?.value);
  const size = squadSize();
  return /^\d{9}$/.test(mine) && /^\d{9}$/.test(opponent) && round
    ? Object.freeze({ mine, opponent, round, size, format: size === 3 ? "3v3" : "5v5", key: `${mine}|${opponent}|${round}|${size}` })
    : null;
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
function resetContext() {
  state.key = "";
  state.context = null;
  state.contextPromise = null;
  state.evidenceKey = "";
  state.evidenceByLeader = new Map();
  state.evidencePromise = null;
  state.evidenceLoaded = false;
}
async function loadContext(current, force = false) {
  if (!force && state.key === current.key && state.context) return state.context;
  if (!force && state.key === current.key && state.contextPromise) return state.contextPromise;
  const promise = Promise.all([
    fetchJson(`/api/player/${current.mine}`),
    fetchJson(`/api/player/${current.opponent}`),
    fetchJson(`/api/gac/current-board/${current.mine}/defense?round=${current.round}`),
  ]).then(([mineRoster, opponentRoster, enemyBoard]) => {
    if (allyCode(enemyBoard?.opponent?.allyCode) !== current.opponent) {
      const error = new Error("Saved enemy board does not match the selected opponent.");
      error.status = 409;
      throw error;
    }
    const context = Object.freeze({
      identity: current,
      mineRoster,
      opponentRoster,
      enemyDefenses: Object.freeze(Array.isArray(enemyBoard?.defenses) ? enemyBoard.defenses : []),
    });
    state.key = current.key;
    state.context = context;
    return context;
  }).finally(() => {
    if (state.contextPromise === promise) state.contextPromise = null;
  });
  state.key = current.key;
  state.contextPromise = promise;
  return promise;
}
function evidenceMapFromBatch(body = {}) {
  return new Map((Array.isArray(body?.results) ? body.results : [])
    .map((entry) => [normalizeBaseId(entry?.enemyLeaderBaseId), entry])
    .filter(([leader]) => Boolean(leader)));
}
function evidenceBatch(context) {
  const leaders = [...new Set(context.enemyDefenses
    .map((defense) => normalizeBaseId(defense?.leaderBaseId || defense?.members?.[0]))
    .filter(Boolean))].sort();
  return Object.freeze({ leaders, key: `${context.identity.format}|${leaders.join(",")}` });
}
async function loadEvidence(context, force = false) {
  const batch = evidenceBatch(context);
  if (!batch.leaders.length) return new Map();
  if (!force && state.evidenceKey === batch.key && state.evidenceLoaded) return state.evidenceByLeader;
  if (!force && state.evidenceKey === batch.key && state.evidencePromise) return state.evidencePromise;
  state.evidenceKey = batch.key;
  state.evidenceLoaded = false;
  const promise = fetchJson(`/api/gac/counters/batch?format=${context.identity.format}&leaders=${encodeURIComponent(batch.leaders.join(","))}&limit=40`)
    .then((body) => {
      state.evidenceByLeader = evidenceMapFromBatch(body);
      state.evidenceLoaded = true;
      return state.evidenceByLeader;
    })
    .catch(() => {
      state.evidenceByLeader = new Map();
      state.evidenceLoaded = false;
      return state.evidenceByLeader;
    })
    .finally(() => {
      if (state.evidencePromise === promise) state.evidencePromise = null;
    });
  state.evidencePromise = promise;
  return promise;
}
async function loadEligibility() {
  if (!state.eligibilityPromise) {
    state.eligibilityPromise = loadEligibilityContext().catch(() => null);
  }
  return state.eligibilityPromise;
}
function primaryIds(card) {
  return clean(card?.dataset?.recommendedAttackerMembers).split(",").map(normalizeBaseId).filter(Boolean);
}
function portrait(unit = {}) {
  const name = clean(unit?.name || unit?.baseId) || "Unknown";
  const image = clean(unit?.image);
  if (image) return `<span class="gac-brief-unit" title="${escapeHtml(name)}"><img src="${escapeHtml(image)}" alt="" loading="lazy"><small>${escapeHtml(name)}</small></span>`;
  return `<span class="gac-brief-unit" title="${escapeHtml(name)}"><span>${escapeHtml(name.slice(0, 2).toUpperCase())}</span><small>${escapeHtml(name)}</small></span>`;
}
function metric(label, value, title = "") {
  return `<span${title ? ` title="${escapeHtml(title)}"` : ""}><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>`;
}
function riskIcon(severity) { return severity === "warning" ? "⚠" : severity === "critical" ? "✖" : "•"; }
function renderRisks(risks = []) {
  if (!risks.length) return `<div class="gac-brief-clear"><strong>NO ELEVATED KNOWN-RISK FLAG</strong><span>Current evidence did not trigger a roster/history/Datacron warning. This is not a guarantee of victory.</span></div>`;
  return `<div class="gac-brief-risk-list">${risks.map((entry) => `<article class="gac-brief-risk is-${escapeHtml(entry.severity)}"><b>${riskIcon(entry.severity)}</b><div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.detail)}</p><small>${escapeHtml(entry.evidenceType)} evidence</small></div></article>`).join("")}</div>`;
}
function renderChecks(checks = []) {
  const mark = (status) => status === "ready" ? "✓" : status === "not-selected" ? "—" : "?";
  return `<div class="gac-brief-checks">${checks.map((entry) => `<article class="is-${escapeHtml(entry.status)}"><b>${mark(entry.status)}</b><div><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.detail)}</span></div></article>`).join("")}</div>`;
}
function guidanceList(label, rows = []) {
  if (!rows.length) return "";
  return `<div><strong>${escapeHtml(label)}</strong><ol>${rows.map((row) => `<li>${escapeHtml(row.text)}${row.note ? `<small>${escapeHtml(row.note)}</small>` : ""}</li>`).join("")}</ol></div>`;
}
function renderExecution(execution = {}) {
  if (execution.available !== true) {
    return `<section class="gac-brief-execution is-gated"><span>SOURCE-GATED EXECUTION</span><strong>${escapeHtml(execution.label || "NO SOURCED EXECUTION SEQUENCE")}</strong><p>${escapeHtml(execution.reason || "No sourced tactical sequence is loaded.")}</p><small>The Command Center will not invent an opening ability, first target, kill order, or turn sequence.</small></section>`;
  }
  return `<section class="gac-brief-execution"><span>${escapeHtml(execution.label)}</span><strong>${escapeHtml(execution.sourceName)}</strong><p>${escapeHtml(execution.sourceRef)}${execution.sourceUpdatedAt ? ` · ${escapeHtml(execution.sourceUpdatedAt)}` : ""}</p><div class="gac-brief-guidance-grid">${guidanceList("OPENING", execution.opening)}${guidanceList("TARGETS", execution.targets)}${guidanceList("MECHANICS", execution.mechanics)}${guidanceList("AVOID", execution.avoid)}</div></section>`;
}
function evidenceLine(match) {
  if (!match) return `<div class="gac-brief-evidence"><strong>No exact actionable historical sample attached</strong><span>No historical win percentage is displayed for the selected primary.</span></div>`;
  const rate = observedPercent(match.observedWinRate);
  const rateText = rate == null ? "rate unknown" : `${number.format(rate)}% observed`;
  return `<div class="gac-brief-evidence"><strong>${escapeHtml(match.reliability?.label || "Historical sample")} · ${number.format(Number(match.wins || 0))}/${number.format(Number(match.battles || 0))} observed wins</strong><span>${escapeHtml(rateText)} · ${number.format(Number(match.holds || 0))} holds · ${number.format(Number(match.draws || 0))} draws · not a predicted win rate</span></div>`;
}
function datacronContext(card, context, primary, eligibility) {
  const id = clean(card?.dataset?.recommendedDatacronId);
  if (!id) return Object.freeze({ selected: false, id: "", label: "", coverage: null });
  const datacron = (Array.isArray(context.mineRoster?.datacrons) ? context.mineRoster.datacrons : []).find((entry) => clean(entry?.id) === id) || null;
  if (!datacron || !eligibility) return Object.freeze({ selected: true, id, label: `Datacron ${id}`, coverage: null });
  const coverage = squadCoverage(datacron, primary, eligibility.unitIndex, eligibility.datacronCatalog);
  return Object.freeze({ selected: true, id, label: datacronLabel(datacron, eligibility.datacronCatalog), coverage });
}
function renderBrief(body, card, context, defense, primary, defenders, evidenceMatch, heuristicMatch, datacron, attackerReadiness, defenderReadiness) {
  const delta = matchupDelta(primary, defenders, {
    attackerScore: attackerReadiness?.known === true ? attackerReadiness.score : null,
    defenderScore: defenderReadiness?.known === true ? defenderReadiness.score : null,
  });
  const allocationReason = clean(card.querySelector(".gac-board-strategy strong")?.textContent) || "Authoritative board-wide allocation";
  const brief = buildAttackBrief({
    evidenceMatch,
    heuristicMatch,
    delta,
    abilityConcerns: abilityConcerns(primary, 5),
    abilityKnown: attackerReadiness?.known === true,
    datacron,
    allocationReason,
    executionGuidance: {},
  });
  const dcText = datacron.selected
    ? `${datacron.label || datacron.id}${datacron.coverage ? ` · ${datacron.coverage.eligibleMembers}/${datacron.coverage.squadSize} resolved ability-target coverage` : " · coverage unresolved"}`
    : "No owned Datacron selected";
  const warningCount = brief.risks.filter((entry) => entry.severity === "warning" || entry.severity === "critical").length;
  const header = body.closest("details")?.querySelector("summary strong");
  if (header) header.textContent = `${brief.source} · ${warningCount} warning${warningCount === 1 ? "" : "s"}`;
  body.innerHTML = `
    <section class="gac-brief-primary">
      <div><span>PRIMARY ATTACK</span><strong>${escapeHtml(brief.source)}</strong><p>${escapeHtml(brief.allocationReason)}</p></div>
      <div class="gac-brief-units">${primary.map(portrait).join("")}</div>
      ${evidenceLine(evidenceMatch)}
      <div class="gac-brief-metrics">
        ${metric("Relic Δ", signed(delta.relicDelta))}
        ${metric("Zeta Δ", signed(delta.zetaDelta))}
        ${metric("Omicron Δ", signed(delta.omicronDelta), "Purchased Omicron count only; mode applicability is not inferred.")}
        ${metric("Fastest Δ", signed(delta.speedDelta), "Fastest known attacker speed minus fastest known defender speed. This is not a turn-order simulation.")}
        ${metric("Ability Δ", signed(delta.abilityDelta), "Roster ability-readiness heuristic only.")}
      </div>
      <div class="gac-brief-datacron"><small>DATACRON</small><strong>${escapeHtml(dcText)}</strong></div>
    </section>
    <section class="gac-brief-section"><div class="gac-brief-section-head"><span>KNOWN RISKS</span><strong>Evidence-derived warnings only</strong></div>${renderRisks(brief.risks)}</section>
    <section class="gac-brief-section"><div class="gac-brief-section-head"><span>BEFORE BATTLE</span><strong>Truth-gated checklist</strong></div>${renderChecks(brief.checks)}</section>
    ${renderExecution(brief.execution)}
    <section class="gac-brief-footer"><strong>RECOVERY</strong><span>Use “WHY THIS COUNTER?” for recovery-safe alternates if the first attempt fails.</span><small>${escapeHtml(brief.truthBoundary)}</small></section>`;
}
function shell(card) {
  let details = card.querySelector(".gac-war-room-attack-brief");
  if (details) return details;
  details = document.createElement("details");
  details.className = "gac-war-room-attack-brief";
  details.dataset.stale = "true";
  details.dataset.renderToken = "0";
  details.innerHTML = `<summary><span>⚔ ATTACK BRIEF</span><strong>Known risks · sourced execution only</strong></summary><div class="gac-war-room-attack-brief-body"><div class="workspace-note">Open this brief to resolve the current matchup evidence.</div></div>`;
  details.addEventListener("toggle", () => {
    if (details.open && details.dataset.stale !== "false") void renderCard(card, details);
  });
  const inspector = card.querySelector(".gac-counter-inspector");
  const warRoom = card.querySelector(".gac-war-room");
  if (inspector) inspector.insertAdjacentElement("beforebegin", details);
  else if (warRoom) warRoom.insertAdjacentElement("beforebegin", details);
  else card.append(details);
  return details;
}
async function renderCard(card, details = shell(card), { force = false } = {}) {
  const current = identity();
  if (!current) return;
  const body = details.querySelector(".gac-war-room-attack-brief-body");
  const token = String((Number(details.dataset.renderToken || 0) || 0) + 1);
  details.dataset.renderToken = token;
  body.innerHTML = `<div class="workspace-note">Resolving current Attack Brief…</div>`;
  try {
    const context = await loadContext(current, force);
    const [evidenceByLeader, eligibility] = await Promise.all([loadEvidence(context, force), loadEligibility()]);
    if (details.dataset.renderToken !== token || !details.open) return;
    const defenseId = Number(card?.dataset?.defenseId || 0);
    const defense = context.enemyDefenses.find((entry) => Number(entry?.id) === defenseId);
    const attackerIds = primaryIds(card);
    if (!defense || !attackerIds.length) {
      body.innerHTML = `<div class="workspace-note">No authoritative current counter is available for this defense yet.</div>`;
      return;
    }
    const primary = unitsForIds(context.mineRoster, attackerIds);
    const defenderIds = Array.isArray(defense?.members) ? defense.members : [];
    const defenders = unitsForIds(context.opponentRoster, defenderIds);
    if (primary.length !== attackerIds.length || defenders.length !== defenderIds.length) {
      body.innerHTML = `<div class="workspace-note">Attack Brief withheld because the current attacker or defender roster could not be resolved completely.</div>`;
      return;
    }
    const leader = normalizeBaseId(defense?.leaderBaseId || defense?.members?.[0]);
    const evidenceEntry = evidenceByLeader.get(leader) || null;
    const evidenceMatch = primaryEvidenceMatch(context.mineRoster, defense, evidenceEntry, attackerIds, { size: current.size });
    const heuristicMatch = evidenceMatch ? null : primaryHeuristicMatch(context.mineRoster, defenders, attackerIds, { size: current.size });
    const attackerReadiness = squadAbilityReadiness(primary);
    const defenderReadiness = squadAbilityReadiness(defenders);
    const datacron = datacronContext(card, context, primary, eligibility);
    renderBrief(body, card, context, defense, primary, defenders, evidenceMatch, heuristicMatch, datacron, attackerReadiness, defenderReadiness);
    details.dataset.stale = "false";
  } catch (error) {
    if (details.dataset.renderToken !== token || !details.open) return;
    if ([401, 409].includes(Number(error?.status))) {
      body.innerHTML = `<div class="workspace-note">Attack Brief unavailable until the verified current opponent/board context is restored.</div>`;
      return;
    }
    console.warn("GAC Attack Brief unavailable", error);
    body.innerHTML = `<div class="workspace-note">Attack Brief evidence could not be resolved. No tactical instructions were generated.</div>`;
  }
}
function markStale({ force = false } = {}) {
  for (const card of document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")) {
    const details = shell(card);
    details.dataset.stale = "true";
    if (details.open) void renderCard(card, details, { force });
  }
}
function ensureShells() {
  for (const card of document.querySelectorAll("#gacBoardPlannerGrid .gac-saved-board-card")) shell(card);
}
function schedule(delay = 120, options = {}) {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    ensureShells();
    if (options.stale) markStale({ force: options.force === true });
  }, Math.max(0, delay));
}
function injectStyles() {
  if (document.querySelector('link[data-gac-attack-brief="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/gac-war-room-attack-brief.css?v=20260820-brief1";
  link.dataset.gacAttackBrief = "true";
  document.head.append(link);
}
function bind() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (document.documentElement.dataset.gacAttackBriefBound === "true") return;
  document.documentElement.dataset.gacAttackBriefBound = "true";
  injectStyles();
  window.addEventListener("gac-saved-board-rendered", () => schedule(180));
  window.addEventListener("gac-war-room-updated", () => schedule(120, { stale: true }));
  window.addEventListener("gac-board-evidence-updated", () => {
    resetContext();
    schedule(160, { stale: true, force: true });
  });
  document.addEventListener("change", (event) => {
    if (["allyCode", "gacOpponentCode", "gacBracketRound", "gacMode"].includes(event.target?.id)) {
      resetContext();
      schedule(180, { stale: true, force: true });
    }
  });
  window.addEventListener("hashchange", resetContext);
  document.addEventListener("DOMContentLoaded", () => schedule(260), { once: true });
  schedule(320);
}

if (typeof window !== "undefined" && typeof document !== "undefined") bind();

export { evidenceBatch, evidenceMapFromBatch, identity, loadContext, primaryIds };
