import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";
import {
  buildGuildRoteStrategyAudit,
  STRATEGY_AUDIT_STATE,
} from "./guild-rote-strategy-audit-model.js";
import { STRATEGY_COVERAGE } from "./tb-strategy-coverage.js";

const state = {
  catalogPromise: null,
  catalog: [],
  coverage: null,
  audit: null,
  key: "",
  loading: false,
  phase: "All",
  stateFilter: "All",
  strategyFilter: "All",
  search: "",
  shown: 40,
  scheduled: false,
};

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function loadCatalog() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?guild-strategy-audit=1", { cache: "no-cache" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static unit catalog is unavailable.");
      state.catalog = body.units;
      return body.units;
    });
  return state.catalogPromise;
}

function auditShell() {
  return document.getElementById("guildRoteStrategyAudit");
}

function installShell() {
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel || auditShell()) return Boolean(panel);
  const shell = document.createElement("details");
  shell.id = "guildRoteStrategyAudit";
  shell.className = "card guild-strategy-audit";
  shell.innerHTML = `
    <summary>
      <div><span>ROTE DATA QUALITY + BATTLE GUIDANCE</span><strong>Strategy Evidence Audit</strong><small>Cross-check guild entry coverage against sourced battle-strategy evidence.</small></div>
      <b data-guild-strategy-audit-badge>Open audit</b>
    </summary>
    <div class="guild-strategy-audit-body" data-guild-strategy-audit-body><div class="guild-strategy-loading">Open this audit to load current guild strategy evidence.</div></div>`;
  const coverage = document.getElementById("guildRoteMissionCoverage");
  if (coverage?.parentNode === panel) coverage.insertAdjacentElement("afterend", shell);
  else panel.appendChild(shell);
  shell.addEventListener("toggle", () => {
    if (shell.open) loadAudit(false);
  });
  return true;
}

function stateLabel(row) {
  if (row.state === STRATEGY_AUDIT_STATE.STRATEGY_GAP) return "STRATEGY RESEARCH GAP";
  if (row.state === STRATEGY_AUDIT_STATE.ROSTER_GAP) return "ROSTER GAP";
  if (row.state === STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL) return "ENTRY EVIDENCE PARTIAL";
  return "ENTRY + STRATEGY EVIDENCE";
}

function stateTone(row) {
  if (row.state === STRATEGY_AUDIT_STATE.STRATEGY_GAP) return "research";
  if (row.state === STRATEGY_AUDIT_STATE.ROSTER_GAP) return "roster";
  if (row.state === STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL) return "partial";
  return "evidence";
}

function strategyLabel(strategy = {}) {
  if (strategy.coverage === STRATEGY_COVERAGE.COVERED) return "COVERED";
  if (strategy.coverage === STRATEGY_COVERAGE.PARTIAL) return "PARTIAL";
  return "MISSING";
}

function closestLabel(row) {
  if (row.entryEvidence !== "exact") return `${row.knownGateCount} known-gate roster${row.knownGateCount === 1 ? "" : "s"}`;
  if (row.exactReadyCount > 0) return `${row.exactReadyCount} exact-ready member${row.exactReadyCount === 1 ? "" : "s"}`;
  if (!row.closestMember) return "No hydrated candidate";
  const parts = [`${row.closestMember.name} · ${row.closestPercent}% entry`];
  if (row.closestMandatoryBlockers) parts.push(`${row.closestMandatoryBlockers} mandatory blocker${row.closestMandatoryBlockers === 1 ? "" : "s"}`);
  if (row.closestPoolShortfall) parts.push(`${row.closestPoolShortfall} pool short`);
  return parts.join(" · ");
}

function matchesFilters(row) {
  if (state.phase !== "All" && row.phase !== state.phase) return false;
  if (state.stateFilter !== "All" && row.state !== state.stateFilter) return false;
  if (state.strategyFilter !== "All" && row.strategy.coverage !== state.strategyFilter) return false;
  const query = normalize(state.search);
  if (!query) return true;
  return normalize(`${row.phase} ${row.planetName} ${row.lane} ${row.missionName} ${row.missionType} ${row.strategy.coverage} ${row.strategy.strategyStatus} ${row.strategy.confidence} ${row.closestMember?.name || ""}`).includes(query);
}

function summaryMarkup() {
  const summary = state.audit.summary;
  return `<div class="guild-strategy-summary">
    <article><span>PLANNING EVIDENCE READY</span><strong>${number(summary.planningEvidenceReady)}</strong><small>Exact entry coverage + sourced complete strategy evidence</small></article>
    <article class="research"><span>STRATEGY RESEARCH GAP</span><strong>${number(summary.strategyGap)}</strong><small>Guild can enter, but strategy evidence is partial or missing</small></article>
    <article class="roster"><span>ROSTER GAP</span><strong>${number(summary.rosterGap)}</strong><small>Exact mission entry has no ready guild member</small></article>
    <article><span>STRATEGY COVERAGE</span><strong>${summary.strategyCoveragePercent}%</strong><small>${number(summary.coveredStrategy)} covered · ${number(summary.partialStrategy)} partial · ${number(summary.missingStrategy)} missing</small></article>
    <article><span>ACTIONABLE PLANNING SET</span><strong>${summary.actionablePlanningPercent}%</strong><small>Share of exact-entry missions with both roster and strategy evidence</small></article>
    <article><span>PARTIAL ENTRY EVIDENCE</span><strong>${number(summary.partialEntry)}</strong><small>Not included in exact planning-evidence claims</small></article>
  </div>`;
}

function strategyMeta(row) {
  const strategy = row.strategy || {};
  const meta = [];
  if (strategy.sourceCount) meta.push(`${strategy.sourceCount} source${strategy.sourceCount === 1 ? "" : "s"}`);
  if (strategy.stageCount) meta.push(`${strategy.stageCount} stage${strategy.stageCount === 1 ? "" : "s"}`);
  if (strategy.lastVerified) meta.push(`verified ${strategy.lastVerified}`);
  if (strategy.confidence) meta.push(strategy.confidence);
  return meta.join(" · ") || strategy.reason || "No sourced strategy pack resolved.";
}

function rowMarkup(row) {
  return `<article class="guild-strategy-row tone-${stateTone(row)}">
    <div class="guild-strategy-state"><span>${escapeHtml(stateLabel(row))}</span><strong>${escapeHtml(row.phase)}</strong><small>${escapeHtml(row.planetName)}</small></div>
    <div class="guild-strategy-mission"><span>${escapeHtml(row.lane)} · ${escapeHtml(row.missionType)}</span><strong>${escapeHtml(row.missionName)}</strong><small>${escapeHtml(closestLabel(row))}</small></div>
    <div class="guild-strategy-entry"><span>ENTRY EVIDENCE</span><strong>${escapeHtml(row.entryEvidence === "exact" ? "EXACT" : "PARTIAL")}</strong><small>${row.entryEvidence === "exact" ? `${row.exactReadyCount} exact-ready` : `${row.knownGateCount} known-gate only`}</small></div>
    <div class="guild-strategy-pack"><span>STRATEGY EVIDENCE</span><strong>${escapeHtml(strategyLabel(row.strategy))}</strong><small>${escapeHtml(strategyMeta(row))}</small></div>
    <button type="button" data-guild-strategy-planet="${escapeAttr(row.planetId)}">Open Planet</button>
  </article>`;
}

function outputMarkup() {
  const rows = state.audit.rows.filter(matchesFilters);
  return `<div class="guild-strategy-list">${rows.slice(0, state.shown).map(rowMarkup).join("") || '<div class="guild-strategy-empty">No missions match the current audit filters.</div>'}</div>
    ${rows.length > state.shown ? '<button type="button" class="catalog-more" data-guild-strategy-more>Show More Audit Rows</button>' : ""}`;
}

function toolbarMarkup() {
  const phases = [...new Set(state.audit.rows.map((row) => row.phase))];
  const states = [
    ["All", "All states"],
    [STRATEGY_AUDIT_STATE.STRATEGY_GAP, "Strategy research gap"],
    [STRATEGY_AUDIT_STATE.ROSTER_GAP, "Roster gap"],
    [STRATEGY_AUDIT_STATE.PLANNING_EVIDENCE_READY, "Entry + strategy evidence"],
    [STRATEGY_AUDIT_STATE.ENTRY_EVIDENCE_PARTIAL, "Partial entry evidence"],
  ];
  return `<div class="guild-strategy-toolbar">
    <label>Phase<select data-guild-strategy-phase>${["All", ...phases].map((value) => `<option value="${escapeAttr(value)}"${state.phase === value ? " selected" : ""}>${escapeHtml(value === "All" ? "All phases" : value)}</option>`).join("")}</select></label>
    <label>Planning State<select data-guild-strategy-state>${states.map(([value, label]) => `<option value="${escapeAttr(value)}"${state.stateFilter === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
    <label>Strategy Coverage<select data-guild-strategy-coverage>${["All", STRATEGY_COVERAGE.COVERED, STRATEGY_COVERAGE.PARTIAL, STRATEGY_COVERAGE.MISSING].map((value) => `<option value="${escapeAttr(value)}"${state.strategyFilter === value ? " selected" : ""}>${escapeHtml(value === "All" ? "All strategy states" : value)}</option>`).join("")}</select></label>
    <label class="search">Search<input type="search" data-guild-strategy-search value="${escapeAttr(state.search)}" placeholder="Mission, planet, member, strategy…"></label>
    <button type="button" data-guild-strategy-refresh>Refresh Audit</button>
  </div>`;
}

function renderAudit() {
  const body = document.querySelector("[data-guild-strategy-audit-body]");
  const badge = document.querySelector("[data-guild-strategy-audit-badge]");
  if (!body || !state.audit) return;
  if (badge) badge.textContent = `${state.audit.summary.strategyGap} strategy gaps · ${state.audit.summary.rosterGap} roster gaps`;
  body.innerHTML = `
    <div class="guild-strategy-boundary"><strong>Evidence boundary:</strong> “Entry + strategy evidence” means the guild has exact mission-entry coverage and the app has a sourced strategy pack that passes its completeness audit. It is <em>not</em> a guaranteed-win or conflict-free squad claim.</div>
    ${summaryMarkup()}
    ${toolbarMarkup()}
    <div data-guild-strategy-output>${outputMarkup()}</div>`;
}

function renderOutput() {
  const output = document.querySelector("[data-guild-strategy-output]");
  if (output && state.audit) output.innerHTML = outputMarkup();
}

function renderLoading(message, danger = false) {
  const body = document.querySelector("[data-guild-strategy-audit-body]");
  const badge = document.querySelector("[data-guild-strategy-audit-badge]");
  if (body) body.innerHTML = `<div class="guild-strategy-loading${danger ? " danger" : ""}">${escapeHtml(message)}</div>`;
  if (badge) badge.textContent = danger ? "Audit unavailable" : "Loading…";
}

async function loadAudit(force = false) {
  const allyCode = digits(document.getElementById("allyCode")?.value);
  if (allyCode.length !== 9) {
    renderLoading("Load a 9-digit Ally Code to cross-check guild roster coverage against strategy evidence.");
    return;
  }
  if (state.loading) return;
  const key = `${allyCode}:${state.catalog.length}`;
  if (!force && state.audit && state.key === key) {
    renderAudit();
    return;
  }
  state.loading = true;
  renderLoading("Hydrating guild rosters and auditing the current ROTE strategy registry…");
  try {
    const [catalog, response] = await Promise.all([
      loadCatalog(),
      fetch(`/api/guild/by-player/${allyCode}/roster`, { cache: "no-store" }),
    ]);
    const guild = await response.json();
    if (!response.ok || !Array.isArray(guild?.members)) throw new Error(guild?.error || "Guild roster is unavailable.");
    state.coverage = buildGuildRoteMissionCoverage(guild, catalog, { redundancyTarget: 2 });
    state.audit = buildGuildRoteStrategyAudit(state.coverage);
    state.key = `${allyCode}:${catalog.length}`;
    state.shown = 40;
    renderAudit();
  } catch (error) {
    renderLoading(error?.message || "Strategy audit failed.", true);
  } finally {
    state.loading = false;
  }
}

function scheduleShell() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(() => {
    state.scheduled = false;
    installShell();
  });
}

function install() {
  if (!installShell()) {
    const observer = new MutationObserver(() => {
      if (installShell()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-guild-strategy-phase]")) state.phase = event.target.value || "All";
    else if (event.target.matches?.("[data-guild-strategy-state]")) state.stateFilter = event.target.value || "All";
    else if (event.target.matches?.("[data-guild-strategy-coverage]")) state.strategyFilter = event.target.value || "All";
    else return;
    state.shown = 40;
    renderOutput();
  });
  document.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-guild-strategy-search]")) return;
    state.search = event.target.value || "";
    state.shown = 40;
    renderOutput();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-guild-strategy-refresh]")) {
      state.audit = null;
      state.key = "";
      loadAudit(true);
      return;
    }
    if (event.target.closest?.("[data-guild-strategy-more]")) {
      state.shown += 40;
      renderOutput();
      return;
    }
    const planet = event.target.closest?.("[data-guild-strategy-planet]");
    if (planet) {
      const planetId = String(planet.dataset.guildStrategyPlanet || "");
      document.querySelector('button[data-workspace-tab="rote"]')?.click();
      setTimeout(() => {
        document.querySelector('button[data-rote-view="map"]')?.click();
        setTimeout(() => document.querySelector(`#roteGalaxyMap [data-rote-planet="${planetId}"]`)?.click(), 0);
      }, 0);
    }
  });
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.audit = null;
    state.coverage = null;
    state.key = "";
  });
  const observer = new MutationObserver(scheduleShell);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleShell();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
