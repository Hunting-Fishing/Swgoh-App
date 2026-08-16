import { ROTE_PLANETS, planetRosterReadiness } from "./rote-map-data.js";
import { ROTE_TERRITORY_SHAPES, ROTE_TERRITORY_SOURCE } from "./rote-territory-polygons-data.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));
let scheduled = false;

function liveBody() {
  return window.__swgohLiveSnapshot?.body || null;
}

function selectedPlanetId(map) {
  return map?.querySelector("[data-rote-planet].selected")?.dataset.rotePlanet || "";
}

function planetById(id) {
  return ROTE_PLANETS.find((planet) => planet.id === String(id || "")) || null;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function readinessStatus(planet) {
  const body = liveBody();
  return body && planet ? planetRosterReadiness(body, planet).status : "unloaded";
}

function territoryTitle(planet, shape) {
  const status = readinessStatus(planet);
  const threshold = shape.thresholds.at(-1);
  const suffix = threshold ? ` · ${threshold.label} ${number(threshold.tp)} TP` : "";
  return `${planet.name} · ${planet.phase} · R${planet.relic} · ${status}${suffix}`;
}

function createShapeElement(planet, shape) {
  const common = {
    "data-rote-territory": planet.id,
    tabindex: 0,
    role: "button",
    "aria-label": `Open ${planet.name} Territory Battle details`,
  };
  const element = shape.kind === "path"
    ? svgElement("path", { ...common, d: shape.path })
    : svgElement("circle", { ...common, cx: shape.cx, cy: shape.cy, r: shape.r });
  element.classList.add("rote-territory-hit", `lane-${String(planet.lane || "bonus").toLowerCase().replaceAll(" ", "-")}`);
  if (shape.kind === "hotspot") element.classList.add("source-hotspot");
  const title = svgElement("title");
  title.textContent = territoryTitle(planet, shape);
  element.appendChild(title);
  return element;
}

function selectTerritory(id) {
  const map = document.getElementById("roteGalaxyMap");
  const button = map?.querySelector(`[data-rote-planet="${CSS.escape(String(id || ""))}"]`);
  if (!button) return;
  button.click();
  requestAnimationFrame(enhanceAll);
}

function buildOverlay(map) {
  const svg = svgElement("svg", {
    class: "rote-territory-overlay",
    viewBox: ROTE_TERRITORY_SOURCE.viewBox.join(" "),
    preserveAspectRatio: "xMidYMid meet",
    "aria-label": "Interactive Rise of the Empire territories",
  });

  for (const planet of ROTE_PLANETS) {
    const shape = ROTE_TERRITORY_SHAPES[planet.id];
    if (!shape) continue;
    svg.appendChild(createShapeElement(planet, shape));
  }

  svg.addEventListener("click", (event) => {
    const target = event.target.closest?.("[data-rote-territory]");
    if (target) selectTerritory(target.dataset.roteTerritory);
  });
  svg.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest?.("[data-rote-territory]");
    if (!target) return;
    event.preventDefault();
    selectTerritory(target.dataset.roteTerritory);
  });
  map.prepend(svg);
  return svg;
}

function updateOverlay() {
  const map = document.getElementById("roteGalaxyMap");
  if (!map) return;
  let overlay = map.querySelector(":scope > .rote-territory-overlay");
  if (!overlay) overlay = buildOverlay(map);

  const selected = selectedPlanetId(map);
  for (const element of overlay.querySelectorAll("[data-rote-territory]")) {
    const id = element.dataset.roteTerritory || "";
    const planet = planetById(id);
    const shape = ROTE_TERRITORY_SHAPES[id];
    const status = readinessStatus(planet);
    element.classList.remove("status-deep", "status-ready", "status-thin", "status-blocked", "status-unloaded", "selected");
    element.classList.add(`status-${status}`);
    if (selected === id) element.classList.add("selected");
    const title = element.querySelector("title");
    if (title && planet && shape) title.textContent = territoryTitle(planet, shape);
  }
  map.dataset.roteTerritoryPolygons = "true";
}

function thresholdMarkup(shape) {
  return shape.thresholds.map((entry) => `
    <div class="tb-territory-threshold">
      <span>${entry.label}</span>
      <strong>${number(entry.tp)}</strong>
      <small>TP</small>
    </div>`).join("");
}

function updateSelectedTerritoryThresholds() {
  const map = document.getElementById("roteGalaxyMap");
  const board = document.getElementById("roteMissionBoard");
  if (!map || !board) return;
  const id = selectedPlanetId(map);
  const planet = planetById(id);
  const shape = ROTE_TERRITORY_SHAPES[id];
  if (!planet || !shape) return;

  let panel = board.querySelector(":scope > .tb-territory-threshold-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "tb-territory-threshold-panel";
    const summary = board.querySelector(".rote-board-summary");
    if (summary?.nextSibling) board.insertBefore(panel, summary.nextSibling);
    else if (summary) summary.after(panel);
    else board.prepend(panel);
  }

  if (panel.dataset.planetId === id) return;
  panel.dataset.planetId = id;
  panel.innerHTML = `
    <div class="tb-territory-threshold-head">
      <div><span>TERRITORY POINT TARGETS</span><strong>${planet.name}</strong></div>
      <small>${shape.kind === "hotspot" ? "Source hotspot" : "Source polygon"}</small>
    </div>
    <div class="tb-territory-threshold-grid">${thresholdMarkup(shape)}</div>
    <p>Reference TP thresholds are attached to the selected territory only. Roster readiness and mission eligibility continue to use the app's existing live-data engines.</p>`;
}

function enhanceAll() {
  scheduled = false;
  updateOverlay();
  updateSelectedTerritoryThresholds();
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
  document.getElementById("allyForm")?.addEventListener("submit", () => setTimeout(scheduleEnhance, 650));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
