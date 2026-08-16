import {
  ROTE_VISUAL_ASSETS,
  TB_CAMPAIGN_MAP_ASSETS,
  TB_CAMPAIGN_MATCHERS,
  TB_MISSION_VISUAL_ASSETS,
  TB_VISUAL_SOURCES,
  missionVisualKind,
} from "./tb-visual-assets-data.js";

const ATTR = "data-tb-visual-enhanced";
let scheduled = false;

function imageElement(src, className, alt = "") {
  const image = document.createElement("img");
  image.src = src;
  image.className = className;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => image.remove(), { once: true });
  return image;
}

function cssUrl(url) {
  return `url("${String(url).replaceAll('"', "%22")}")`;
}

function ensureAttribution(host, source) {
  if (!host || host.querySelector(":scope > .tb-visual-credit")) return;
  const credit = document.createElement("div");
  credit.className = "tb-visual-credit";
  credit.textContent = `Visual reference: ${source.label}`;
  host.appendChild(credit);
}

function enhanceRoteMap() {
  const map = document.getElementById("roteGalaxyMap");
  if (!map) return;

  map.classList.add("tb-real-visual-map");
  map.style.setProperty("--tb-rote-map", cssUrl(ROTE_VISUAL_ASSETS.map));
  map.style.setProperty("--tb-rote-starfield", cssUrl(ROTE_VISUAL_ASSETS.starfield));

  for (const node of map.querySelectorAll("[data-rote-planet]")) {
    const planetId = String(node.dataset.rotePlanet || "");
    const src = ROTE_VISUAL_ASSETS.planets[planetId];
    const orb = node.querySelector(".rote-planet-orb");
    if (!src || !orb || orb.querySelector("img.tb-planet-art")) continue;
    orb.appendChild(imageElement(src, "tb-planet-art", ""));
    node.classList.add("tb-has-real-planet");
  }

  const mapCard = map.closest(".rote-map-card");
  if (mapCard) ensureAttribution(mapCard, TB_VISUAL_SOURCES.rote);
}

function selectedRotePlanetId() {
  return document.querySelector("#roteGalaxyMap [data-rote-planet].selected")?.dataset.rotePlanet || "";
}

function enhanceRoteBoard() {
  const board = document.getElementById("roteMissionBoard");
  if (!board) return;
  const planetId = selectedRotePlanetId();
  const planetSrc = ROTE_VISUAL_ASSETS.planets[planetId];
  const head = board.querySelector(".rote-board-head");

  if (head && planetSrc) {
    let art = head.querySelector(".tb-rote-board-planet");
    if (!art) {
      art = document.createElement("span");
      art.className = "tb-rote-board-planet";
      head.prepend(art);
    }
    if (art.dataset.planetId !== planetId) {
      art.replaceChildren(imageElement(planetSrc, "tb-rote-board-planet-image", ""));
      art.dataset.planetId = planetId;
    }
  }

  for (const chip of board.querySelectorAll(".rote-mission-chips > span")) {
    if (chip.querySelector("img.tb-mission-icon")) continue;
    const kind = missionVisualKind(chip.textContent || "");
    const src = TB_MISSION_VISUAL_ASSETS[kind] || TB_MISSION_VISUAL_ASSETS.combat;
    chip.prepend(imageElement(src, "tb-mission-icon", ""));
    chip.dataset.missionVisual = kind;
  }
}

function campaignIdForCard(card) {
  const kicker = String(card.querySelector(".kicker")?.textContent || "").toUpperCase();
  const map = card.querySelector(".legacytb-map");
  const theme = String(map?.className || "").toUpperCase();
  const haystack = `${kicker} ${theme}`;
  return TB_CAMPAIGN_MATCHERS.find((entry) => entry.fragments.some((fragment) => haystack.includes(fragment)))?.id || "";
}

function enhanceCampaignMaps() {
  for (const card of document.querySelectorAll(".dsgeo-map-card")) {
    const campaignId = campaignIdForCard(card);
    const map = card.querySelector(".dsgeo-map");
    const asset = TB_CAMPAIGN_MAP_ASSETS[campaignId];
    if (!campaignId || !map || !asset) continue;

    map.classList.add("tb-campaign-image-map", `tb-campaign-image-${campaignId}`);
    map.style.setProperty("--tb-campaign-map", cssUrl(asset));
    map.dataset.tbCampaignVisual = campaignId;
    ensureAttribution(card, campaignId.startsWith("geo-") ? TB_VISUAL_SOURCES.geo : TB_VISUAL_SOURCES.hoth);
  }
}

function enhanceMissionTypeLabels() {
  for (const badge of document.querySelectorAll(".dsgeo-mission-type")) {
    if (badge.hasAttribute(ATTR)) continue;
    const explicitType = [...badge.classList].find((value) => ["combat", "fleet", "special", "platoon", "operations", "deployment"].includes(value)) || "";
    const kind = missionVisualKind(badge.textContent || "", explicitType);
    const src = TB_MISSION_VISUAL_ASSETS[kind] || TB_MISSION_VISUAL_ASSETS.combat;
    badge.prepend(imageElement(src, "tb-mission-icon", ""));
    badge.dataset.missionVisual = kind;
    badge.setAttribute(ATTR, "true");
  }
}

function enhanceAll() {
  scheduled = false;
  enhanceRoteMap();
  enhanceRoteBoard();
  enhanceCampaignMaps();
  enhanceMissionTypeLabels();
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
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
