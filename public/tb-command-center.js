import { TERRITORY_BATTLES, territoryBattleById, phaseScaffold, sourceLabels } from "./tb-command-data.js";

const STORAGE_KEY = "swgoh:tb-command:selected";
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "N/A";

const state = {
  initialized: false,
  selected: localStorage.getItem(STORAGE_KEY) || "rote",
  selectedPhase: 1,
  body: null,
  renderToken: 0,
};
let dsGeoModulePromise = null;
let legacyRendererPromise = null;
let geoLsDataPromise = null;
let hothLsDataPromise = null;

function liveBody() {
  const digits = String($("allyCode")?.value || "").replace(/\D/g, "").slice(0, 9);
  const snapshot = window.__swgohLiveSnapshot;
  if (digits.length === 9 && snapshot?.allyCode === digits && snapshot?.body) return snapshot.body;
  return state.body;
}

function alignmentPool(body, tb) {
  const units = [
    ...(Array.isArray(body?.units) ? body.units : []),
    ...(Array.isArray(body?.ships) ? body.ships : []),
  ];
  const wanted = String(tb.alignment || "Mixed").toLowerCase();
  return units.filter((unit) => {
    if (wanted === "mixed") return true;
    return String(unit.alignment || "").toLowerCase().includes(wanted);
  });
}

function rosterContext(tb) {
  const body = liveBody();
  const pool = alignmentPool(body, tb);
  const seven = pool.filter((unit) => Number(unit.stars || 0) >= 7);
  const relic = pool.filter((unit) => Number(unit.relic || 0) > 0);
  const r5 = pool.filter((unit) => Number(unit.relic || 0) >= 5);
  return {
    loaded: Boolean(body),
    player: body?.player || null,
    total: pool.length,
    seven: seven.length,
    relic: relic.length,
    r5: r5.length,
  };
}

function tbCard(tb) {
  const active = state.selected === tb.id;
  const status = tb.mapStatus === "live" ? "LIVE MAP" : tb.mapStatus === "reference-ready" ? "REFERENCE INGEST" : "MAP BUILD";
  return `<button type="button" class="tb-command-choice${active ? " active" : ""}" data-tb-select="${escapeAttr(tb.id)}" aria-pressed="${active ? "true" : "false"}">
    <span>${escapeHtml(tb.family)}</span>
    <strong>${escapeHtml(tb.shortName)}</strong>
    <small>${tb.phases} phases · ${tb.phaseHours}h / phase</small>
    <b>${escapeHtml(status)}</b>
  </button>`;
}

function phaseNodes(tb) {
  return phaseScaffold(tb).map((phase) => {
    const active = state.selectedPhase === phase.phase;
    return `<button type="button" class="tb-phase-node${active ? " active" : ""}" data-tb-phase="${phase.phase}">
      <span>P${phase.phase}</span>
      <strong>${escapeHtml(phase.label)}</strong>
      <small>Territory + mission dataset verification</small>
    </button>`;
  }).join("");
}

function intelligencePipeline(tb) {
  const records = [
    ["1", "Entry Rules", tb.mapStatus === "live" ? "ACTIVE" : "VERIFYING", "Named units, factions, stars, GP, gear/relic, alignment and forced-lineup rules."],
    ["2", "Proven Teams", tb.recommendationStatus === "community-reference" ? "REFERENCE" : "BUILDING", "Source-backed mission teams kept separate from simple roster strength."],
    ["3", "Your Roster Teams", "ENGINE", "Intersect verified legal teams with the loaded Ally Code and identify the strongest fieldable variants."],
    ["4", "Upgrade Priority", "ENGINE", "Rank the smallest upgrades that unlock a legal or materially stronger mission squad."],
    ["5", "Abilities / Zeta / Omicron", "SCHEMA READY", "Track ability requirements, Zeta priority, Omicron relevance and whether the investment applies in Territory Battles."],
    ["6", "Mods + Battle Plan", "SCHEMA READY", "Speed targets, sets, primaries, key secondaries, turn order, enemy mechanics and wave strategy."],
  ];
  return `<div class="tb-intelligence-grid">${records.map(([step, title, status, copy]) => `<article><span>${step}</span><div><b>${escapeHtml(status)}</b><h4>${escapeHtml(title)}</h4><p>${escapeHtml(copy)}</p></div></article>`).join("")}</div>`;
}

function genericView(tb) {
  const context = rosterContext(tb);
  const sources = sourceLabels(tb);
  const gp = tb.requiredGuildGp ? `${number(tb.requiredGuildGp)} required${tb.recommendedGuildGp ? ` · ${number(tb.recommendedGuildGp)}+ recommended` : ""}` : "See current event data";
  const phase = Math.max(1, Math.min(tb.phases, state.selectedPhase));
  return `
    <section class="tb-legacy-map-shell tb-theme-${escapeAttr(tb.theme)}">
      <section class="card tb-campaign-map">
        <header>
          <div><div class="kicker">TERRITORY BATTLE MAP ENGINE</div><h3>${escapeHtml(tb.name)}</h3><p>${escapeHtml(tb.alignment)}-side campaign · ${tb.phases} phases · ${tb.phaseHours} hour phases</p></div>
          <div class="tb-map-status ${tb.mapStatus}">${tb.mapStatus === "reference-ready" ? "REFERENCE DATA FOUND" : "EXACT MAP VERIFICATION"}</div>
        </header>
        <div class="tb-map-lanes">${phaseNodes(tb)}</div>
        <div class="tb-map-foundation-note"><strong>Phase ${phase}</strong><span>The map surface is interactive now, but exact territory polygons, combat/special/fleet missions and mission entry rules are being normalized before they are presented as game facts.</span></div>
      </section>
      <aside class="card tb-campaign-board">
        <div class="kicker">CAMPAIGN INTELLIGENCE</div>
        <h3>${escapeHtml(tb.shortName)} · Phase ${phase}</h3>
        <div class="tb-context-grid">
          <div><span>Guild GP</span><strong>${escapeHtml(gp)}</strong></div>
          <div><span>Exclusive Reward</span><strong>${escapeHtml(tb.exclusiveReward || "Event rewards")}</strong></div>
          <div><span>${escapeHtml(tb.alignment)} roster</span><strong>${context.loaded ? number(context.total) : "Load Ally Code"}</strong></div>
          <div><span>7★ side pool</span><strong>${context.loaded ? number(context.seven) : "—"}</strong></div>
          <div><span>Relic side pool</span><strong>${context.loaded ? number(context.relic) : "—"}</strong></div>
          <div><span>R5+ side pool</span><strong>${context.loaded ? number(context.r5) : "—"}</strong></div>
        </div>
        <p class="tb-boundary"><strong>Roster context only:</strong> these counts are not mission eligibility. Exact missions can require named characters, specific factions, power thresholds, ships or forced lineups.</p>
        <div class="tb-source-box"><span>Reference sources</span>${sources.map((source) => `<b>${escapeHtml(source)}</b>`).join("")}</div>
      </aside>
    </section>
    <section class="card tb-intelligence-card">
      <div class="kicker">MISSION-LEVEL RECOMMENDATION PIPELINE</div>
      <h3>From legal entry → proven squad → your roster → upgrade plan</h3>
      ${intelligencePipeline(tb)}
    </section>`;
}

async function legacyRenderer() {
  legacyRendererPromise ||= import("./legacy-tb-command.js?v=20260815-legacy2");
  return legacyRendererPromise;
}

async function renderDsGeo(host, token) {
  host.innerHTML = '<section class="card workspace-intro"><div class="workspace-note">Loading verified DS Geo territory and mission data…</div></section>';
  dsGeoModulePromise ||= import("./ds-geo-command.js?v=20260815-dsgeo2");
  const module = await dsGeoModulePromise;
  if (token !== state.renderToken || state.selected !== "geo-separatist") return;
  module.renderDsGeoCampaign(host, liveBody());
}

async function renderGeoLs(host, token) {
  host.innerHTML = '<section class="card workspace-intro"><div class="workspace-note">Loading verified Republic Offensive territory and mission data…</div></section>';
  geoLsDataPromise ||= import("./geo-ls-data.js?v=20260815-geols1");
  const [renderer, data] = await Promise.all([legacyRenderer(), geoLsDataPromise]);
  if (token !== state.renderToken || state.selected !== "geo-republic") return;
  renderer.renderLegacyTbCampaign(host, liveBody(), data.GEO_LS_CAMPAIGN);
}

async function renderHothLs(host, token) {
  host.innerHTML = '<section class="card workspace-intro"><div class="workspace-note">Loading verified Hoth Rebel Assault territory and mission data…</div></section>';
  hothLsDataPromise ||= import("./hoth-ls-data.js?v=20260815-hothls1");
  const [renderer, data] = await Promise.all([legacyRenderer(), hothLsDataPromise]);
  if (token !== state.renderToken || state.selected !== "hoth-rebel") return;
  renderer.renderLegacyTbCampaign(host, liveBody(), data.HOTH_LS_CAMPAIGN);
}

async function renderNonRote(host, tb, token) {
  try {
    if (tb.id === "geo-separatist") return await renderDsGeo(host, token);
    if (tb.id === "geo-republic") return await renderGeoLs(host, token);
    if (tb.id === "hoth-rebel") return await renderHothLs(host, token);
    if (token === state.renderToken) host.innerHTML = genericView(tb);
  } catch (error) {
    if (token !== state.renderToken) return;
    host.innerHTML = `<section class="card workspace-intro"><div class="workspace-note danger">${escapeHtml(tb.shortName)} map failed to load: ${escapeHtml(error?.message || "unknown error")}</div></section>`;
  }
}

function applySelectedBattle() {
  const panel = $("workspace-rote");
  const host = $("tbCommandLegacyHost");
  if (!panel || !host) return;
  const tb = territoryBattleById(state.selected);
  const isRote = tb.id === "rote";
  const token = ++state.renderToken;
  panel.classList.toggle("tb-non-rote", !isRote);
  const roteSwitcher = panel.querySelector(".rote-view-switcher");
  const roteMap = $("roteMapView");
  const roteOperations = $("roteOperationsView");
  if (roteSwitcher) roteSwitcher.hidden = !isRote;
  if (roteMap) roteMap.hidden = !isRote;
  if (roteOperations && !isRote) roteOperations.hidden = true;
  host.hidden = isRote;
  if (!isRote) void renderNonRote(host, tb, token);

  for (const button of panel.querySelectorAll("[data-tb-select]")) {
    const active = button.dataset.tbSelect === tb.id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  const title = $("tbCommandTitle");
  const subtitle = $("tbCommandSubtitle");
  if (title) title.textContent = isRote ? "Territory Battle Command Center · ROTE" : `Territory Battle Command Center · ${tb.shortName}`;
  if (subtitle) subtitle.textContent = isRote
    ? "ROTE has the live roster-aware planet map and Operations engine. Switch campaigns to browse Hoth / Geonosis in the same command framework."
    : tb.id === "geo-separatist"
      ? "DS Geo has a full roster-aware territory and mission map. Entry legality, community teams and upgrade gaps remain separate layers."
      : tb.id === "geo-republic"
        ? "Geo LS uses the same mission engine with KAM, Galactic Republic, Jedi, Clone, 501st and fleet restrictions evaluated against the loaded Ally Code."
        : tb.id === "hoth-rebel"
          ? "Hoth Rebel Assault is mapped phase-by-phase with Phoenix, Rebel, Rogue One and named Hoth mission requirements tied to the loaded Ally Code."
          : "The shared engine is active. Exact territories and mission rules stay verification-gated until their source data is normalized.";
  localStorage.setItem(STORAGE_KEY, tb.id);
}

function install() {
  if (state.initialized) return true;
  const panel = $("workspace-rote");
  if (!panel) return false;
  const first = panel.firstElementChild;
  if (!first) return false;

  const tab = document.querySelector('button[data-workspace-tab="rote"]');
  if (tab) tab.textContent = "TB Maps";

  const selector = document.createElement("section");
  selector.id = "tbCommandCenter";
  selector.className = "card tb-command-center";
  selector.innerHTML = `
    <div class="tb-command-head">
      <div><div class="kicker">ALL TERRITORY BATTLES · ONE PLANNER</div><h2 id="tbCommandTitle">Territory Battle Command Center</h2><p id="tbCommandSubtitle"></p></div>
      <div class="tb-command-badge">ALLY CODE AWARE</div>
    </div>
    <div class="tb-command-choices">${TERRITORY_BATTLES.map(tbCard).join("")}</div>`;
  first.insertAdjacentElement("afterend", selector);

  const host = document.createElement("section");
  host.id = "tbCommandLegacyHost";
  host.className = "tb-command-legacy-host";
  host.hidden = true;
  selector.insertAdjacentElement("afterend", host);

  panel.addEventListener("click", (event) => {
    const battle = event.target.closest("[data-tb-select]");
    if (battle) {
      state.selected = battle.dataset.tbSelect || "rote";
      state.selectedPhase = 1;
      applySelectedBattle();
      return;
    }
    const phase = event.target.closest("[data-tb-phase]");
    if (phase) {
      state.selectedPhase = Number(phase.dataset.tbPhase || 1);
      applySelectedBattle();
    }
  });

  $("allyForm")?.addEventListener("submit", () => {
    state.body = null;
    setTimeout(() => {
      state.body = liveBody();
      if (state.selected !== "rote") applySelectedBattle();
    }, 500);
  });
  window.addEventListener("swgoh:workspace-activated", (event) => {
    if (event.detail?.id !== "rote" || state.selected === "rote") return;
    applySelectedBattle();
    setTimeout(applySelectedBattle, 500);
  });

  state.initialized = true;
  applySelectedBattle();
  return true;
}

let attempts = 0;
function boot() {
  attempts += 1;
  if (install() || attempts >= 80) return;
  setTimeout(boot, 75);
}
boot();
