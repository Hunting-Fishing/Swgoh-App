const GAME_ASSET_BASE = "https://game-assets.swgoh.gg/textures";
const SWGOH_GG_ASSET_BASE = "https://swgoh.gg/static/img/assets";

const MATERIAL_ICONS = {
  Omega: `${GAME_ASSET_BASE}/tex.skill_pentagon_gold.png`,
  Zeta: `${GAME_ASSET_BASE}/tex.skill_zeta.png`,
  Omicron: `${GAME_ASSET_BASE}/tex.skill_hexagon_white.png`,
};

const imageState = new WeakMap();
let catalog = null;
let catalogMap = new Map();
let scheduled = false;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeAssetName(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/^textures\//i, "")
    .replace(/\.(png|jpg|jpeg|webp)$/i, "");
}

function gameAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const name = normalizeAssetName(raw);
  return name ? `${GAME_ASSET_BASE}/${encodeURIComponent(name)}.png` : "";
}

function swgohGgAssetUrl(value) {
  const name = normalizeAssetName(value);
  return name ? `${SWGOH_GG_ASSET_BASE}/${encodeURIComponent(name)}.png` : "";
}

function baseIdForCard(element) {
  const card = element.closest(".unit-card, .catalog-unit");
  if (!card) return "";
  const button = card.querySelector("button[data-base-id], button[data-catalog-base-id]");
  return button?.dataset?.baseId || button?.dataset?.catalogBaseId || "";
}

function candidatesForPortrait(img, staticUnit) {
  const thumbnail = staticUnit?.thumbnailName || "";
  return unique([
    img?.getAttribute("src") || "",
    staticUnit?.image || "",
    gameAssetUrl(thumbnail),
    staticUnit?.imageFallback || "",
    swgohGgAssetUrl(thumbnail),
  ]);
}

function preparePortrait(img) {
  if (!(img instanceof HTMLImageElement)) return;
  const baseId = baseIdForCard(img);
  const staticUnit = catalogMap.get(baseId);
  const candidates = candidatesForPortrait(img, staticUnit);
  if (!candidates.length) return;

  const current = img.currentSrc || img.src || img.getAttribute("src") || "";
  let index = candidates.findIndex((candidate) => {
    try {
      return new URL(candidate, location.href).href === new URL(current, location.href).href;
    } catch {
      return candidate === current;
    }
  });
  if (index < 0) index = 0;
  imageState.set(img, { candidates, index });
  img.dataset.assetFallbackReady = "true";
}

function advancePortrait(img) {
  if (!(img instanceof HTMLImageElement)) return false;
  if (!imageState.has(img)) preparePortrait(img);
  const state = imageState.get(img);
  if (!state) return false;

  for (let next = state.index + 1; next < state.candidates.length; next += 1) {
    const candidate = state.candidates[next];
    if (!candidate) continue;
    state.index = next;
    imageState.set(img, state);
    img.src = candidate;
    return true;
  }

  img.style.display = "none";
  return false;
}

function ensurePortraits(root = document) {
  const cards = root.matches?.(".unit-card, .catalog-unit")
    ? [root]
    : [...root.querySelectorAll?.(".unit-card, .catalog-unit") || []];

  for (const card of cards) {
    const button = card.querySelector("button[data-base-id], button[data-catalog-base-id]");
    const baseId = button?.dataset?.baseId || button?.dataset?.catalogBaseId || "";
    const staticUnit = catalogMap.get(baseId);
    const portrait = card.querySelector(".portrait, .catalog-portrait");
    if (!portrait || !staticUnit) continue;

    let img = portrait.querySelector("img[data-portrait]");
    if (!img) {
      const candidates = candidatesForPortrait(null, staticUnit);
      if (!candidates.length) continue;
      img = document.createElement("img");
      img.dataset.portrait = "";
      img.alt = staticUnit.name || baseId;
      img.loading = "lazy";
      const initials = portrait.querySelector(".initials");
      if (initials?.nextSibling) portrait.insertBefore(img, initials.nextSibling);
      else portrait.appendChild(img);
      imageState.set(img, { candidates, index: 0 });
      img.src = candidates[0];
    } else {
      preparePortrait(img);
    }
  }
}

function decorateMaterialFlags(root = document) {
  for (const flag of root.querySelectorAll?.(".ability-flags em") || []) {
    const label = flag.textContent.trim();
    const src = MATERIAL_ICONS[label];
    if (!src || flag.querySelector("img")) continue;

    const icon = document.createElement("img");
    icon.className = "ability-material-icon";
    icon.src = src;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    flag.prepend(icon);
    flag.classList.add(`material-${label.toLowerCase()}`);
  }
}

function parseDialogBaseId(details) {
  const kicker = details.querySelector(".kicker")?.textContent || "";
  if (!kicker.includes("·")) return "";
  return kicker.split("·").pop().trim();
}

function decorateAbilityRows(details) {
  if (!(details instanceof HTMLElement)) return;
  const baseId = parseDialogBaseId(details);
  const staticUnit = catalogMap.get(baseId);
  const rows = [...details.querySelectorAll(".abilities > li")];

  if (staticUnit && rows.length) {
    const abilities = Array.isArray(staticUnit.abilities) ? staticUnit.abilities : [];
    rows.forEach((row, index) => {
      const ability = abilities[index];
      if (!ability) return;

      const heading = row.querySelector(".ability-heading");
      const title = heading?.querySelector("strong");
      const staticName = String(ability.name || "").trim();
      if (title && staticName && staticName !== "DEFENSE UP") title.textContent = staticName;

      const source = ability.image || ability.icon;
      if (source && !row.querySelector(".ability-move-icon")) {
        const icon = document.createElement("img");
        icon.className = "ability-move-icon";
        icon.src = gameAssetUrl(source);
        icon.alt = staticName ? `${staticName} ability icon` : "Ability icon";
        row.insertBefore(icon, row.firstChild);
        row.classList.add("has-ability-icon");
      }
    });
  }

  decorateMaterialFlags(details);

  const readinessLabel = details.querySelector(".readiness-banner > div:first-child span");
  if (readinessLabel) readinessLabel.textContent = "Upgrade Completion";
  const statusLabel = details.querySelector(".readiness-banner > div:nth-child(2) span");
  if (statusLabel) statusLabel.textContent = "Upgrade State";

  if (Number(catalog?.schemaVersion || 0) < 6 && rows.length > 1) {
    const defenseRows = rows.filter((row) => row.querySelector(".ability-heading strong")?.textContent.trim() === "DEFENSE UP");
    if (defenseRows.length > 1) {
      for (const row of defenseRows) {
        const title = row.querySelector(".ability-heading strong");
        if (title) title.textContent = "Ability name refreshing…";
      }
    }
  }
}

function showCatalogIntegrity() {
  const status = document.getElementById("catalogStatus");
  if (!status || !catalog) return;
  const schema = Number(catalog.schemaVersion || 0);
  const suffix = ` · Schema ${schema || "legacy"}`;
  if (!status.textContent.includes("Schema")) status.textContent += suffix;
  if (schema < 6) {
    status.className = "status warning";
    status.title = "This catalog predates the ability localization/material integrity repair.";
  }
}

function decorate(root = document) {
  ensurePortraits(root);
  decorateMaterialFlags(root);
  const details = document.getElementById("details");
  if (details?.children.length) decorateAbilityRows(details);
  showCatalogIntegrity();
}

function scheduleDecorate(root = document) {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    decorate(root);
  });
}

document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.matches("img[data-portrait]")) return;
  // Capture before app.js removes the image after its single fallback.
  event.stopImmediatePropagation();
  advancePortrait(img);
}, true);

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type !== "childList" || !mutation.addedNodes.length) continue;
    scheduleDecorate(document);
    break;
  }
});
observer.observe(document.body, { childList: true, subtree: true });

try {
  const response = await fetch("/data/catalog.json?schema=6", { cache: "no-store" });
  if (response.ok) {
    catalog = await response.json();
    if (Array.isArray(catalog?.units)) {
      catalogMap = new Map(catalog.units.map((unit) => [unit.baseId, unit]));
    }
  }
} catch {
  // app.js still owns the visible catalog error state.
}

decorate(document);
