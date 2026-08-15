import { JOURNEY_PRESETS, journeyPresetById } from "./farm-presets.js";
import { currentGear, currentLevel, currentRelic, currentStars, eventProgress, requirementProgress } from "./journey-progress.js";

const state = {
  catalog: [],
  catalogMap: new Map(),
  liveBody: null,
  allyCode: "",
  lastFetch: 0,
  initialized: false,
};

const LIVE_CACHE_MS = 25_000;
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function storageKey() {
  return `swgoh:journey-tracker:v2:${digits($("allyCode")?.value) || state.allyCode || "default"}`;
}

function readTracked() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    return Array.isArray(value) ? value.filter((id) => journeyPresetById(id)) : [];
  } catch {
    return [];
  }
}

function writeTracked(ids) {
  localStorage.setItem(storageKey(), JSON.stringify([...new Set(ids)]));
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const response = await fetch("/data/catalog.json?journey=2", { cache: "no-store" });
  if (!response.ok) throw new Error(`Game catalog returned HTTP ${response.status}`);
  const body = await response.json();
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  state.catalogMap = new Map(state.catalog.map((unit) => [String(unit.baseId), unit]));
  return state.catalog;
}

async function loadLive(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  if (!force && state.liveBody && state.allyCode === allyCode && Date.now() - state.lastFetch < LIVE_CACHE_MS) {
    return state.liveBody;
  }
  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.liveBody = body;
  state.allyCode = allyCode;
  state.lastFetch = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.lastFetch };
  return body;
}

function requiredLabel(requirement) {
  if (requirement.type === "RELIC") return `R${requirement.tier}`;
  if (requirement.type === "GEAR") return `G${requirement.tier}`;
  return `${requirement.tier}★`;
}

function unitName(baseId) {
  return state.catalogMap.get(baseId)?.name || baseId;
}

function unitImage(baseId) {
  return state.catalogMap.get(baseId)?.image || "";
}

function targetSummary(event, liveMap) {
  const target = liveMap.get(event.targetBaseId);
  if (!target) return "Target not unlocked";
  const relic = currentRelic(target);
  return relic > 0
    ? `Unlocked · ${currentStars(target)}★ · G${currentGear(target)} · R${relic}`
    : `Unlocked · ${currentStars(target)}★ · G${currentGear(target)}`;
}

function progressCell(current, required, formatter = (value) => String(value)) {
  if (!required) return '<span class="journey-na">—</span>';
  const complete = Number(current) >= Number(required);
  return `<span class="journey-value${complete ? " complete" : ""}">${escapeHtml(formatter(current))}<small>/ ${escapeHtml(formatter(required))}</small></span>`;
}

function requirementRow(requirement, liveMap) {
  const unit = liveMap.get(requirement.baseId) || null;
  const progress = requirementProgress(unit, requirement);
  const image = unit?.image || unitImage(requirement.baseId);
  const owned = Boolean(unit?.baseId);
  return `
    <tr class="journey-unit-row${progress.complete ? " complete" : ""}" data-inspect-base-id="${escapeAttr(requirement.baseId)}" tabindex="0" role="button" aria-label="Inspect ${escapeAttr(unitName(requirement.baseId))}">
      <td class="journey-unit-cell">
        <div class="journey-unit">
          ${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="journey-avatar-fallback">?</span>'}
          <div><strong>${escapeHtml(unitName(requirement.baseId))}</strong><small>${owned ? "Owned" : "Locked"} · requires ${escapeHtml(requiredLabel(requirement))}</small></div>
        </div>
      </td>
      <td><span class="journey-owned ${owned ? "yes" : "no"}">${owned ? "Owned" : "Locked"}</span></td>
      <td>${progressCell(progress.level, progress.requiredLevel, (value) => String(value))}</td>
      <td>${progressCell(progress.stars, progress.requiredStars, (value) => `${value}★`)}</td>
      <td>${progressCell(progress.gear, progress.requiredGear, (value) => `G${value}`)}</td>
      <td>${progressCell(progress.relic, progress.requiredRelic, (value) => `R${value}`)}</td>
      <td class="journey-row-progress"><strong>${progress.percent}%</strong><div><span style="width:${progress.percent}%"></span></div></td>
    </tr>
  `;
}

function eventCard(event, liveMap) {
  const summary = eventProgress(event.requirements, liveMap);
  const percent = summary.percent;
  const completeCount = summary.completeCount;
  const target = state.catalogMap.get(event.targetBaseId);
  const targetImage = liveMap.get(event.targetBaseId)?.image || target?.image || "";

  return `
    <article class="journey-card" data-journey-card="${escapeAttr(event.id)}">
      <header class="journey-card-head">
        <div class="journey-target">
          ${targetImage ? `<button class="journey-target-image" type="button" data-inspect-base-id="${escapeAttr(event.targetBaseId)}"><img src="${escapeAttr(targetImage)}" alt=""></button>` : ""}
          <div>
            <span class="journey-category">${escapeHtml(event.category)}</span>
            <h3>${escapeHtml(event.name)}</h3>
            <small>${escapeHtml(targetSummary(event, liveMap))}</small>
          </div>
        </div>
        <div class="journey-score"><strong>${percent}%</strong><span>${completeCount}/${event.requirements.length} requirements complete</span></div>
        <button class="journey-remove" type="button" data-untrack-journey="${escapeAttr(event.id)}" aria-label="Stop tracking ${escapeAttr(event.name)}">×</button>
      </header>
      <div class="journey-total-progress" aria-label="${percent}% complete"><span style="width:${percent}%"></span></div>
      <div class="journey-table-wrap">
        <table class="journey-table">
          <thead><tr><th>Required unit</th><th>Status</th><th>Level</th><th>Stars</th><th>Gear</th><th>Relic</th><th>Progress</th></tr></thead>
          <tbody>${event.requirements.map((requirement) => requirementRow(requirement, liveMap)).join("")}</tbody>
        </table>
      </div>
    </article>
  `;
}

function presetChooser() {
  const categories = [...new Set(JOURNEY_PRESETS.map((event) => event.category))];
  return categories.map((category) => `
    <section class="journey-preset-group">
      <h4>${escapeHtml(category)}</h4>
      <div class="journey-preset-buttons">
        ${JOURNEY_PRESETS.filter((event) => event.category === category).map((event) => `
          <button type="button" data-track-journey="${escapeAttr(event.id)}">${escapeHtml(event.name)}<span>+</span></button>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function installShell(panel) {
  panel.innerHTML = `
    <section class="card workspace-intro journey-intro">
      <div class="kicker">JOURNEY / EVENT FARMING</div>
      <h2>Farm Tracker</h2>
      <p>Choose an unlock journey, then compare every required character or ship directly against the loaded player's live roster. Progress uses the event requirement itself: stars, level, gear and relic.</p>
    </section>
    <section class="card journey-chooser">
      <div class="journey-chooser-head">
        <div><div class="kicker">CHOOSE A FARM</div><h3>Journey Events</h3><p class="workspace-note">Track several journeys at once. Your selections are stored per Ally Code on this device.</p></div>
        <div class="journey-select-row">
          <select id="journeyEventSelect" aria-label="Journey event">
            ${[...new Set(JOURNEY_PRESETS.map((event) => event.category))].map((category) => `<optgroup label="${escapeAttr(category)}">${JOURNEY_PRESETS.filter((event) => event.category === category).map((event) => `<option value="${escapeAttr(event.id)}">${escapeHtml(event.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
          <button id="journeyTrackSelected" type="button">Track Journey</button>
        </div>
      </div>
      <details class="journey-preset-picker">
        <summary>Browse all available Journey presets</summary>
        ${presetChooser()}
      </details>
    </section>
    <section class="journey-live-status card" id="journeyLiveStatus">Load an Ally Code to compare Journey requirements with a live roster.</section>
    <section id="journeyTrackedList" class="journey-tracked-list"></section>
  `;
}

async function render(force = false) {
  const list = $("journeyTrackedList");
  const status = $("journeyLiveStatus");
  if (!list || !status) return;
  await loadCatalog();
  const body = await loadLive(force);
  const trackedIds = readTracked();
  if (!body) {
    status.textContent = "Load a 9-digit Ally Code first. Journey presets are ready, but percentages require the live player roster.";
    list.innerHTML = trackedIds.map((id) => {
      const event = journeyPresetById(id);
      return `<article class="journey-card journey-no-player"><h3>${escapeHtml(event.name)}</h3><p>Waiting for live roster.</p></article>`;
    }).join("");
    return;
  }

  const units = [...(body.units || []), ...(body.ships || [])];
  const liveMap = new Map(units.map((unit) => [String(unit.baseId), unit]));
  status.innerHTML = `<strong>${escapeHtml(body.player?.name || body.player?.allyCode || "Player")}</strong> · ${units.length} owned units loaded · ${trackedIds.length} journey${trackedIds.length === 1 ? "" : "s"} tracked.`;

  if (!trackedIds.length) {
    list.innerHTML = `<section class="card journey-empty"><h3>No journeys tracked yet</h3><p>Choose a Galactic Legend, capital ship, or Journey Guide unit above. The tracker will show exactly what this player still needs.</p></section>`;
    return;
  }

  list.innerHTML = trackedIds.map((id) => eventCard(journeyPresetById(id), liveMap)).join("");
}

function addTracked(id) {
  if (!journeyPresetById(id)) return;
  const next = readTracked();
  if (!next.includes(id)) next.push(id);
  writeTracked(next);
  render(false).catch(showError);
}

function removeTracked(id) {
  writeTracked(readTracked().filter((value) => value !== id));
  render(false).catch(showError);
}

function showError(error) {
  const status = $("journeyLiveStatus");
  if (status) status.textContent = error?.message || "Journey tracker data is unavailable.";
}

function init() {
  if (state.initialized) return;
  const panel = $("workspace-farm");
  if (!panel) {
    setTimeout(init, 75);
    return;
  }
  state.initialized = true;
  installShell(panel);

  $("journeyTrackSelected")?.addEventListener("click", () => addTracked($("journeyEventSelect")?.value));
  panel.addEventListener("click", (event) => {
    const add = event.target.closest("[data-track-journey]");
    if (add) {
      addTracked(add.dataset.trackJourney);
      return;
    }
    const remove = event.target.closest("[data-untrack-journey]");
    if (remove) removeTracked(remove.dataset.untrackJourney);
  });
  panel.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-inspect-base-id]");
    if (row && (event.key === "Enter" || event.key === " ")) row.click();
  });

  $("allyForm")?.addEventListener("submit", () => {
    state.liveBody = null;
    state.lastFetch = 0;
    setTimeout(() => render(true).catch(showError), 500);
  });
  document.querySelector("[data-workspace-tab='farm']")?.addEventListener("click", () => {
    setTimeout(() => render(false).catch(showError), 0);
  });

  render(false).catch(showError);
}

init();
