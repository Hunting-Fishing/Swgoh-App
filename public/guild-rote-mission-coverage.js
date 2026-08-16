import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";

const state = {
  allyCode: "",
  guild: null,
  catalog: null,
  coverage: null,
  loading: false,
  view: "missions",
  phase: "All",
  status: "All",
  search: "",
  shown: 40,
  renderKey: "",
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const response = await fetch("/data/catalog.json?guild-rote-missions=1", { cache: "no-cache" });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static unit catalog is unavailable for guild mission eligibility.");
  state.catalog = body.units;
  return state.catalog;
}

function guildPanel() {
  return document.querySelector('[data-workspace-panel="guild"]');
}

function installShell() {
  const panel = guildPanel();
  if (!panel || $("guildRoteMissionCoverage")) return Boolean(panel);
  const shell = document.createElement("section");
  shell.id = "guildRoteMissionCoverage";
  shell.className = "card workspace-intro guild-mission-coverage";
  shell.innerHTML = '<div class="guild-mission-loading">Load an Ally Code to calculate guild mission coverage.</div>';
  const critical = $("guildRoteCritical")?.closest("section.card");
  if (critical?.parentNode === panel) panel.insertBefore(shell, critical);
  else panel.appendChild(shell);
  return true;
}

function statusLabel(mission) {
  if (mission.evidence !== "exact") return "PARTIAL EVIDENCE";
  if (mission.exactReady.length === 0) return "ZERO COVERAGE";
  if (mission.exactReady.length === 1) return "SINGLE OWNER";
  if (mission.exactReady.length <= 3) return "THIN";
  return "DEEP";
}

function statusTone(mission) {
  if (mission.evidence !== "exact") return "partial";
  return mission.coverageBand;
}

function memberProgressLabel(evaluation) {
  if (!evaluation?.member) return "No candidate";
  if (evaluation.exactReady) return "Entry ready";
  if (evaluation.knownGateReady) return "Known gate met";
  const parts = [];
  if (evaluation.mandatoryBlockers) parts.push(`${evaluation.mandatoryBlockers} mandatory blocker${evaluation.mandatoryBlockers === 1 ? "" : "s"}`);
  if (evaluation.poolShortfall) parts.push(`${evaluation.poolShortfall} pool short`);
  if (!parts.length) parts.push(`${evaluation.percent}% entry`);
  return parts.join(" · ");
}

function missionMatches(mission) {
  if (state.phase !== "All" && mission.phase !== state.phase) return false;
  if (state.status !== "All") {
    if (state.status === "Zero" && !(mission.evidence === "exact" && mission.exactReady.length === 0)) return false;
    if (state.status === "Fragile" && !(mission.evidence === "exact" && mission.exactReady.length === 1)) return false;
    if (state.status === "Redundant" && !(mission.evidence === "exact" && mission.exactReady.length >= state.coverage.redundancyTarget)) return false;
    if (state.status === "Partial" && mission.evidence === "exact") return false;
  }
  const query = normalize(state.search);
  if (!query) return true;
  const members = [...mission.exactReady, ...mission.close.slice(0, 4)].map((row) => row.member?.name).join(" ");
  return normalize(`${mission.phase} ${mission.planetName} ${mission.lane} ${mission.mission?.name || ""} ${members}`).includes(query);
}

function summaryMarkup() {
  const summary = state.coverage.summary;
  return `<div class="guild-mission-summary">
    <article><span>EXACT MISSION COVERAGE</span><strong>${summary.exactCoveragePercent}%</strong><small>${summary.exactMissions - summary.zeroCoverageMissions}/${summary.exactMissions} exact missions have ≥1 ready member</small></article>
    <article><span>2+ MEMBER REDUNDANCY</span><strong>${summary.redundancyCoveragePercent}%</strong><small>${summary.redundancyReadyMissions}/${summary.exactMissions} exact missions meet redundancy target</small></article>
    <article class="danger"><span>ZERO COVERAGE</span><strong>${number(summary.zeroCoverageMissions)}</strong><small>Verified missions with no entry-ready guild member</small></article>
    <article class="warning"><span>SINGLE OWNER</span><strong>${number(summary.fragileMissions)}</strong><small>Guild is dependent on one ready roster</small></article>
    <article><span>PARTIAL FLEET EVIDENCE</span><strong>${number(summary.partialEvidenceMissions)}</strong><small>Excluded from exact-ready claims</small></article>
    <article><span>HYDRATED MEMBERS</span><strong>${number(summary.hydratedMembers)} / ${number(summary.totalMembers)}</strong><small>Public rosters evaluated</small></article>
  </div>`;
}

function missionReadyNames(mission) {
  const names = mission.exactReady.slice(0, 4).map((row) => row.member.name);
  if (!names.length && mission.evidence !== "exact") {
    return mission.knownGateReady.slice(0, 4).map((row) => `${row.member.name}*`).join(", ") || "No known-gate match";
  }
  return names.join(", ") + (mission.exactReady.length > 4 ? ` +${mission.exactReady.length - 4}` : "");
}

function missionRow(mission) {
  const best = mission.evaluations.find((row) => row.rosterAvailable) || null;
  const ready = mission.evidence === "exact" ? mission.exactReady.length : mission.knownGateReady.length;
  return `<article class="guild-mission-row tone-${statusTone(mission)}">
    <div class="guild-mission-status"><span>${escapeHtml(statusLabel(mission))}</span><strong>${ready}</strong><small>${mission.evidence === "exact" ? "exact-ready" : "known-gate"}</small></div>
    <div class="guild-mission-identity">
      <span>${escapeHtml(mission.phase)} · ${escapeHtml(mission.planetName)} · ${escapeHtml(mission.lane)}</span>
      <strong>${escapeHtml(mission.mission?.name || mission.key)}</strong>
      <small>${escapeHtml(missionReadyNames(mission) || "No exact-ready member")}</small>
    </div>
    <div class="guild-mission-best">
      <span>BEST CURRENT FIT</span>
      <strong>${escapeHtml(best?.member?.name || "None")}</strong>
      <small>${escapeHtml(memberProgressLabel(best))}</small>
    </div>
    <div class="guild-mission-depth">
      <span>READY / CLOSE</span>
      <strong>${mission.evidence === "exact" ? mission.exactReady.length : "—"} / ${mission.close.length}</strong>
      <small>${mission.evidence === "exact" ? `${Math.max(0, state.coverage.redundancyTarget - mission.exactReady.length)} owner redundancy gap` : "Exact fleet allow-list incomplete"}</small>
    </div>
    <button type="button" class="guild-mission-open" data-guild-mission-planet="${escapeAttr(mission.planetId)}">Open Planet</button>
  </article>`;
}

function renderMissions() {
  const rows = state.coverage.missions.filter(missionMatches);
  return `<div class="guild-mission-section-head"><div><span>COVERAGE MATRIX</span><h3>Verified Mission Entry Coverage</h3><p>Exact-ready counts use verified mission entry restrictions. Generic fleet gates remain partial until a complete selectable-ship rule set is encoded.</p></div><b>${number(rows.length)} missions</b></div>
    <div class="guild-mission-list">${rows.slice(0, state.shown).map(missionRow).join("") || '<div class="guild-mission-empty">No missions match the current filters.</div>'}</div>
    ${rows.length > state.shown ? '<button type="button" class="catalog-more" data-guild-mission-more>Show More Missions</button>' : ""}`;
}

function leadRow(lead) {
  const mission = lead.mission;
  return `<article class="guild-lead-row ${lead.member ? "" : "blocked"}">
    <div><span>${escapeHtml(mission.phase)} · ${escapeHtml(mission.planetName)}</span><strong>${escapeHtml(mission.mission?.name || mission.key)}</strong><small>${mission.exactReady.length} exact-ready member${mission.exactReady.length === 1 ? "" : "s"}</small></div>
    <div><span>MISSION LEAD</span><strong>${escapeHtml(lead.member?.name || "UNASSIGNED")}</strong><small>${lead.member ? `${number(lead.member.galacticPower)} GP` : "No exact-ready member"}</small></div>
    <div><span>ALTERNATES</span><strong>${escapeHtml(lead.alternatives?.map((member) => member.name).join(", ") || "None")}</strong><small>Responsibility draft only — not a unit deployment reservation.</small></div>
    <button type="button" data-guild-mission-planet="${escapeAttr(mission.planetId)}">Open Planet</button>
  </article>`;
}

function renderLeads() {
  const query = normalize(state.search);
  const rows = state.coverage.leads.filter((lead) => {
    if (state.phase !== "All" && lead.mission.phase !== state.phase) return false;
    if (!query) return true;
    return normalize(`${lead.mission.phase} ${lead.mission.planetName} ${lead.mission.mission?.name || ""} ${lead.member?.name || ""} ${lead.alternatives?.map((member) => member.name).join(" ") || ""}`).includes(query);
  });
  return `<div class="guild-mission-section-head"><div><span>OFFICER RESPONSIBILITY DRAFT</span><h3>Mission Leads</h3><p>Scarce missions are assigned first, then lead responsibility is balanced across exact-ready members. This selects an officer-facing mission owner; it does not claim those units are reserved or conflict-free across combat missions.</p></div><b>${number(rows.filter((row) => row.member).length)} assigned</b></div>
    <div class="guild-lead-list">${rows.slice(0, state.shown).map(leadRow).join("") || '<div class="guild-mission-empty">No mission leads match the filters.</div>'}</div>`;
}

function farmCurrentLabel(row) {
  const unit = row.unit;
  if (!unit) return "Not owned";
  if (String(unit.unitType || "Character") === "Ship") return `${number(unit.stars)}★`;
  return Number(unit.relic || 0) > 0 ? `R${number(unit.relic)}` : `G${number(unit.gear || 0)} · ${number(unit.stars)}★`;
}

function farmRow(row) {
  const refs = row.missionRefs.slice(0, 3);
  return `<article class="guild-farm-row">
    <div class="guild-farm-person"><span>DEVELOP</span><strong>${escapeHtml(row.member.name)}</strong><small>${number(row.member.galacticPower)} GP</small></div>
    <div class="guild-farm-unit"><span>UNIT</span><strong>${escapeHtml(row.unitName)}</strong><small>${escapeHtml(farmCurrentLabel(row))} → ${escapeHtml(row.gapLabel)}</small></div>
    <div class="guild-farm-impact"><span>MISSION IMPACT</span><strong>${row.missionImpact}</strong><small>${row.mandatoryImpact} mandatory · ${row.poolImpact} pool depth</small></div>
    <div class="guild-farm-refs">${refs.map((mission) => `<button type="button" data-guild-mission-planet="${escapeAttr(mission.planetId)}"><span>${escapeHtml(mission.phase)} · ${escapeHtml(mission.planetName)}</span><strong>${escapeHtml(mission.mission?.name || mission.key)}</strong></button>`).join("")}</div>
    ${row.baseId ? `<button type="button" class="guild-farm-inspect" data-inspect-base-id="${escapeAttr(row.baseId)}">Inspect Unit</button>` : ""}
  </article>`;
}

function renderFarms() {
  const query = normalize(state.search);
  const rows = state.coverage.farms.filter((row) => {
    if (state.phase !== "All" && !row.missionRefs.some((mission) => mission.phase === state.phase)) return false;
    if (!query) return true;
    return normalize(`${row.member.name} ${row.unitName} ${row.baseId} ${row.missionRefs.map((mission) => `${mission.phase} ${mission.planetName} ${mission.mission?.name || ""}`).join(" ")}`).includes(query);
  });
  return `<div class="guild-mission-section-head"><div><span>REDUNDANCY FARMING</span><h3>Guild Mission Farm Priorities</h3><p>These are member-specific upgrades that improve verified mission coverage toward the ${state.coverage.redundancyTarget}-owner target. Mandatory blockers outrank general pool-depth candidates.</p></div><b>${number(rows.length)} targets</b></div>
    <div class="guild-farm-list">${rows.slice(0, state.shown).map(farmRow).join("") || '<div class="guild-mission-empty">No evidence-safe mission farm targets match the filters.</div>'}</div>`;
}

function memberRow(row) {
  return `<article class="guild-member-coverage-row">
    <div><strong>${escapeHtml(row.member.name)}</strong><span>${number(row.member.galacticPower)} GP</span></div>
    <div><span>EXACT READY</span><strong>${number(row.exactReady)}</strong></div>
    <div class="${row.soleOwner ? "danger" : ""}"><span>SOLE-OWNER MISSIONS</span><strong>${number(row.soleOwner)}</strong></div>
    <div><span>CLOSE</span><strong>${number(row.close)}</strong></div>
    <div><span>MISSION LEADS</span><strong>${number(row.missionLeads)}</strong></div>
    <div><span>KNOWN FLEET GATES</span><strong>${number(row.knownGate)}</strong></div>
  </article>`;
}

function renderMembers() {
  const query = normalize(state.search);
  const rows = state.coverage.memberCoverage.filter((row) => !query || normalize(`${row.member.name} ${row.member.allyCode}`).includes(query));
  return `<div class="guild-mission-section-head"><div><span>ROSTER CONCENTRATION</span><h3>Member Mission Coverage</h3><p>Use sole-owner counts to identify guild risk. Deep coverage is useful redundancy; this screen does not label extra investment as waste because those units may have value elsewhere.</p></div><b>${number(rows.length)} members</b></div>
    <div class="guild-member-coverage-list">${rows.slice(0, state.shown).map(memberRow).join("") || '<div class="guild-mission-empty">No members match the filters.</div>'}</div>`;
}

function outputMarkup() {
  if (state.view === "leads") return renderLeads();
  if (state.view === "farms") return renderFarms();
  if (state.view === "members") return renderMembers();
  return renderMissions();
}

function phaseOptions() {
  const phases = [...new Set(state.coverage.missions.map((mission) => mission.phase))];
  return ["All", ...phases].map((phase) => `<option value="${escapeAttr(phase)}"${state.phase === phase ? " selected" : ""}>${escapeHtml(phase === "All" ? "All phases" : phase)}</option>`).join("");
}

function renderCoverage() {
  const shell = $("guildRoteMissionCoverage");
  if (!shell || !state.coverage) return;
  shell.innerHTML = `
    <div class="guild-mission-header">
      <div><div class="kicker">ROTE COMBAT + FLEET MISSION INTELLIGENCE</div><h2>Guild Mission Coverage Command</h2><p>Evaluate every hydrated guild roster against verified ROTE mission entry gates, identify fragile single-owner coverage, assign mission responsibility, and rank the smallest upgrades that create redundancy.</p></div>
      <span class="status ready">${state.coverage.summary.exactCoveragePercent}% exact coverage</span>
    </div>
    ${summaryMarkup()}
    <div class="guild-mission-boundary"><strong>Planner boundary:</strong> this is mission <em>entry coverage</em>, not a guaranteed battle-win model. Mission Lead assignments are officer responsibility suggestions only. Generic fleets remain partial until full ship restrictions are encoded.</div>
    <div class="guild-mission-toolbar">
      <div class="guild-mission-tabs">
        ${[["missions", "Coverage Matrix"], ["leads", "Mission Leads"], ["farms", "Farm Priorities"], ["members", "Member Coverage"]].map(([value, label]) => `<button type="button" data-guild-mission-view="${value}" class="${state.view === value ? "active" : ""}">${label}</button>`).join("")}
      </div>
      <label>Phase<select data-guild-mission-phase>${phaseOptions()}</select></label>
      ${state.view === "missions" ? `<label>Status<select data-guild-mission-status>${["All", "Zero", "Fragile", "Redundant", "Partial"].map((value) => `<option${state.status === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>` : ""}
      <label class="search">Search<input type="search" data-guild-mission-search value="${escapeAttr(state.search)}" placeholder="Mission, planet, member, unit…"></label>
      <button type="button" data-guild-mission-refresh>Refresh Coverage</button>
    </div>
    <div data-guild-mission-output>${outputMarkup()}</div>`;
}

function renderLoading(message, tone = "") {
  const shell = $("guildRoteMissionCoverage");
  if (!shell) return;
  shell.innerHTML = `<div class="guild-mission-loading ${escapeAttr(tone)}"><strong>Guild Mission Coverage</strong><span>${escapeHtml(message)}</span></div>`;
}

async function loadCoverage(force = false) {
  installShell();
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) {
    renderLoading("Load a 9-digit Ally Code to evaluate guild ROTE mission coverage.");
    return;
  }
  if (state.loading) return;
  if (!force && state.allyCode === allyCode && state.coverage) {
    renderCoverage();
    return;
  }
  state.loading = true;
  renderLoading("Hydrating guild rosters and verified mission rules…");
  try {
    const [guild, catalog] = await Promise.all([
      fetchJson(`/api/guild/by-player/${allyCode}/roster`),
      loadCatalog(),
    ]);
    state.allyCode = allyCode;
    state.guild = guild;
    state.coverage = buildGuildRoteMissionCoverage(guild, catalog, { redundancyTarget: 2 });
    state.shown = 40;
    renderCoverage();
  } catch (error) {
    renderLoading(error?.message || "Guild mission coverage is unavailable.", "danger");
  } finally {
    state.loading = false;
  }
}

function rerenderOutput() {
  const output = document.querySelector("[data-guild-mission-output]");
  if (output && state.coverage) output.innerHTML = outputMarkup();
}

function install() {
  if (!installShell()) {
    const observer = new MutationObserver(() => {
      if (installShell()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const view = event.target.closest?.("[data-guild-mission-view]");
    if (view) {
      state.view = view.dataset.guildMissionView || "missions";
      state.status = "All";
      state.shown = 40;
      renderCoverage();
      return;
    }
    if (event.target.closest?.("[data-guild-mission-refresh]")) {
      state.coverage = null;
      loadCoverage(true);
      return;
    }
    if (event.target.closest?.("[data-guild-mission-more]")) {
      state.shown += 40;
      rerenderOutput();
      return;
    }
    const planet = event.target.closest?.("[data-guild-mission-planet]");
    if (planet) {
      const planetId = String(planet.dataset.guildMissionPlanet || "");
      document.querySelector('button[data-workspace-tab="rote"]')?.click();
      setTimeout(() => {
        document.querySelector('button[data-rote-view="map"]')?.click();
        setTimeout(() => document.querySelector(`#roteGalaxyMap [data-rote-planet="${planetId}"]`)?.click(), 0);
      }, 0);
      return;
    }
    if (event.target.closest?.('button[data-workspace-tab="guild"]')) setTimeout(() => loadCoverage(false), 150);
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-guild-mission-phase]")) state.phase = event.target.value || "All";
    else if (event.target.matches?.("[data-guild-mission-status]")) state.status = event.target.value || "All";
    else return;
    state.shown = 40;
    rerenderOutput();
  });

  document.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-guild-mission-search]")) return;
    state.search = event.target.value || "";
    state.shown = 40;
    rerenderOutput();
  });

  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.guild = null;
    state.coverage = null;
    state.search = "";
    state.phase = "All";
    state.status = "All";
    setTimeout(() => {
      if (location.hash.toLowerCase() === "#guild") loadCoverage(true);
    }, 500);
  });

  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#guild") setTimeout(() => loadCoverage(false), 150);
  });

  if (location.hash.toLowerCase() === "#guild") setTimeout(() => loadCoverage(false), 150);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
