import { ROTE_VISUAL_ASSETS, TB_MISSION_VISUAL_ASSETS } from "./tb-visual-assets-data.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

const ROTE_LOCATION_PREVIEW = Object.freeze([
  Object.freeze({ id: "tatooine", label: "Tatooine" }),
  Object.freeze({ id: "felucia", label: "Felucia" }),
  Object.freeze({ id: "bracca", label: "Bracca" }),
  Object.freeze({ id: "zeffo", label: "Zeffo" }),
]);

export function roteLocationPreview() {
  return ROTE_LOCATION_PREVIEW.map((location) => Object.freeze({
    ...location,
    image: ROTE_VISUAL_ASSETS.planets[location.id] || "",
  }));
}

function roteModule() {
  return [...document.querySelectorAll(".ccv2-module")]
    .find((module) => module.querySelector(".kicker")?.textContent?.trim() === "GUILD / ROTE") || null;
}

function enhanceRoteModule() {
  const module = roteModule();
  if (!module || module.dataset.visualAssetsEnhanced === "true") return false;
  module.dataset.visualAssetsEnhanced = "true";
  const locations = roteLocationPreview();
  const strip = document.createElement("div");
  strip.className = "ccv2-location-strip";
  strip.setAttribute("aria-label", "ROTE location visual references");
  strip.innerHTML = locations.map((location) => `
    <span class="ccv2-location-tile" title="${escapeAttr(location.label)} · ROTE map reference">
      ${location.image ? `<img src="${escapeAttr(location.image)}" alt="" loading="lazy">` : ""}
      <b>${escapeHtml(location.label)}</b>
    </span>`).join("");
  const metrics = module.querySelector(".ccv2-module-metrics");
  metrics?.insertAdjacentElement("afterend", strip);
  return true;
}

function enhanceLaunchRail() {
  const guild = document.querySelector('[data-ccv2-launch="guild"]');
  const journey = document.querySelector('[data-ccv2-launch="journey"]');
  if (guild && guild.dataset.visualAssetEnhanced !== "true") {
    guild.dataset.visualAssetEnhanced = "true";
    guild.style.setProperty("--ccv2-launch-image", `url("${ROTE_VISUAL_ASSETS.map}")`);
    guild.classList.add("has-visual-asset");
  }
  if (journey && journey.dataset.visualAssetEnhanced !== "true") {
    journey.dataset.visualAssetEnhanced = "true";
    journey.style.setProperty("--ccv2-launch-image", `url("${TB_MISSION_VISUAL_ASSETS.special}")`);
    journey.classList.add("has-visual-asset");
  }
}

function enhance() {
  enhanceRoteModule();
  enhanceLaunchRail();
}

const observer = new MutationObserver(() => {
  const needsRote = roteModule()?.dataset.visualAssetsEnhanced !== "true";
  const needsLaunch = [...document.querySelectorAll('[data-ccv2-launch="guild"], [data-ccv2-launch="journey"]')]
    .some((node) => node.dataset.visualAssetEnhanced !== "true");
  if (needsRote || needsLaunch) queueMicrotask(enhance);
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhance, { once: true });
else enhance();
observer.observe(document.body, { childList: true, subtree: true });
