import {
  buildPersonalRoteMissionImpact,
  compareMissionImpact,
  impactFilterMatch,
} from "./roster-rote-mission-impact-model.js";

const state = {
  catalogPromise: null,
  catalog: [],
  result: null,
  key: "",
  loading: false,
  filter: "All",
  sort: "roster",
  scheduled: false,
};

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

function zeroImpact(baseId = "") {
  return {
    baseId,
    name: baseId,
    legalMissionCount: 0,
    mandatoryMissionCount: 0,
    farmMissionCount: 0,
    totalMissionImpact: 0,
    legalMissionRefs: [],
    mandatoryMissionRefs: [],
    farmMissionRefs: [],
    gapLabels: [],
    impactScore: 0,
  };
}

async function loadCatalog() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?roster-rote-impact=1", { cache: "no-cache" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.units) || !body.units.length) throw new Error("Static unit catalog is unavailable.");
      state.catalog = body.units;
      return body.units;
    });
  return state.catalogPromise;
}

async function loadBody(allyCode) {
  const shared = window.__swgohLiveSnapshot;
  if (shared?.body && digits(shared.allyCode) === allyCode) return { body: shared.body, fetchedAt: Number(shared.fetchedAt || Date.now()) };
  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  const fetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt };
  return { body, fetchedAt };
}

function resultsElement() {
  return document.getElementById("proRosterResults");
}

function ensureControls() {
  const results = resultsElement();
  if (!results) return null;
  let controls = document.getElementById("proRosterMissionImpactControls");
  if (controls) return controls;
  controls = document.createElement("section");
  controls.id = "proRosterMissionImpactControls";
  controls.className = "card pro-roster-mission-impact";
  controls.innerHTML = '<div class="pro-roster-mission-loading">Open the Roster workspace with an Ally Code loaded to calculate verified ROTE mission impact.</div>';
  results.insertAdjacentElement("beforebegin", controls);
  return controls;
}

function summaryMarkup() {
  const summary = state.result?.impact?.summary || {};
  return `<div class="pro-roster-mission-summary">
    <article><span>EXACT MISSIONS INDEXED</span><strong>${number(summary.exactMissions)}</strong><small>${number(summary.partialEvidenceMissions)} partial-evidence missions excluded</small></article>
    <article><span>MISSION-LEGAL UNITS</span><strong>${number(summary.missionLegalUnits)}</strong><small>Owned units legal for ≥1 exact mission</small></article>
    <article><span>MANDATORY UNITS</span><strong>${number(summary.mandatoryUnits)}</strong><small>Owned units explicitly required by ≥1 mission</small></article>
    <article class="warning"><span>ACTIVE FARM BLOCKERS</span><strong>${number(summary.farmBlockerUnits)}</strong><small>Owned units currently affecting mission entry gaps</small></article>
    <article><span>MULTI-MISSION UNITS</span><strong>${number(summary.multiMissionUnits)}</strong><small>Touch at least 3 verified missions</small></article>
  </div>`;
}

function controlsMarkup() {
  return `<div class="pro-roster-mission-head">
      <div><span>ROTE MISSION IMPACT</span><strong>Mission-aware roster filtering</strong><small>Combat/special mission impact is separate from the existing ROTE Operations demand column.</small></div>
      <b>${state.result?.coverage?.summary?.exactCoveragePercent || 0}% personal exact-entry coverage</b>
    </div>
    ${summaryMarkup()}
    <div class="pro-roster-mission-filters">
      <label>Mission Filter
        <select data-roster-rote-impact-filter>
          <option value="All"${state.filter === "All" ? " selected" : ""}>All current roster matches</option>
          <option value="farm"${state.filter === "farm" ? " selected" : ""}>Active mission farm blockers</option>
          <option value="mandatory"${state.filter === "mandatory" ? " selected" : ""}>Mandatory mission units</option>
          <option value="legal"${state.filter === "legal" ? " selected" : ""}>Legal for verified mission</option>
          <option value="multi"${state.filter === "multi" ? " selected" : ""}>3+ mission impact</option>
          <option value="none"${state.filter === "none" ? " selected" : ""}>No exact mission impact</option>
        </select>
      </label>
      <label>Mission Sort
        <select data-roster-rote-impact-sort>
          <option value="roster"${state.sort === "roster" ? " selected" : ""}>Keep Roster sort</option>
          <option value="impact"${state.sort === "impact" ? " selected" : ""}>Highest total mission impact</option>
          <option value="farm"${state.sort === "farm" ? " selected" : ""}>Farm blockers first</option>
          <option value="mandatory"${state.sort === "mandatory" ? " selected" : ""}>Most mandatory uses</option>
          <option value="legal"${state.sort === "legal" ? " selected" : ""}>Most legal mission uses</option>
        </select>
      </label>
      <span data-roster-rote-impact-count></span>
    </div>
    <div class="pro-roster-mission-boundary"><strong>Evidence boundary:</strong> these counts use exact verified mission-entry rules. Generic fleet gates without complete selectable-ship restrictions are excluded. Mission legality does not imply a guaranteed winning composition.</div>`;
}

function renderControls() {
  const controls = ensureControls();
  if (!controls) return;
  if (!state.result) {
    controls.innerHTML = '<div class="pro-roster-mission-loading">Load a live roster to calculate ROTE mission impact.</div>';
    return;
  }
  controls.innerHTML = controlsMarkup();
}

function refTitle(refs = []) {
  return refs.slice(0, 8).map((ref) => `${ref.phase} ${ref.planetName} — ${ref.missionName}`).join("\n");
}

function missionCellMarkup(info) {
  if (!info.totalMissionImpact) return '<span class="pro-mission-none">—</span>';
  const first = info.farmMissionRefs?.[0] || info.mandatoryMissionRefs?.[0] || info.legalMissionRefs?.[0] || null;
  const refs = new Map([...(info.legalMissionRefs || []), ...(info.mandatoryMissionRefs || []), ...(info.farmMissionRefs || [])].map((ref) => [ref.key, ref]));
  return `${first?.planetId ? `<button type="button" class="pro-mission-impact-link" data-roster-rote-open="${escapeAttr(first.planetId)}" title="${escapeAttr(refTitle([...refs.values()]))}">${number(info.totalMissionImpact)} mission${info.totalMissionImpact === 1 ? "" : "s"}</button>` : `<strong>${number(info.totalMissionImpact)} missions</strong>`}
    <small>L${number(info.legalMissionCount)} · M${number(info.mandatoryMissionCount)}</small>`;
}

function farmCellMarkup(info) {
  if (!info.farmMissionCount) return '<span class="pro-mission-none">—</span>';
  const first = info.farmMissionRefs?.[0] || null;
  const gap = info.gapLabels?.[0] || "Upgrade required";
  return `${first?.planetId ? `<button type="button" class="pro-mission-farm-link" data-roster-rote-open="${escapeAttr(first.planetId)}" title="${escapeAttr(refTitle(info.farmMissionRefs))}">${number(info.farmMissionCount)} blocker mission${info.farmMissionCount === 1 ? "" : "s"}</button>` : `<strong>${number(info.farmMissionCount)} blocker missions</strong>`}<small>${escapeHtml(gap)}</small>`;
}

function ensureColumns(table) {
  const header = table.querySelector("thead tr");
  if (header && !header.querySelector("[data-roster-rote-impact-head]")) {
    const mission = document.createElement("th");
    mission.dataset.rosterRoteImpactHead = "mission";
    mission.textContent = "ROTE Missions";
    const farm = document.createElement("th");
    farm.dataset.rosterRoteImpactHead = "farm";
    farm.textContent = "Mission Farm";
    const actionHead = header.lastElementChild;
    header.insertBefore(mission, actionHead);
    header.insertBefore(farm, actionHead);
  }

  [...table.querySelectorAll("tbody tr[data-unit-row]")].forEach((row, index) => {
    if (!row.dataset.rosterRoteOriginalIndex) row.dataset.rosterRoteOriginalIndex = String(index);
    const baseId = String(row.dataset.unitRow || "");
    const info = state.result?.impact?.byBaseId?.get(baseId) || zeroImpact(baseId);
    const signature = `${info.totalMissionImpact}:${info.legalMissionCount}:${info.mandatoryMissionCount}:${info.farmMissionCount}:${info.gapLabels?.join("|") || ""}`;
    if (row.dataset.rosterRoteImpactSignature === signature) return;
    row.dataset.rosterRoteImpactSignature = signature;
    let missionCell = row.querySelector("[data-roster-rote-impact-cell='mission']");
    let farmCell = row.querySelector("[data-roster-rote-impact-cell='farm']");
    const actions = row.querySelector("td.pro-actions") || row.lastElementChild;
    if (!missionCell) {
      missionCell = document.createElement("td");
      missionCell.dataset.rosterRoteImpactCell = "mission";
      missionCell.className = "pro-mission-impact-cell";
      row.insertBefore(missionCell, actions);
    }
    if (!farmCell) {
      farmCell = document.createElement("td");
      farmCell.dataset.rosterRoteImpactCell = "farm";
      farmCell.className = "pro-mission-impact-cell farm";
      row.insertBefore(farmCell, actions);
    }
    missionCell.innerHTML = missionCellMarkup(info);
    farmCell.innerHTML = farmCellMarkup(info);
  });
}

function desiredRows(rows) {
  if (state.sort === "roster") {
    return rows.slice().sort((a, b) => Number(a.dataset.rosterRoteOriginalIndex || 0) - Number(b.dataset.rosterRoteOriginalIndex || 0));
  }
  return rows.slice().sort((a, b) => {
    const ai = state.result?.impact?.byBaseId?.get(String(a.dataset.unitRow || "")) || zeroImpact(a.dataset.unitRow);
    const bi = state.result?.impact?.byBaseId?.get(String(b.dataset.unitRow || "")) || zeroImpact(b.dataset.unitRow);
    return compareMissionImpact(ai, bi, state.sort);
  });
}

function applyTable() {
  state.scheduled = false;
  const results = resultsElement();
  const table = results?.querySelector("table.pro-roster-table");
  if (!table || !state.result) return;
  ensureColumns(table);
  const body = table.querySelector("tbody");
  const rows = [...body.querySelectorAll("tr[data-unit-row]")];
  let visible = 0;
  for (const row of rows) {
    const info = state.result.impact.byBaseId.get(String(row.dataset.unitRow || "")) || zeroImpact(row.dataset.unitRow);
    const show = impactFilterMatch(info, state.filter);
    row.hidden = !show;
    if (show) visible += 1;
  }

  const desired = desiredRows(rows);
  const currentIds = rows.map((row) => row.dataset.unitRow).join("|");
  const desiredIds = desired.map((row) => row.dataset.unitRow).join("|");
  if (currentIds !== desiredIds) desired.forEach((row) => body.appendChild(row));

  const count = document.querySelector("[data-roster-rote-impact-count]");
  if (count) count.textContent = `${number(visible)} visible within current Roster filters`;
}

function scheduleApply() {
  if (state.scheduled || typeof requestAnimationFrame === "undefined") return;
  state.scheduled = true;
  requestAnimationFrame(applyTable);
}

async function loadImpact(force = false) {
  ensureControls();
  const allyCode = digits(document.getElementById("allyCode")?.value);
  if (allyCode.length !== 9) {
    state.result = null;
    state.key = "";
    renderControls();
    return;
  }
  if (state.loading) return;
  state.loading = true;
  const controls = ensureControls();
  if (controls && !state.result) controls.innerHTML = '<div class="pro-roster-mission-loading">Indexing verified ROTE mission impact for this roster…</div>';
  try {
    const [catalog, live] = await Promise.all([loadCatalog(), loadBody(allyCode)]);
    const key = `${allyCode}:${live.fetchedAt}:${catalog.length}`;
    if (force || !state.result || state.key !== key) {
      state.result = buildPersonalRoteMissionImpact(live.body, catalog, allyCode);
      state.key = key;
    }
    renderControls();
    scheduleApply();
  } catch (error) {
    if (controls) controls.innerHTML = `<div class="pro-roster-mission-loading danger">${escapeHtml(error?.message || "ROTE mission impact is unavailable.")}</div>`;
  } finally {
    state.loading = false;
  }
}

function rosterActive() {
  const panel = document.querySelector('[data-workspace-panel="roster"]');
  return Boolean(panel && !panel.hidden);
}

function install() {
  const observer = new MutationObserver(() => {
    ensureControls();
    scheduleApply();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("change", (event) => {
    if (event.target.matches?.("[data-roster-rote-impact-filter]")) state.filter = event.target.value || "All";
    else if (event.target.matches?.("[data-roster-rote-impact-sort]")) state.sort = event.target.value || "roster";
    else return;
    scheduleApply();
  });

  document.addEventListener("click", (event) => {
    const planet = event.target.closest?.("[data-roster-rote-open]");
    if (planet) {
      const planetId = String(planet.dataset.rosterRoteOpen || "");
      document.querySelector('button[data-workspace-tab="rote"]')?.click();
      setTimeout(() => {
        document.querySelector('button[data-rote-view="map"]')?.click();
        setTimeout(() => document.querySelector(`#roteGalaxyMap [data-rote-planet="${planetId}"]`)?.click(), 0);
      }, 0);
      return;
    }
    if (event.target.closest?.('button[data-workspace-tab="roster"]')) setTimeout(() => loadImpact(false), 100);
  }, true);

  window.addEventListener("swgoh:workspace-activated", (event) => {
    if (event.detail?.id === "roster") loadImpact(false);
  });
  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === "#roster") setTimeout(() => loadImpact(false), 100);
  });
  document.getElementById("allyForm")?.addEventListener("submit", () => {
    state.result = null;
    state.key = "";
    if (rosterActive()) setTimeout(() => loadImpact(true), 500);
  });
  ensureControls();
  if (rosterActive() || location.hash.toLowerCase() === "#roster") setTimeout(() => loadImpact(false), 100);
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}
