import { buildGuildRoteMissionCoverage } from "./guild-rote-mission-coverage-model.js";

const state = {
  catalogPromise: null,
  catalog: [],
  catalogStatus: "idle",
  catalogError: "",
  coverage: null,
  coverageKey: "",
  search: "",
  phase: "All",
  kind: "All",
  ownership: "All",
  scheduled: false,
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
const normalize = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function liveSnapshot() {
  return typeof window === "undefined" ? null : window.__swgohLiveSnapshot || null;
}

export function personalGuildSnapshot(body = {}, allyCode = "") {
  const player = body?.player || {};
  return Object.freeze({
    guild: Object.freeze({ id: "personal-roster", name: player.name || "Personal Roster" }),
    members: Object.freeze([Object.freeze({
      playerId: String(player.playerId || player.id || allyCode || "personal"),
      allyCode: String(player.allyCode || allyCode || ""),
      name: String(player.name || player.allyCode || allyCode || "Player"),
      galacticPower: Number(player.galacticPower || player.gp || 0),
      rosterAvailable: true,
      units: Object.freeze([...(body?.units || []), ...(body?.ships || [])]),
    })]),
  });
}

export function gearPlanTarget(row = {}) {
  const unit = row.unit || null;
  if (!unit || String(unit.unitType || "Character") === "Ship") return null;
  const gap = row.maxGap || {};
  const relicGap = Math.max(0, Number(gap.relic || 0));
  const gearGap = Math.max(0, Number(gap.gear || 0));
  if (!relicGap && !gearGap) return null;
  const currentRelic = Math.max(0, Number(unit.relic || 0));
  const currentGear = Math.max(1, Number(unit.gear || 1));
  const relic = relicGap > 0 ? currentRelic + relicGap : currentRelic;
  const gear = relic > 0 ? 13 : Math.min(13, currentGear + gearGap);
  return Object.freeze({ baseId: String(row.baseId || unit.baseId || ""), gear, relic });
}

async function loadCatalog() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogStatus = "loading";
  state.catalogPromise = fetch("/data/catalog.json?rote-priority=2", { cache: "no-cache" })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.units) || !payload.units.length) throw new Error("Static unit catalog is unavailable.");
      state.catalog = payload.units;
      state.catalogStatus = "ready";
      state.catalogError = "";
      state.coverage = null;
      state.coverageKey = "";
      scheduleRender();
      return payload.units;
    })
    .catch((error) => {
      state.catalogStatus = "error";
      state.catalogError = error?.message || "Static unit catalog unavailable";
      scheduleRender();
      return [];
    });
  return state.catalogPromise;
}

function ensurePanel() {
  const mapView = document.getElementById("roteMapView");
  if (!mapView) return null;
  let panel = document.getElementById("roteUpgradePriorityQueue");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "roteUpgradePriorityQueue";
  panel.className = "card rote-priority-card";
  const boundary = mapView.querySelector(":scope > .rote-map-boundary");
  if (boundary) mapView.insertBefore(panel, boundary);
  else mapView.appendChild(panel);
  return panel;
}

function currentLabel(row) {
  const unit = row.unit;
  if (!unit) return "Not owned";
  if (String(unit.unitType || "Character") === "Ship") return `${Number(unit.stars || 0)}★ · ${number(unit.power)} GP`;
  const progression = Number(unit.relic || 0) > 0 ? `R${Number(unit.relic || 0)}` : `G${Number(unit.gear || 0)}`;
  return `${progression} · ${Number(unit.stars || 0)}★ · ${number(unit.power)} GP`;
}

function filteredRows() {
  const rows = state.coverage?.farms || [];
  const query = normalize(state.search);
  return rows.filter((row) => {
    if (state.ownership === "Owned" && !row.unit) return false;
    if (state.ownership === "Missing" && row.unit) return false;
    if (state.kind === "Mandatory" && row.mandatoryImpact <= 0) return false;
    if (state.kind === "Pool" && row.poolImpact <= 0) return false;
    if (state.phase !== "All" && !row.missionRefs.some((mission) => mission.phase === state.phase)) return false;
    if (!query) return true;
    return normalize(`${row.unitName} ${row.baseId} ${row.member?.name || ""} ${row.missionRefs.map((mission) => `${mission.phase} ${mission.planetName} ${mission.mission?.name || ""}`).join(" ")}`).includes(query);
  });
}

function missionRefMarkup(mission) {
  return `<button type="button" class="rote-priority-mission" data-rote-priority-planet="${escapeAttr(mission.planetId)}">
    <span>${escapeHtml(mission.phase)} · ${escapeHtml(mission.planetName)}</span>
    <strong>${escapeHtml(mission.mission?.name || mission.key)}</strong>
  </button>`;
}

function rowMarkup(row, index) {
  const plan = gearPlanTarget(row);
  const refs = row.missionRefs.slice(0, 4);
  const more = Math.max(0, row.missionRefs.length - refs.length);
  return `<article class="rote-priority-row">
    <div class="rote-priority-rank">#${index + 1}</div>
    <div class="rote-priority-unit">
      <strong>${escapeHtml(row.unitName)}</strong>
      <span>${escapeHtml(currentLabel(row))}</span>
      <small>${escapeHtml(row.gapLabel)}</small>
    </div>
    <div class="rote-priority-impact">
      <span><b>${row.missionImpact}</b> mission${row.missionImpact === 1 ? "" : "s"}</span>
      <span><b>${row.mandatoryImpact}</b> mandatory</span>
      <span><b>${row.poolImpact}</b> pool option${row.poolImpact === 1 ? "" : "s"}</span>
    </div>
    <div class="rote-priority-missions">${refs.map(missionRefMarkup).join("")}${more ? `<span class="rote-priority-more">+${more} more</span>` : ""}</div>
    <div class="rote-priority-actions">
      ${row.baseId ? `<button type="button" data-inspect-base-id="${escapeAttr(row.baseId)}">Inspect</button>` : ""}
      ${plan ? `<button type="button" data-rote-priority-plan="${escapeAttr(plan.baseId)}" data-rote-priority-gear="${plan.gear}" data-rote-priority-relic="${plan.relic}">Plan Upgrade</button>` : ""}
    </div>
  </article>`;
}

function summaryMarkup() {
  const summary = state.coverage.summary;
  const ready = Math.max(0, summary.exactMissions - summary.zeroCoverageMissions);
  return `<div class="rote-priority-summary">
    <article><span>EXACT ENTRY READY</span><strong>${ready}/${summary.exactMissions}</strong><small>Verified missions the loaded roster can enter now</small></article>
    <article><span>BLOCKED EXACT MISSIONS</span><strong>${summary.zeroCoverageMissions}</strong><small>Generate farm targets below</small></article>
    <article><span>PRIORITY UNITS</span><strong>${state.coverage.farms.length}</strong><small>Aggregated across blocked missions</small></article>
    <article><span>PARTIAL FLEET EVIDENCE</span><strong>${summary.partialEvidenceMissions}</strong><small>Excluded from selectable-ship farm claims</small></article>
  </div>`;
}

function renderRowsOnly() {
  const panel = document.getElementById("roteUpgradePriorityQueue");
  if (!panel || !state.coverage) return;
  const rows = filteredRows();
  const list = panel.querySelector(".rote-priority-list");
  const count = panel.querySelector("[data-rote-priority-count]");
  if (count) count.textContent = `${number(rows.length)} priority units`;
  if (list) list.innerHTML = rows.length ? rows.slice(0, 25).map(rowMarkup).join("") : '<div class="rote-priority-empty">No priority units match the current filters.</div>';
}

function renderQueue() {
  state.scheduled = false;
  const panel = ensurePanel();
  if (!panel) return;
  const snapshot = liveSnapshot();
  const renderKey = `${snapshot?.allyCode || "none"}:${snapshot?.fetchedAt || 0}:${state.catalogStatus}:${state.catalog.length}`;
  if (panel.dataset.renderKey === renderKey && state.coverage) return;
  panel.dataset.renderKey = renderKey;

  if (!snapshot?.body) {
    panel.innerHTML = '<div class="rote-priority-loading"><strong>Mission Impact Queue</strong><span>Load an Ally Code to rank ROTE upgrade priorities.</span></div>';
    return;
  }
  if (state.catalogStatus === "idle" || state.catalogStatus === "loading") {
    panel.innerHTML = '<div class="rote-priority-loading"><strong>Mission Impact Queue</strong><span>Loading exact unit definitions…</span></div>';
    return;
  }
  if (state.catalogStatus === "error") {
    panel.innerHTML = `<div class="rote-priority-loading danger"><strong>Mission Impact Queue unavailable</strong><span>${escapeHtml(state.catalogError)}</span></div>`;
    return;
  }

  const key = `${snapshot.allyCode || ""}:${snapshot.fetchedAt || 0}:${state.catalog.length}`;
  if (!state.coverage || state.coverageKey !== key) {
    state.coverageKey = key;
    state.coverage = buildGuildRoteMissionCoverage(personalGuildSnapshot(snapshot.body, snapshot.allyCode), state.catalog, { redundancyTarget: 1 });
  }
  const rows = filteredRows();
  const phases = [...new Set(state.coverage.missions.map((mission) => mission.phase))];
  panel.innerHTML = `
    <div class="rote-priority-head">
      <div><span>ROTE UPGRADE PRIORITY</span><h3>Mission Impact Queue</h3><p>Rank the smallest evidence-safe upgrades that unlock the most verified ROTE mission entry coverage for this roster.</p></div>
      <b>${state.coverage.summary.exactCoveragePercent}% exact entry coverage</b>
    </div>
    ${summaryMarkup()}
    <div class="rote-priority-evidence"><strong>Evidence boundary:</strong> exact mission entry rules drive this queue. Generic fleet star gates without a complete selectable-ship allow-list remain partial and do not create ship farm recommendations.</div>
    <div class="rote-priority-filters">
      <label>Search<input type="search" data-rote-priority-search value="${escapeAttr(state.search)}" placeholder="Unit, planet, mission…"></label>
      <label>Phase<select data-rote-priority-phase>${["All", ...phases].map((value) => `<option value="${escapeAttr(value)}"${state.phase === value ? " selected" : ""}>${escapeHtml(value === "All" ? "All phases" : value)}</option>`).join("")}</select></label>
      <label>Impact<select data-rote-priority-kind>${["All", "Mandatory", "Pool"].map((value) => `<option${state.kind === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Ownership<select data-rote-priority-ownership>${["All", "Owned", "Missing"].map((value) => `<option${state.ownership === value ? " selected" : ""}>${value}</option>`).join("")}</select></label>
      <span data-rote-priority-count>${number(rows.length)} priority units</span>
    </div>
    <div class="rote-priority-list">${rows.length ? rows.slice(0, 25).map(rowMarkup).join("") : '<div class="rote-priority-empty">No upgrade targets are required for the current filters.</div>'}</div>`;
}

function scheduleRender() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(renderQueue);
}

function install() {
  loadCatalog();
  const observer = new MutationObserver(() => scheduleRender());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-rote-priority-search]")) return;
    state.search = event.target.value || "";
    renderRowsOnly();
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-rote-priority-phase]")) state.phase = event.target.value || "All";
    else if (event.target.matches?.("[data-rote-priority-kind]")) state.kind = event.target.value || "All";
    else if (event.target.matches?.("[data-rote-priority-ownership]")) state.ownership = event.target.value || "All";
    else return;
    renderRowsOnly();
  });
  document.addEventListener("click", (event) => {
    const planet = event.target.closest?.("[data-rote-priority-planet]");
    if (planet) {
      const planetId = String(planet.dataset.rotePriorityPlanet || "");
      document.querySelector('button[data-rote-view="map"]')?.click();
      setTimeout(() => document.querySelector(`#roteGalaxyMap [data-rote-planet="${planetId}"]`)?.click(), 0);
      return;
    }
    const plan = event.target.closest?.("[data-rote-priority-plan]");
    if (plan) {
      window.dispatchEvent(new CustomEvent("swgoh:gear-plan-unit", {
        detail: {
          baseId: String(plan.dataset.rotePriorityPlan || ""),
          gear: Number(plan.dataset.rotePriorityGear || 13),
          relic: Number(plan.dataset.rotePriorityRelic || 0),
        },
      }));
      return;
    }
    if (event.target.closest?.('button[data-workspace-tab="rote"]')) setTimeout(scheduleRender, 250);
  }, true);
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.coverage = null;
    state.coverageKey = "";
    const panel = document.getElementById("roteUpgradePriorityQueue");
    if (panel) panel.dataset.renderKey = "";
    setTimeout(scheduleRender, 550);
  });
  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#rote") setTimeout(scheduleRender, 200);
  });
  scheduleRender();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
