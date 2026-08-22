import {
  buildPlayerTbSpecialReadiness,
  officerReadinessUrl,
  specialMissionsForLocation,
  tbFarmTargets,
} from "./tb-special-readiness-registry.js";

const state = {
  catalogPromise: null,
  catalog: [],
  rows: [],
  body: null,
  signature: "",
  scheduled: false,
  rendering: false,
};

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? "").trim();
const digits = (value) => text(value).replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function ensureCss() {
  if (document.querySelector('link[data-tb-readiness-cross-surface="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/tb-readiness-cross-surface.css?v=20260822-tbreadiness1";
  link.dataset.tbReadinessCrossSurface = "true";
  document.head.appendChild(link);
}

function setStableMarkup(node, signature, html) {
  if (!node || node.dataset.tbxSignature === signature) return false;
  node.dataset.tbxSignature = signature;
  node.innerHTML = html;
  return true;
}

async function loadCatalog() {
  const shared = window.__swgohCatalogSnapshot?.body?.units;
  if (Array.isArray(shared) && shared.length) return shared;
  if (state.catalog.length) return state.catalog;
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = fetch("/data/catalog.json?tb-readiness-surfaces=1", { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `Game catalog returned HTTP ${response.status}`);
      state.catalog = array(body?.units);
      return state.catalog;
    })
    .catch((error) => {
      state.catalogPromise = null;
      throw error;
    });
  return state.catalogPromise;
}

function currentBody() {
  return window.__swgohLiveSnapshot?.body || null;
}

function currentAllyCode() {
  return digits(window.__swgohLiveSnapshot?.allyCode || document.getElementById("allyCode")?.value || window.__swgohAccountAllyCode);
}

function statusTone(status) {
  if (status === "READY") return "ready";
  if (status === "ALMOST") return "almost";
  return "far";
}

function stateChip(requirement = {}) {
  const unitState = requirement.state || {};
  return `<span class="tbx-unit ${escapeAttr(unitState.tone || "far")}"><b>${escapeHtml(requirement.name)}</b><small>${escapeHtml(unitState.label || "LOCKED")}</small></span>`;
}

function missionStatusMarkup(row) {
  return `<span class="tbx-status ${statusTone(row.status)}">${escapeHtml(row.status)}</span>`;
}

function missionLocation(row) {
  const tb = row.tbId === "rote" ? `ROTE P${row.phase}` : `DS Geo P${row.phase}`;
  return `${tb} · ${row.territoryName}`;
}

function playerMissionCard(row) {
  const requirements = array(row.requirements);
  return `<article class="tbx-player-mission ${statusTone(row.status)}">
    <header><div><span>${escapeHtml(missionLocation(row))}</span><strong>${escapeHtml(row.label)}</strong></div>${missionStatusMarkup(row)}</header>
    <div class="tbx-player-requirements">${requirements.map(stateChip).join("")}</div>
    <p>${escapeHtml(row.upgradeText || row.gateText)}</p>
    <footer><span>${escapeHtml(row.gateText)}</span></footer>
  </article>`;
}

function ensurePlayerPanel() {
  const panel = document.getElementById("workspace-guild");
  if (!panel) return null;
  let section = document.getElementById("tbPersonalReadinessPanel");
  if (section) return section;
  section = document.createElement("section");
  section.id = "tbPersonalReadinessPanel";
  section.className = "card tbx-personal-panel";
  const intro = panel.querySelector(":scope > .workspace-intro");
  if (intro?.nextSibling) panel.insertBefore(section, intro.nextSibling); else panel.prepend(section);
  return section;
}

function playerPanelSignature(rows) {
  if (!state.body) return "player:empty";
  return `player:${state.signature}:${rows.map((row) => `${row.id}:${row.status}:${row.upgradeText}:${array(row.requirements).map((req) => `${req.baseId}:${req.state?.label || ""}`).join(",")}`).join("|")}`;
}

function renderPlayerPanel(rows) {
  const section = ensurePlayerPanel();
  if (!section) return;
  if (!state.body) {
    setStableMarkup(section, "player:empty", `<header class="tbx-section-head"><div><span>YOUR TB CHECK</span><h3>Special Mission Readiness</h3><p>Load an Ally Code to see whether this player is ready for Zeffo, Mandalore, Reva and Wat.</p></div></header>`);
    return;
  }
  const ready = rows.filter((row) => row.ready).length;
  const html = `
    <header class="tbx-section-head"><div><span>YOUR TB CHECK</span><h3>Special Mission Readiness</h3><p>Exact personal entry gates from the same models used by Guild Officers.</p></div><strong>${ready}/${rows.length} READY</strong></header>
    <div class="tbx-player-grid">${rows.map(playerMissionCard).join("")}</div>`;
  setStableMarkup(section, playerPanelSignature(rows), html);
}

function farmTargetCard(target) {
  return `<article class="tbx-farm-target ${escapeAttr(target.tone)}" ${target.baseId ? `data-inspect-base-id="${escapeAttr(target.baseId)}" tabindex="0" role="button"` : ""}>
    <div><span>${escapeHtml(target.missionLabel)} · P${target.phase} · ${escapeHtml(target.territoryName)}</span><strong>${escapeHtml(target.name)}</strong></div>
    <div class="tbx-farm-current"><small>Current</small><b>${escapeHtml(target.current)}</b></div>
    <div class="tbx-farm-target-value"><small>TB Target</small><b>${escapeHtml(target.target)}</b></div>
  </article>`;
}

function ensureFarmPanel() {
  const panel = document.getElementById("workspace-farm");
  if (!panel) return null;
  let section = document.getElementById("tbFarmReadinessPanel");
  if (section) return section;
  section = document.createElement("section");
  section.id = "tbFarmReadinessPanel";
  section.className = "card tbx-farm-panel";
  const intro = panel.querySelector(":scope > .workspace-intro");
  if (intro?.nextSibling) panel.insertBefore(section, intro.nextSibling); else panel.prepend(section);
  return section;
}

function farmPanelSignature(rows, targets) {
  if (!state.body) return "farm:empty";
  return `farm:${state.signature}:${rows.map((row) => `${row.id}:${row.status}`).join("|")}:${targets.map((target) => `${target.missionId}:${target.baseId}:${target.current}:${target.target}`).join("|")}`;
}

function renderFarmPanel(rows) {
  const section = ensureFarmPanel();
  if (!section) return;
  if (!state.body) {
    setStableMarkup(section, "farm:empty", `<header class="tbx-section-head"><div><span>TB READY FARMING</span><h3>Territory Battle Farm Guide</h3><p>Load an Ally Code to build a farming list from current special-mission gaps.</p></div></header>`);
    return;
  }
  const targets = tbFarmTargets(rows);
  const ready = rows.filter((row) => row.ready).length;
  const html = `
    <header class="tbx-section-head"><div><span>TB READY FARMING</span><h3>Territory Battle Farm Guide</h3><p>Mission-specific upgrades only. Close targets appear first; completed mission requirements are removed automatically.</p></div><strong>${ready}/${rows.length} MISSIONS READY</strong></header>
    <div class="tbx-farm-mission-strip">${rows.map((row) => `<span class="${statusTone(row.status)}"><b>${escapeHtml(row.shortLabel)}</b>${escapeHtml(row.status)}</span>`).join("")}</div>
    ${targets.length ? `<div class="tbx-farm-targets">${targets.map(farmTargetCard).join("")}</div>` : '<div class="tbx-all-ready">✅ All currently supported TB special-mission entry requirements are complete.</div>'}`;
  setStableMarkup(section, farmPanelSignature(rows, targets), html);
}

function missionRowsById() {
  return new Map(state.rows.map((row) => [row.id, row]));
}

function mapBadgeMarkup(missions) {
  const byId = missionRowsById();
  return `<span class="tbx-map-badges">${missions.map((mission) => {
    const row = byId.get(mission.id);
    const tone = row ? statusTone(row.status) : "unknown";
    return `<span class="tbx-map-badge ${tone}" title="${escapeAttr(mission.gateText)}"><b>${escapeHtml(mission.shortLabel)}</b>${row ? `<small>${escapeHtml(row.status)}</small>` : ""}</span>`;
  }).join("")}</span>`;
}

function decorateRoteLocation(territoryId) {
  const missions = specialMissionsForLocation("rote", territoryId);
  if (!missions.length) return;
  for (const card of document.querySelectorAll(`[data-tb-open-rote="${CSS.escape(territoryId)}"]`)) {
    const target = card.querySelector(".tb-phase-territory-copy") || card;
    let badges = target.querySelector(":scope > [data-tbx-map-special]");
    const html = mapBadgeMarkup(missions);
    if (!badges) {
      badges = document.createElement("span");
      badges.dataset.tbxMapSpecial = "true";
      target.appendChild(badges);
    }
    if (badges.innerHTML !== html) badges.innerHTML = html;
  }
  for (const pin of document.querySelectorAll(`#roteGalaxyMap [data-rote-planet="${CSS.escape(territoryId)}"]`)) {
    let badges = pin.querySelector(":scope > [data-tbx-map-pin-special]");
    const html = mapBadgeMarkup(missions);
    if (!badges) {
      badges = document.createElement("span");
      badges.dataset.tbxMapPinSpecial = "true";
      badges.className = "tbx-map-pin-special";
      pin.appendChild(badges);
    }
    if (badges.innerHTML !== html) badges.innerHTML = html;
  }
}

function decorateWatLocation() {
  const missions = specialMissionsForLocation("geo-separatist", "p3-middle");
  if (!missions.length) return;
  const html = mapBadgeMarkup(missions);
  for (const card of document.querySelectorAll('[data-tb-legacy-open="p3-middle"], [data-dsgeo-territory="p3-middle"]')) {
    let badges = card.querySelector(":scope > [data-tbx-map-special]");
    if (!badges) {
      badges = document.createElement("span");
      badges.dataset.tbxMapSpecial = "true";
      badges.className = "tbx-legacy-map-special";
      card.appendChild(badges);
    }
    if (badges.innerHTML !== html) badges.innerHTML = html;
  }
}

function decorateMaps() {
  decorateRoteLocation("bracca");
  decorateRoteLocation("tatooine");
  decorateWatLocation();
}

function installOfficerLinks() {
  const allyCode = currentAllyCode();
  for (const row of state.rows) {
    for (const node of document.querySelectorAll(`[data-tbx-officer-mission="${CSS.escape(row.id)}"]`)) node.href = officerReadinessUrl(row.id, allyCode);
  }
}

async function refresh(force = false) {
  if (state.rendering) return;
  state.rendering = true;
  try {
    ensureCss();
    const body = currentBody();
    state.body = body;
    if (body) {
      const catalog = await loadCatalog();
      const signature = `${currentAllyCode()}|${window.__swgohLiveSnapshot?.fetchedAt || 0}|${catalog.length}`;
      if (force || signature !== state.signature) {
        state.rows = buildPlayerTbSpecialReadiness(body, catalog);
        state.signature = signature;
      }
    } else {
      state.rows = [];
      state.signature = "";
    }
    renderPlayerPanel(state.rows);
    renderFarmPanel(state.rows);
    decorateMaps();
    installOfficerLinks();
  } catch {
    decorateMaps();
  } finally {
    state.rendering = false;
  }
}

function schedule(force = false) {
  if (state.scheduled) return;
  state.scheduled = true;
  requestAnimationFrame(() => {
    state.scheduled = false;
    refresh(force);
  });
}

function install() {
  ensureCss();
  const observer = new MutationObserver(() => schedule(false));
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("swgoh:workspace-activated", () => schedule(false));
  window.addEventListener("swgoh:farm-workspace-loaded", () => schedule(false));
  window.addEventListener("hashchange", () => schedule(false));
  document.getElementById("allyForm")?.addEventListener("submit", () => setTimeout(() => schedule(true), 450));
  schedule(true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
