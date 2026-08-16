import { ROTE_PLANETS, planetRosterReadiness } from "./rote-map-data.js";
import { ROTE_VISUAL_ASSETS, TB_MISSION_VISUAL_ASSETS, missionVisualKind } from "./tb-visual-assets-data.js";
import {
  ROTE_MAP_GEOMETRY,
  ROTE_PHASE_ORDER,
  ROTE_PHASE_RELIC_LABELS,
  parseLegacyPhase,
  rotePhaseGroup,
  rotePlanetsForPhase,
} from "./tb-map-layout-data.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

let selectedRotePhase = "P1";
let scheduled = false;
const legacyPhaseByCard = new WeakMap();

function liveBody() {
  return window.__swgohLiveSnapshot?.body || null;
}

function statusLabel(status) {
  if (status === "deep") return "DEEP";
  if (status === "ready") return "READY";
  if (status === "thin") return "BUILDING";
  return "BLOCKED";
}

function imageMarkup(src, className = "") {
  return `<img src="${escapeAttr(src)}" class="${escapeAttr(className)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
}

function missionIcons(planet) {
  const missions = Array.isArray(planet?.missions) ? planet.missions : [];
  if (!missions.length) return "";
  return `<div class="tb-phase-mission-icons">${missions.slice(0, 7).map((mission) => {
    const kind = missionVisualKind(mission);
    const src = TB_MISSION_VISUAL_ASSETS[kind] || TB_MISSION_VISUAL_ASSETS.combat;
    return `<span title="${escapeAttr(mission)}">${imageMarkup(src, "tb-phase-mission-icon")}</span>`;
  }).join("")}${missions.length > 7 ? `<b>+${missions.length - 7}</b>` : ""}</div>`;
}

function selectedRotePlanetId() {
  return document.querySelector("#roteGalaxyMap [data-rote-planet].selected")?.dataset.rotePlanet || "";
}

function positionRoteMapNodes() {
  const map = document.getElementById("roteGalaxyMap");
  if (!map) return;
  map.classList.add("tb-rote-fan-map");
  map.querySelector(".rote-map-core")?.classList.add("tb-rote-map-core-hidden");
  for (const node of map.querySelectorAll("[data-rote-planet]")) {
    const id = String(node.dataset.rotePlanet || "");
    const geometry = ROTE_MAP_GEOMETRY[id];
    if (!geometry) continue;
    node.style.left = `${geometry.x}%`;
    node.style.top = `${geometry.y}%`;
    node.dataset.tbMapLane = geometry.lane;
    node.classList.add("tb-rote-map-pin");
  }
}

function rotePhaseButton(phase) {
  const planets = rotePlanetsForPhase(ROTE_PLANETS, phase);
  const body = liveBody();
  const readyCount = body
    ? planets.filter((planet) => planetRosterReadiness(body, planet).eligibleCount >= 5).length
    : 0;
  const active = phase === selectedRotePhase;
  return `<button type="button" class="tb-phase-tab${active ? " active" : ""}" data-tb-rote-phase="${escapeAttr(phase)}" aria-pressed="${active ? "true" : "false"}">
    <span>${escapeHtml(phase)}</span>
    <strong>${escapeHtml(ROTE_PHASE_RELIC_LABELS[phase] || "")}</strong>
    <small>${body ? `${readyCount}/${planets.length} territory-ready` : `${planets.length} territories`}</small>
  </button>`;
}

function roteTerritoryCard(planet) {
  const body = liveBody();
  const readiness = body ? planetRosterReadiness(body, planet) : { status: "blocked", eligibleCount: 0, totalGp: 0, averageSpeed: 0 };
  const selected = selectedRotePlanetId() === planet.id;
  const image = ROTE_VISUAL_ASSETS.planets[planet.id];
  const alignment = planet.alignment === "Mixed" ? "Mixed" : `${planet.alignment} Side`;
  return `<button type="button" class="tb-phase-territory-card lane-${escapeAttr(String(planet.lane || "").toLowerCase().replaceAll(" ", "-"))} status-${escapeAttr(readiness.status)}${selected ? " selected" : ""}" data-tb-open-rote="${escapeAttr(planet.id)}">
    <span class="tb-phase-territory-art">${image ? imageMarkup(image, "tb-phase-territory-image") : ""}</span>
    <span class="tb-phase-territory-copy">
      <span>${escapeHtml(planet.phase)} · ${escapeHtml(planet.lane)}</span>
      <strong>${escapeHtml(planet.name)}</strong>
      <small>${escapeHtml(alignment)} · R${Number(planet.relic || 0)} · ${planet.missions.length} missions</small>
      ${missionIcons(planet)}
    </span>
    <span class="tb-phase-territory-readiness">
      <b>${body ? statusLabel(readiness.status) : "ALLY CODE"}</b>
      <strong>${body ? number(readiness.eligibleCount) : "—"}</strong>
      <small>gate-ready</small>
    </span>
  </button>`;
}

function ensureRotePhaseDeck() {
  const mapView = document.getElementById("roteMapView");
  const mapLayout = mapView?.querySelector(".rote-map-layout");
  if (!mapView || !mapLayout) return;

  const selectedPlanet = ROTE_PLANETS.find((planet) => planet.id === selectedRotePlanetId());
  if (selectedPlanet && !mapView.querySelector("[data-tb-phase-lock='true']")) selectedRotePhase = rotePhaseGroup(selectedPlanet);

  let deck = mapView.querySelector(":scope > .tb-rote-phase-deck");
  if (!deck) {
    deck = document.createElement("section");
    deck.className = "card tb-rote-phase-deck";
    mapLayout.before(deck);
  }

  const signature = `${selectedRotePhase}|${selectedRotePlanetId()}|${window.__swgohLiveSnapshot?.allyCode || ""}|${window.__swgohLiveSnapshot?.fetchedAt || 0}`;
  if (deck.dataset.signature === signature) return;
  deck.dataset.signature = signature;

  const planets = rotePlanetsForPhase(ROTE_PLANETS, selectedRotePhase);
  deck.innerHTML = `
    <div class="tb-phase-deck-head">
      <div><div class="kicker">PHASE TERRITORY INTELLIGENCE</div><h3>Phase ${escapeHtml(selectedRotePhase.replace("P", ""))}${selectedRotePhase === "Bonus" ? "Bonus Planets" : " Territory Overview"}</h3><p>Use the phase row for information. Use the map for navigation. Open a territory for mission and roster detail.</p></div>
      <div class="tb-phase-deck-legend"><span class="dark">Dark</span><span class="mixed">Mixed</span><span class="light">Light</span><span class="bonus">Bonus</span></div>
    </div>
    <div class="tb-phase-tabs">${ROTE_PHASE_ORDER.map(rotePhaseButton).join("")}</div>
    <div class="tb-phase-territory-grid${selectedRotePhase === "Bonus" ? " bonus" : ""}">${planets.map(roteTerritoryCard).join("")}</div>`;

  for (const button of deck.querySelectorAll("[data-tb-rote-phase]")) {
    button.addEventListener("click", () => {
      selectedRotePhase = button.dataset.tbRotePhase || "P1";
      deck.dataset.tbPhaseLock = "true";
      const first = rotePlanetsForPhase(ROTE_PLANETS, selectedRotePhase)[0];
      if (first) document.querySelector(`#roteGalaxyMap [data-rote-planet="${CSS.escape(first.id)}"]`)?.click();
      deck.removeAttribute("data-tb-phase-lock");
      deck.dataset.signature = "";
      scheduleEnhance();
    });
  }
  for (const button of deck.querySelectorAll("[data-tb-open-rote]")) {
    button.addEventListener("click", () => {
      document.querySelector(`#roteGalaxyMap [data-rote-planet="${CSS.escape(button.dataset.tbOpenRote || "")}"]`)?.click();
    });
  }
}

function legacyCardSignature(card) {
  const nodes = [...card.querySelectorAll(".dsgeo-territory")];
  return nodes.map((node) => `${node.classList.contains("selected") ? "*" : ""}${node.querySelector(".dsgeo-phase")?.textContent}|${node.querySelector("strong")?.textContent}|${node.querySelector("small")?.textContent}|${node.querySelector("b")?.textContent}`).join("||");
}

function legacyPhaseGroups(card) {
  const groups = new Map();
  for (const node of card.querySelectorAll(".dsgeo-territory")) {
    const phase = parseLegacyPhase(node.querySelector(".dsgeo-phase")?.textContent || "");
    if (!phase) continue;
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(node);
  }
  return groups;
}

function legacyTerritoryCard(node) {
  const phaseLabel = node.querySelector(".dsgeo-phase")?.textContent || "Territory";
  const name = node.querySelector("strong")?.textContent || "Territory";
  const details = node.querySelector("small")?.textContent || "";
  const readiness = node.querySelector("b")?.textContent || "";
  const id = node.dataset.dsgeoTerritory || node.dataset.legacyTerritory || "";
  const status = [...node.classList].find((value) => value.startsWith("status-")) || "status-unloaded";
  return `<button type="button" class="tb-legacy-territory-card ${escapeAttr(status)}${node.classList.contains("selected") ? " selected" : ""}" data-tb-legacy-open="${escapeAttr(id)}">
    <span><small>${escapeHtml(phaseLabel)}</small><strong>${escapeHtml(name)}</strong><em>${escapeHtml(details)}</em></span>
    <b>${escapeHtml(readiness)}</b>
  </button>`;
}

function enhanceLegacyMapCard(card) {
  const map = card.querySelector(".dsgeo-map");
  if (!map) return;
  const groups = legacyPhaseGroups(card);
  if (!groups.size) return;

  card.classList.add("tb-information-layout");
  let phase = legacyPhaseByCard.get(card);
  const selected = card.querySelector(".dsgeo-territory.selected");
  const selectedPhase = parseLegacyPhase(selected?.querySelector(".dsgeo-phase")?.textContent || "");
  if (!phase || !groups.has(phase)) phase = selectedPhase || [...groups.keys()].sort((a, b) => a - b)[0];
  legacyPhaseByCard.set(card, phase);

  let deck = card.querySelector(":scope > .tb-legacy-phase-deck");
  if (!deck) {
    deck = document.createElement("section");
    deck.className = "tb-legacy-phase-deck";
    map.before(deck);
  }
  const signature = `${phase}|${legacyCardSignature(card)}`;
  if (deck.dataset.signature === signature) return;
  deck.dataset.signature = signature;

  const phases = [...groups.keys()].sort((a, b) => a - b);
  deck.innerHTML = `
    <div class="tb-legacy-phase-tabs">${phases.map((value) => `<button type="button" class="${value === phase ? "active" : ""}" data-tb-legacy-phase="${value}"><span>P${value}</span><small>${groups.get(value).length} territories</small></button>`).join("")}</div>
    <div class="tb-legacy-territory-grid">${(groups.get(phase) || []).map(legacyTerritoryCard).join("")}</div>`;

  for (const button of deck.querySelectorAll("[data-tb-legacy-phase]")) {
    button.addEventListener("click", () => {
      legacyPhaseByCard.set(card, Number(button.dataset.tbLegacyPhase || phase));
      deck.dataset.signature = "";
      scheduleEnhance();
    });
  }
  for (const button of deck.querySelectorAll("[data-tb-legacy-open]")) {
    button.addEventListener("click", () => {
      const id = button.dataset.tbLegacyOpen || "";
      card.querySelector(`[data-dsgeo-territory="${CSS.escape(id)}"], [data-legacy-territory="${CSS.escape(id)}"]`)?.click();
    });
  }
}

function enhanceLegacyMaps() {
  for (const card of document.querySelectorAll(".dsgeo-map-card")) enhanceLegacyMapCard(card);
}

function enhanceAll() {
  scheduled = false;
  positionRoteMapNodes();
  ensureRotePhaseDeck();
  enhanceLegacyMaps();
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(enhanceAll);
}

function install() {
  enhanceAll();
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:workspace-activated", scheduleEnhance);
  window.addEventListener("resize", scheduleEnhance, { passive: true });
  document.getElementById("allyForm")?.addEventListener("submit", () => setTimeout(scheduleEnhance, 650));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
