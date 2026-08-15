import { JOURNEY_PRESETS } from "./farm-presets.js";
import { eventProgress, readinessBand, readinessLabel, requirementProgress } from "./journey-progress.js";

const CACHE_MS = 25_000;
const MODE_KEY = "swgoh:farm-view-mode";
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

const state = {
  catalog: [],
  catalogMap: new Map(),
  body: null,
  allyCode: "",
  fetchedAt: 0,
  initialized: false,
  mode: localStorage.getItem(MODE_KEY) === "map" ? "map" : "detail",
  filter: "all",
  search: "",
};

const ADVANCED_IDS = new Set([
  "JOURNEY_BOKATANMANDALOR",
  "JOURNEY_BAYLANSKOLL",
  "JOURNEY_JARJARBINKS",
]);

function groupFor(event) {
  if (event.category === "Galactic Legends") return { key: "gl", label: "Galactic Legends", order: 4 };
  if (event.category === "Journey Guide Fleets") return { key: "fleet", label: "Capital Fleets", order: 3 };
  if (ADVANCED_IDS.has(event.id)) return { key: "advanced", label: "Advanced Journey", order: 2 };
  return { key: "journey", label: "Journey Guide", order: 1 };
}

function storageKey() {
  return `swgoh:journey-tracker:v2:${digits($("allyCode")?.value) || state.allyCode || "default"}`;
}

function trackedSet() {
  try {
    const ids = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const response = await fetch("/data/catalog.json?journey-map=1", { cache: "no-store" });
  if (!response.ok) throw new Error(`Game catalog returned HTTP ${response.status}`);
  const body = await response.json();
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  state.catalogMap = new Map(state.catalog.map((unit) => [String(unit.baseId), unit]));
  return state.catalog;
}

async function loadLive(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < CACHE_MS) {
    state.body = shared.body;
    state.allyCode = allyCode;
    state.fetchedAt = Number(shared.fetchedAt || Date.now());
    return shared.body;
  }
  if (!force && state.body && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) return state.body;
  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.body = body;
  state.allyCode = allyCode;
  state.fetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.fetchedAt };
  return body;
}

function unitName(baseId, liveMap) {
  return liveMap.get(baseId)?.name || state.catalogMap.get(baseId)?.name || baseId;
}

function unitImage(baseId, liveMap) {
  return liveMap.get(baseId)?.image || state.catalogMap.get(baseId)?.image || "";
}

function requirementTarget(requirement) {
  if (requirement.type === "RELIC") return `R${requirement.tier}`;
  if (requirement.type === "GEAR") return `G${requirement.tier}`;
  return `${requirement.tier}★`;
}

function currentProgressLabel(progress) {
  if (progress.relic > 0) return `${progress.stars}★ · G${progress.gear} · R${progress.relic}`;
  if (progress.gear > 0) return `${progress.stars}★ · G${progress.gear}`;
  return `${progress.stars}★`;
}

function requirementChip(requirement, liveMap) {
  const unit = liveMap.get(requirement.baseId) || null;
  const progress = requirementProgress(unit, requirement);
  const tone = unit?.baseId ? readinessBand(progress.percent, progress.complete) : "far";
  const name = unitName(requirement.baseId, liveMap);
  const image = unitImage(requirement.baseId, liveMap);
  return `
    <button type="button" class="journey-map-requirement tone-${tone}" data-inspect-base-id="${escapeAttr(requirement.baseId)}" title="Inspect ${escapeAttr(name)}">
      ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="journey-map-avatar">?</span>'}
      <span class="journey-map-req-copy">
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(currentProgressLabel(progress))} → <b>${escapeHtml(requirementTarget(requirement))}</b></small>
      </span>
      <span class="journey-map-req-score">${progress.percent}%</span>
    </button>`;
}

function eventModel(event, liveMap, tracked) {
  const progress = eventProgress(event.requirements, liveMap);
  const target = liveMap.get(event.targetBaseId) || null;
  const tone = readinessBand(progress.percent, progress.complete);
  const searchText = [event.name, event.shortName, event.category, ...event.requirements.map((req) => unitName(req.baseId, liveMap))]
    .join(" ")
    .toLowerCase();
  return { event, progress, target, tone, tracked: tracked.has(event.id), searchText };
}

function mapCard(model, liveMap) {
  const { event, progress, tone, tracked } = model;
  const targetImage = unitImage(event.targetBaseId, liveMap);
  const targetName = event.shortName || event.name;
  return `
    <article class="journey-map-card tone-${tone}" data-map-event="${escapeAttr(event.id)}">
      <div class="journey-map-card-head">
        <button type="button" class="journey-map-target" data-inspect-base-id="${escapeAttr(event.targetBaseId)}" title="Inspect ${escapeAttr(event.name)}">
          ${targetImage ? `<img src="${escapeAttr(targetImage)}" alt="" loading="lazy">` : '<span class="journey-map-target-fallback">★</span>'}
        </button>
        <div class="journey-map-title">
          <span>${escapeHtml(event.category)}</span>
          <h4>${escapeHtml(targetName)}</h4>
          <small>${progress.completeCount}/${progress.total} requirements ready</small>
        </div>
        <div class="journey-map-score">
          <b>${progress.percent}%</b>
          <span class="tone-${tone}">${escapeHtml(readinessLabel(progress.percent, progress.complete, true))}</span>
        </div>
      </div>
      <div class="journey-map-progress tone-${tone}"><span style="width:${progress.percent}%"></span></div>
      <div class="journey-map-card-actions">
        <button type="button" class="journey-map-track ${tracked ? "tracked" : ""}" ${tracked ? `data-untrack-journey="${escapeAttr(event.id)}"` : `data-track-journey="${escapeAttr(event.id)}"`}>
          ${tracked ? "✓ Tracked" : "+ Track Farm"}
        </button>
      </div>
      <details class="journey-map-details">
        <summary>
          <span>Requirements</span>
          <b>${progress.completeCount}/${progress.total}</b>
        </summary>
        <div class="journey-map-requirements">
          ${event.requirements.map((requirement) => requirementChip(requirement, liveMap)).join("")}
        </div>
      </details>
    </article>`;
}

function filteredModels(models) {
  return models.filter((model) => {
    if (state.search && !model.searchText.includes(state.search)) return false;
    if (state.filter === "tracked" && !model.tracked) return false;
    if (state.filter === "incomplete" && model.progress.complete) return false;
    if (state.filter === "ready" && !model.progress.complete) return false;
    return true;
  });
}

function ensureViewShell() {
  const farm = $("workspace-farm");
  const intro = farm?.querySelector(".farm-intro");
  if (!farm || !intro) return null;
  let switcher = $("farmViewSwitcher");
  if (!switcher) {
    switcher = document.createElement("section");
    switcher.id = "farmViewSwitcher";
    switcher.className = "card farm-view-switcher";
    switcher.innerHTML = `
      <div>
        <div class="kicker">VIEW MODE</div>
        <h3>Farm Command or Journey Map</h3>
        <p>Use Farm Command for detailed execution and material planning. Use Journey Map to scan the whole supported Journey ladder quickly.</p>
      </div>
      <div class="farm-view-buttons" role="group" aria-label="Farm view mode">
        <button type="button" data-farm-view="detail">Detailed Farm Command</button>
        <button type="button" data-farm-view="map">Journey Map</button>
      </div>`;
    intro.insertAdjacentElement("afterend", switcher);
  }
  let map = $("farmJourneyMap");
  if (!map) {
    map = document.createElement("section");
    map.id = "farmJourneyMap";
    map.className = "farm-journey-map";
    farm.appendChild(map);
  }
  return map;
}

function applyMode() {
  const farm = $("workspace-farm");
  if (!farm) return;
  const map = $("farmJourneyMap");
  const detailNodes = [
    farm.querySelector(".farm-chooser"),
    $("farmMasterPlan"),
    $("journeyTrackedList"),
  ].filter(Boolean);
  for (const node of detailNodes) node.hidden = state.mode === "map";
  if (map) map.hidden = state.mode !== "map";
  for (const button of farm.querySelectorAll("[data-farm-view]")) {
    const active = button.dataset.farmView === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  localStorage.setItem(MODE_KEY, state.mode);
}

async function renderMap(force = false) {
  const map = ensureViewShell();
  if (!map) return;
  applyMode();
  await loadCatalog();
  const body = await loadLive(force);
  const units = body ? [...(body.units || []), ...(body.ships || [])] : [];
  const liveMap = new Map(units.map((unit) => [String(unit.baseId), unit]));
  const tracked = trackedSet();
  const models = JOURNEY_PRESETS.map((event) => eventModel(event, liveMap, tracked));
  const visible = filteredModels(models);
  const groups = [...new Map(visible.map((model) => {
    const group = groupFor(model.event);
    return [group.key, group];
  })).values()].sort((a, b) => a.order - b.order);

  map.innerHTML = `
    <section class="card journey-map-toolbar">
      <div>
        <div class="kicker">ALTERNATE JOURNEY VIEW</div>
        <h2>Journey Map</h2>
        <p>Compact progression view inspired by tiered Journey Guide visualizers. Expand only the targets you want to inspect.</p>
      </div>
      <div class="journey-map-tools">
        <input id="journeyMapSearch" value="${escapeAttr(state.search)}" placeholder="Search target or required unit…">
        <div class="journey-map-filters" role="group" aria-label="Journey Map filter">
          ${[["all","All"],["tracked","Tracked"],["incomplete","Incomplete"],["ready","Ready"]].map(([key,label]) => `<button type="button" class="${state.filter === key ? "active" : ""}" data-journey-map-filter="${key}">${label}</button>`).join("")}
        </div>
      </div>
    </section>
    ${groups.length ? groups.map((group) => {
      const rows = visible.filter((model) => groupFor(model.event).key === group.key);
      return `
        <section class="journey-map-band">
          <header><div><span>PROGRESSION BAND</span><h3>${escapeHtml(group.label)}</h3></div><b>${rows.length} target${rows.length === 1 ? "" : "s"}</b></header>
          <div class="journey-map-grid">${rows.map((model) => mapCard(model, liveMap)).join("")}</div>
        </section>`;
    }).join("") : '<section class="card journey-map-empty">No Journey targets match the current filter.</section>'}
  `;
}

function showError(error) {
  const map = ensureViewShell();
  if (map) map.innerHTML = `<section class="card journey-map-empty">${escapeHtml(error?.message || "Journey Map is unavailable.")}</section>`;
}

function schedule(delay = 100, force = false) {
  setTimeout(() => renderMap(force).catch(showError), delay);
}

function init() {
  if (state.initialized) return;
  if (!ensureViewShell()) {
    setTimeout(init, 80);
    return;
  }
  state.initialized = true;
  const farm = $("workspace-farm");

  farm.addEventListener("click", (event) => {
    const view = event.target.closest("[data-farm-view]");
    if (view) {
      state.mode = view.dataset.farmView === "map" ? "map" : "detail";
      applyMode();
      if (state.mode === "map") schedule(0, false);
      return;
    }
    const filter = event.target.closest("[data-journey-map-filter]");
    if (filter) {
      state.filter = filter.dataset.journeyMapFilter || "all";
      schedule(0, false);
      return;
    }
    if (event.target.closest("[data-track-journey], [data-untrack-journey]")) schedule(180, false);
  });

  farm.addEventListener("input", (event) => {
    if (event.target.id !== "journeyMapSearch") return;
    state.search = String(event.target.value || "").trim().toLowerCase();
    schedule(120, false);
  });

  $("allyForm")?.addEventListener("submit", () => {
    state.body = null;
    state.fetchedAt = 0;
    schedule(650, true);
  });
  document.querySelector("[data-workspace-tab='farm']")?.addEventListener("click", () => schedule(50, false));

  const observer = new MutationObserver(() => applyMode());
  observer.observe(farm, { childList: true, subtree: false });

  renderMap(false).catch(showError);
}

init();
