import { CURRENT_JOURNEY_GUIDES } from "./journey-current-guide-data.js";

const state = { catalog: [], loading: null, dashboardObserver: null };
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

export function normalizeJourneyName(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function loadCatalog() {
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) {
    state.catalog = shared;
    return shared;
  }
  if (state.catalog.length) return state.catalog;
  if (state.loading) return state.loading;
  state.loading = fetch("/data/catalog.json?journey-current=1", { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `Catalog returned HTTP ${response.status}`);
      state.catalog = array(body?.units);
      return state.catalog;
    })
    .finally(() => { state.loading = null; });
  return state.loading;
}

export function resolveJourneyCatalogUnit(name, catalog = []) {
  const wanted = normalizeJourneyName(name);
  if (!wanted) return null;
  return array(catalog).find((unit) => normalizeJourneyName(unit?.name) === wanted) || null;
}

function unitImage(unit = {}) {
  return text(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail);
}

function targetMarkup(guide, catalog) {
  const unit = resolveJourneyCatalogUnit(guide.targetName, catalog);
  const image = unitImage(unit || {});
  const content = image
    ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">`
    : `<span aria-hidden="true">✦</span>`;
  return unit?.baseId
    ? `<button type="button" class="journey-current-target" data-inspect-base-id="${escapeAttr(unit.baseId)}" title="Inspect ${escapeAttr(guide.name)}">${content}</button>`
    : `<span class="journey-current-target">${content}</span>`;
}

function tierMarkup(tier, catalog) {
  const requirements = tier.requiredNames.map((name) => {
    const unit = resolveJourneyCatalogUnit(name, catalog);
    const image = unitImage(unit || {});
    return `<span class="journey-current-requirement" title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : ""}<b>${escapeHtml(name)}</b></span>`;
  }).join("");
  return `<article class="journey-current-tier">
    <header><strong>Tier ${Number(tier.tier)}</strong><span>${Number(tier.stars)}★ · EL ${Number(tier.eraLevel)}</span></header>
    <small>Era Level gate: ${escapeHtml(tier.eraLevelUnitName || "Unknown")}</small>
    <div class="journey-current-requirements">${requirements}</div>
  </article>`;
}

function sourceMarkup(guide) {
  const source = array(guide.sources)[0];
  if (!source?.ref) return "";
  return `<a class="journey-current-source" href="${escapeAttr(source.ref)}" target="_blank" rel="noreferrer">Source · ${escapeHtml(source.name)}</a>`;
}

function cardMarkup(guide, catalog) {
  const exactTiers = guide.progressionSystem === "era" && guide.requirementsKnown && guide.tiers.length;
  const tierLabel = guide.journeyTier ? `Journey Tier ${guide.journeyTier}` : guide.category;
  return `<article class="journey-current-card ${guide.progressionSystem === "era" ? "era" : "reference"}" data-current-journey="${escapeAttr(guide.id)}">
    <div class="journey-current-card-head">
      ${targetMarkup(guide, catalog)}
      <div class="journey-current-title"><span>${escapeHtml(tierLabel)}</span><h4>${escapeHtml(guide.name)}</h4><small>${escapeHtml(guide.availabilityLabel)}</small></div>
      <span class="journey-current-readiness">${guide.progressionSystem === "era" ? "ERA READINESS UNKNOWN" : "REFERENCE"}</span>
    </div>
    <p>${escapeHtml(guide.statusNote)}</p>
    ${exactTiers ? `<details class="journey-current-tier-details"><summary>Verified Era tier requirements · readiness withheld</summary><div class="journey-current-tier-grid">${guide.tiers.map((tier) => tierMarkup(tier, catalog)).join("")}</div></details>` : '<div class="journey-current-boundary">Exact progression requirements are not normalized yet. Command Center does not calculate a readiness percentage for this guide.</div>'}
    ${sourceMarkup(guide)}
  </article>`;
}

function searchText(guide) {
  return normalizeJourneyName([
    guide.name,
    guide.category,
    guide.availabilityLabel,
    ...array(guide.tiers).flatMap((tier) => tier.requiredNames),
  ].join(" "));
}

export function filteredCurrentJourneyGuides(query = "") {
  const wanted = normalizeJourneyName(query);
  if (!wanted) return CURRENT_JOURNEY_GUIDES;
  return CURRENT_JOURNEY_GUIDES.filter((guide) => searchText(guide).includes(wanted));
}

async function renderCurrentBand() {
  const map = document.getElementById("farmJourneyMap");
  const toolbar = map?.querySelector(".journey-map-toolbar");
  if (!map || map.hidden || !toolbar) return;
  let band = map.querySelector("[data-current-journey-band]");
  if (!band) {
    band = document.createElement("section");
    band.className = "journey-current-band";
    band.dataset.currentJourneyBand = "true";
    toolbar.insertAdjacentElement("afterend", band);
  }
  const query = text(document.getElementById("journeyMapSearch")?.value);
  const guides = filteredCurrentJourneyGuides(query);
  let catalog = [];
  try { catalog = await loadCatalog(); } catch { catalog = []; }
  if (!band.isConnected) return;
  band.innerHTML = `<header class="journey-current-band-head"><div><span>CURRENT 2026 GUIDE EVIDENCE</span><h3>Journey Guide + Era Journeys</h3><p>Legacy STAR / GEAR / RELIC readiness remains calculated below. Era-Level journeys are shown separately until Era Level is part of the authoritative roster contract.</p></div><b>${guides.length} current guide${guides.length === 1 ? "" : "s"}</b></header>
    ${guides.length ? `<div class="journey-current-grid">${guides.map((guide) => cardMarkup(guide, catalog)).join("")}</div>` : '<div class="journey-map-empty">No current Journey / Era guide matches this search.</div>'}`;
}

function dashboardRowMarkup(guide, catalog) {
  const unit = resolveJourneyCatalogUnit(guide.targetName, catalog);
  const image = unitImage(unit || {});
  const tier = guide.journeyTier ? `T${guide.journeyTier}` : "ERA";
  return `<div class="ccv2-journey-current-row">
    <span class="ccv2-journey-current-art">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : "✦"}</span>
    <span><strong>${escapeHtml(guide.name)}</strong><small>${escapeHtml(guide.availabilityLabel)} · ${escapeHtml(tier)}</small></span>
    <b>${guide.progressionSystem === "era" ? "EL ?" : "REF"}</b>
  </div>`;
}

async function enhanceDashboardJourney() {
  const module = document.querySelector(".ccv2-journey-module");
  if (!module || module.dataset.currentJourneysEnhanced === "true") return false;
  module.dataset.currentJourneysEnhanced = "true";
  let catalog = [];
  try { catalog = await loadCatalog(); } catch { catalog = []; }
  if (!module.isConnected) return false;
  const current = [
    CURRENT_JOURNEY_GUIDES.find((guide) => guide.id === "CURRENT_DARTH_JAR_JAR"),
    CURRENT_JOURNEY_GUIDES.find((guide) => guide.id === "CURRENT_JMMW"),
    CURRENT_JOURNEY_GUIDES.find((guide) => guide.id === "CURRENT_CASSIAN_UNDERCOVER"),
  ].filter(Boolean);
  const host = document.createElement("div");
  host.className = "ccv2-journey-current-list";
  host.innerHTML = current.map((guide) => dashboardRowMarkup(guide, catalog)).join("");
  const note = module.querySelector(".ccv2-journey-note");
  (note || module.querySelector(".ccv2-module-metrics"))?.insertAdjacentElement("beforebegin", host);
  return true;
}

function scheduleMap() {
  setTimeout(() => renderCurrentBand().catch(() => {}), 0);
}

function scheduleDashboard() {
  setTimeout(() => enhanceDashboardJourney().catch(() => {}), 0);
}

window.addEventListener("swgoh:journey-map-rendered", scheduleMap);
window.addEventListener("swgoh:farm-view-changed", (event) => {
  if (event?.detail?.mode === "map") setTimeout(scheduleMap, 80);
});

function installDashboardObserver() {
  scheduleDashboard();
  if (state.dashboardObserver) return;
  state.dashboardObserver = new MutationObserver(() => {
    const module = document.querySelector(".ccv2-journey-module");
    if (module && module.dataset.currentJourneysEnhanced !== "true") scheduleDashboard();
  });
  state.dashboardObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    installDashboardObserver();
    scheduleMap();
  }, { once: true });
} else {
  installDashboardObserver();
  scheduleMap();
}
