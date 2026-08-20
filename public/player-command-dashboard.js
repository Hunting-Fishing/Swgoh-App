import { buildPlayerCommandDashboard } from "./player-command-model.js";
import { JOURNEY_PRESETS } from "./farm-presets.js";

const state = {
  allyCode: "",
  model: null,
  fetchedAt: 0,
  loading: false,
};

const CACHE_MS = 30_000;
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "—";
const nullableNumber = (value) => value === null || value === undefined || value === "" ? "N/A" : number(value);
const signed = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${new Intl.NumberFormat().format(numeric)}`;
};

function ensureV2Stylesheet() {
  if (document.querySelector('link[data-command-center-v2="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/command-center-v2.css?v=20260820-ui2";
  link.dataset.commandCenterV2 = "true";
  document.head.appendChild(link);
}

function currentAllyCode() {
  const input = digits($("allyCode")?.value);
  if (input.length === 9) return input;
  return digits(new URLSearchParams(location.search).get("allyCode"));
}

function formatAlly(value) {
  const code = digits(value);
  return code.length === 9 ? `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}` : String(value || "—");
}

function formatTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function sourceLabel(model) {
  if (!model) return "No player loaded";
  const complete = model.source.logicalRosterComplete ? "FULL ROSTER" : "ROSTER CHECK REQUIRED";
  return `${complete} · ${formatTime(model.source.syncedAt)}`;
}

function stat(label, value, detail = "") {
  return `<div class="pro-summary-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function dashboardKpi(label, value, detail = "", accent = false) {
  return `<div class="ccv2-kpi${accent ? " accent" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function rankLabel(row) {
  return row?.known ? `#${number(row.rank)} / ${number(row.total)}` : "N/A";
}

function gapLabel(row) {
  if (!row.owned) return row.unitType === "Ship" ? `Missing · target ${number(row.target)}★` : `Missing · target R${number(row.target)}`;
  return row.unitType === "Ship"
    ? `${number(row.current)}★ → ${number(row.target)}★`
    : `R${number(row.current)} → R${number(row.target)}`;
}

function eventLabels(event = {}) {
  const delta = event.delta || {};
  const before = event.previous || {};
  const after = event.current || {};
  const labels = [];
  if (Number(delta.omicronCount || 0) > 0) labels.push(`+${number(delta.omicronCount)} Omicron`);
  if (Number(delta.zetaCount || 0) > 0) labels.push(`+${number(delta.zetaCount)} Zeta`);
  if (Number(delta.ultimateUnlocked || 0) > 0) labels.push("Ultimate unlocked");
  if (Number(delta.relicTier || 0) !== 0 && before.relicTier != null && after.relicTier != null) labels.push(`R${number(before.relicTier)} → R${number(after.relicTier)}`);
  if (Number(delta.gearLevel || 0) !== 0 && before.gearLevel != null && after.gearLevel != null) labels.push(`G${number(before.gearLevel)} → G${number(after.gearLevel)}`);
  if (Number(delta.galacticPower || 0) !== 0) labels.push(`${signed(delta.galacticPower)} GP`);
  return labels.length ? labels.join(" · ") : (event.changedFields || []).join(" · ") || "Progression change";
}

function catalogUnit(baseId) {
  const units = window.__swgohCatalogSnapshot?.body?.units;
  if (!Array.isArray(units)) return null;
  return units.find((unit) => String(unit?.baseId || unit?.id || "").toUpperCase() === String(baseId || "").toUpperCase()) || null;
}

function unitImage(baseId) {
  const unit = catalogUnit(baseId);
  return unit?.image || unit?.imageUrl || unit?.portrait || unit?.portraitUrl || unit?.thumbnail || "";
}

function unitName(baseId, fallback = "") {
  return catalogUnit(baseId)?.name || fallback || baseId || "Unknown unit";
}

function avatar(baseId, fallback = "★") {
  const image = unitImage(baseId);
  return `<span class="ccv2-mini-avatar">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : escapeHtml(fallback)}</span>`;
}

function moduleMetric(label, value) {
  return `<div class="ccv2-module-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function miniRow({ baseId = "", title = "", detail = "", value = "", fallback = "★" } = {}) {
  return `<div class="ccv2-mini-row">${avatar(baseId, fallback)}<div class="ccv2-mini-copy"><strong>${escapeHtml(title || unitName(baseId))}</strong><small>${escapeHtml(detail)}</small></div><span class="ccv2-mini-value">${escapeHtml(value)}</span></div>`;
}

function dashboardKpis(model) {
  const roster = model.roster || {};
  return `<div class="ccv2-kpis">
    ${dashboardKpi("Galactic Power", number(model.player.galacticPower))}
    ${dashboardKpi("Character GP", number(model.player.characterGp))}
    ${dashboardKpi("Ship GP", number(model.player.shipGp))}
    ${dashboardKpi("Level", number(model.player.level))}
    ${dashboardKpi("Roster", number(roster.ownedUnits), `${number(roster.characters)} chars · ${number(roster.ships)} ships`)}
    ${dashboardKpi("Galactic Legends", number(roster.galacticLegends))}
    ${dashboardKpi("R7+", number(roster.relic7Plus), `${number(roster.relic9)} at R9`)}
    ${dashboardKpi("Zetas", nullableNumber(roster.zetas))}
    ${dashboardKpi("Omicrons", nullableNumber(roster.omicrons), "owned upgrades", true)}
    ${dashboardKpi("7★ Ships", number(roster.sevenStarShips))}
  </div>`;
}

const LAUNCHES = Object.freeze([
  ["roster", "◉", "Roster", "Characters + ships"],
  ["squads", "◆", "Squads", "Build + inspect"],
  ["journey", "✦", "Journey Guide", "Unlock readiness"],
  ["events", "▣", "Events", "Guides + status"],
  ["gac", "⚔", "GAC", "Arena command"],
  ["guild", "♜", "Guild / TB", "ROTE + TW"],
  ["mods", "⬡", "Mods", "Stats + loadouts"],
  ["datacrons", "◇", "Datacrons", "Current effects"],
  ["resources", "⬢", "Resources", "Tools + references"],
  ["actions", "☰", "Action Center", "Current tasks"],
]);

function launchRail() {
  return `<nav class="ccv2-launch-rail" aria-label="Command Center quick launch">${LAUNCHES.map(([id, icon, label, detail]) => `
    <button type="button" class="ccv2-launch${id === "journey" ? " journey" : ""}" data-ccv2-launch="${escapeAttr(id)}">
      <span class="ccv2-launch-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="ccv2-launch-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>
    </button>`).join("")}</nav>`;
}

function journeyModule() {
  const supported = Array.isArray(JOURNEY_PRESETS) ? JOURNEY_PRESETS.length : 0;
  const categories = new Set((Array.isArray(JOURNEY_PRESETS) ? JOURNEY_PRESETS : []).map((row) => row?.category).filter(Boolean));
  return `<section class="ccv2-module ccv2-journey-module">
    <div class="ccv2-module-head"><div><div class="kicker">JOURNEY GUIDE</div><h3>Unlock command</h3><p>The existing Journey Map now has a first-class dashboard launch. Readiness uses your live roster; unsupported requirements are not guessed.</p></div><span class="ccv2-journey-sigil" aria-hidden="true">✦</span></div>
    <div class="ccv2-module-metrics">
      ${moduleMetric("Supported", supported || "—")}
      ${moduleMetric("Categories", categories.size || "—")}
      ${moduleMetric("Mode", "LIVE")}
    </div>
    <div class="ccv2-journey-note">Journey catalog audit + richer event art is the next visual slice. Current tracker logic remains authoritative.</div>
    <button type="button" class="ccv2-module-action" data-ccv2-launch="journey">Open Journey Guide</button>
  </section>`;
}

function roteModule(model) {
  const rote = model.rote || {};
  const gaps = Array.isArray(rote.priorityGaps) ? rote.priorityGaps.slice(0, 3) : [];
  const rows = gaps.length
    ? gaps.map((row) => miniRow({
        baseId: row.baseId,
        title: row.name || unitName(row.baseId),
        detail: gapLabel(row),
        value: `${number(row.requiredCount)} slot${Number(row.requiredCount) === 1 ? "" : "s"}`,
        fallback: "R",
      })).join("")
    : `<div class="workspace-note">${rote.requirementsAvailable ? "No highest-gate ROTE gap is currently surfaced." : "ROTE requirement evidence is unavailable."}</div>`;
  return `<section class="ccv2-module">
    <div class="ccv2-module-head"><div><div class="kicker">GUILD / ROTE</div><h3>Operation pressure</h3><p>Requirement coverage only. Assignment safety and battle opportunity cost remain separate evidence.</p></div><button type="button" class="ccv2-module-action" data-ccv2-launch="guild">Open Guild</button></div>
    <div class="ccv2-module-metrics">
      ${moduleMetric("Required", rote.requirementsAvailable ? number(rote.uniqueRequiredUnits) : "N/A")}
      ${moduleMetric("Ready", rote.requirementsAvailable ? number(rote.highestGateReadyUnits) : "N/A")}
      ${moduleMetric("Need work", rote.requirementsAvailable ? number(rote.upgradeNeededUnits) : "N/A")}
    </div>
    <div class="ccv2-mini-list">${rows}</div>
  </section>`;
}

function progressionModule(model) {
  const history = model.history || {};
  const recent = Array.isArray(history.recentChanges) ? history.recentChanges.slice(0, 3) : [];
  const rows = recent.length
    ? recent.map((event) => miniRow({
        baseId: event.baseId,
        title: event.unitName || unitName(event.baseId),
        detail: eventLabels(event),
        value: formatTime(event.changedAt).split(",")[0],
        fallback: "+",
      })).join("")
    : '<div class="workspace-note">No persisted progression events are available yet.</div>';
  const summary = history.summary || {};
  return `<section class="ccv2-module">
    <div class="ccv2-module-head"><div><div class="kicker">PLAYER DEVELOPMENT</div><h3>Recent progression</h3><p>Recorded changes and Guild-relative evidence stay separate; there is no fabricated universal player score.</p></div><button type="button" class="ccv2-module-action" data-ccv2-launch="roster">Open Roster</button></div>
    <div class="ccv2-module-metrics">
      ${moduleMetric("Changes", history.available ? number(summary.events || 0) : "N/A")}
      ${moduleMetric("GP gained", history.available ? signed(summary.gpGained || 0) : "N/A")}
      ${moduleMetric("Guild GP", model.guildRanks?.available ? rankLabel(model.guildRanks.gp) : "N/A")}
    </div>
    <div class="ccv2-mini-list">${rows}</div>
  </section>`;
}

function rosterDetailHtml(model) {
  const r = model.roster;
  return `<div class="pro-summary-grid">
    ${stat("Galactic Power", number(model.player.galacticPower))}
    ${stat("Character GP", number(model.player.characterGp))}
    ${stat("Ship GP", number(model.player.shipGp))}
    ${stat("Owned Roster", number(r.ownedUnits), `${number(r.characters)} characters · ${number(r.ships)} ships`)}
    ${stat("Galactic Legends", number(r.galacticLegends))}
    ${stat("R7+ Characters", number(r.relic7Plus), `${number(r.relic9)} at R9`)}
    ${stat("Zetas", nullableNumber(r.zetas))}
    ${stat("Omicrons", nullableNumber(r.omicrons))}
    ${stat("Ultimates", nullableNumber(r.ultimates))}
    ${stat("Omega / Eta", nullableNumber(r.omegaEta), r.omegaEta == null ? "Unclassified until authoritative" : "Verified persisted upgrades")}
    ${stat("G13", number(r.gear13))}
    ${stat("7★ Ships", number(r.sevenStarShips))}
  </div>`;
}

function ranksDetailHtml(model) {
  const ranks = model.guildRanks;
  if (!ranks.available) return '<div class="workspace-note">Guild-relative ranks are unavailable until a canonical Guild baseline is linked.</div>';
  return `<div class="pro-summary-grid">
    ${stat("Guild GP Rank", rankLabel(ranks.gp))}
    ${stat("Character GP Rank", rankLabel(ranks.characterGp))}
    ${stat("Ship GP Rank", rankLabel(ranks.shipGp))}
    ${stat("GL Rank", rankLabel(ranks.galacticLegends))}
    ${stat("R7+ Rank", rankLabel(ranks.relic7))}
    ${stat("R9 Rank", rankLabel(ranks.relic9))}
    ${stat("Zeta Rank", rankLabel(ranks.zetas))}
    ${stat("Omicron Rank", rankLabel(ranks.omicrons))}
  </div>`;
}

function roteDetailHtml(model) {
  const rote = model.rote;
  if (!rote.requirementsAvailable) return '<div class="workspace-note">ROTE Operations requirements are unavailable. Current roster state remains valid.</div>';
  const rows = rote.priorityGaps.length ? rote.priorityGaps.map((row) => `
    <div class="guild-change ${row.owned ? "gp" : "left"}">
      <strong><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(row.baseId)}">${escapeHtml(row.name || row.baseId)}</button></strong>
      <span>${escapeHtml(gapLabel(row))}</span>
      <small>${number(row.requiredCount)} aggregated Operation slot${Number(row.requiredCount) === 1 ? "" : "s"} demand</small>
    </div>`).join("") : '<div class="workspace-note">Every aggregated ROTE requirement in the current dataset meets its highest recorded gate on this roster.</div>';
  return `<div class="pro-summary-grid">
      ${stat("ROTE Required Units", number(rote.uniqueRequiredUnits))}
      ${stat("Owned Required", number(rote.ownedRequiredUnits))}
      ${stat("Highest-Gate Ready", number(rote.highestGateReadyUnits))}
      ${stat("Upgrade Needed", number(rote.upgradeNeededUnits))}
      ${stat("Missing Required", number(rote.missingRequiredUnits))}
      ${stat("Supported Demand", `${number(rote.supportedOccurrences)} / ${number(rote.demandedOccurrences)}`, "Threshold occurrences; not assignments")}
    </div><div class="guild-change-list">${rows}</div>`;
}

function developmentDetailHtml(model) {
  const development = model.development;
  if (!development?.hasEvidence) return '<div class="workspace-note">No current development signals are available from ROTE gaps, Guild ranks or persisted progression history.</div>';
  const roteRows = (development.roteGaps || []).slice(0, 8).map((row) => `
    <div class="guild-change ${row.owned ? "gp" : "left"}"><strong><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(row.baseId)}">${escapeHtml(row.name || row.baseId)}</button></strong><span>${escapeHtml(gapLabel(row))}</span><small>${number(row.requiredCount)} aggregated ROTE slot demand</small></div>`).join("") || '<div class="workspace-note">No ROTE development gaps surfaced.</div>';
  const rankRows = (development.guildRankSignals || []).slice(0, 8).map((row) => `
    <div class="guild-change ${row.band === "lower-quartile" ? "left" : "gp"}"><strong>${escapeHtml(row.label)} · #${number(row.rank)} / ${number(row.total)}</strong><span>${row.band === "lower-quartile" ? "LOWER QUARTILE" : "LOWER HALF"}</span><small><button type="button" class="pro-unit-link" data-player-development-action="${escapeAttr(row.action)}">Open related roster view →</button></small></div>`).join("") || '<div class="workspace-note">No lower-half Guild-relative development signal.</div>';
  const momentumRows = (development.recentMomentum || []).slice(0, 8).map((row) => `
    <div class="guild-change gp"><strong><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(row.baseId)}">${escapeHtml(row.unitName || row.baseId)}</button></strong><span>${escapeHtml(row.evidence?.join(" · ") || "Recorded progression")}</span><small>${escapeHtml(formatTime(row.changedAt))}</small></div>`).join("") || '<div class="workspace-note">No recent persisted progression events.</div>';
  return `<div class="guild-page-two-col"><section class="guild-page-card"><div class="kicker">ROTE REQUIREMENTS</div><h4>Progression gaps</h4><div class="guild-change-list">${roteRows}</div></section><section class="guild-page-card"><div class="kicker">GUILD RELATIVE</div><h4>Development dimensions</h4><div class="guild-change-list">${rankRows}</div></section></div><section class="guild-page-card"><div class="kicker">RECENT MOMENTUM</div><h4>Recorded upgrades</h4><div class="guild-change-list">${momentumRows}</div></section>`;
}

function historyDetailHtml(model) {
  const history = model.history;
  if (!history.available) return '<div class="workspace-note">Persistent player history is not available yet.</div>';
  const summary = history.summary || {};
  const trend = history.trend || {};
  const rows = history.recentChanges.length ? history.recentChanges.map((event) => `
    <div class="guild-change gp"><strong>${escapeHtml(eventLabels(event))}</strong><span><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(event.baseId)}">${escapeHtml(event.unitName || event.baseId)}</button></span><small>${escapeHtml(formatTime(event.changedAt))}</small></div>`).join("") : '<div class="workspace-note">No progression events have been recorded since the persistence baseline.</div>';
  return `<div class="pro-summary-grid">
      ${stat("Recorded Changes", number(summary.events || 0))}
      ${stat("GP Gained", signed(summary.gpGained || 0))}
      ${stat("Relic Levels", signed(summary.relicLevelsGained || 0))}
      ${stat("Zetas Added", signed(summary.zetasAdded || 0))}
      ${stat("Omicrons Added", signed(summary.omicronsAdded || 0))}
      ${stat("Daily Trend", trend.comparable ? "ACTIVE" : "BASELINE", trend.comparable ? `${signed(trend.galacticPower)} GP · ${signed(trend.relic7Plus)} R7+ · ${signed(trend.omicrons)} Omicrons` : "Comparison begins after the next UTC snapshot")}
    </div><div class="guild-change-list">${rows}</div>`;
}

function render() {
  ensureV2Stylesheet();
  const panel = $("playerCommandDashboard");
  const overview = document.querySelector('[data-workspace-panel="overview"]');
  if (!panel) return;

  if (!state.model) {
    overview?.classList.remove("ccv2-player-ready");
    panel.innerHTML = `<div class="ccv2-dashboard"><div class="ccv2-commandbar"><div class="ccv2-identity"><div class="kicker">SWGOH COMMAND CENTER</div><h2>Player Command</h2><p>Load a 9-digit Ally Code above to activate the canonical dashboard. No demo or mock player data is displayed.</p></div></div>${launchRail()}</div>`;
    bindDashboardActions(panel);
    return;
  }

  const model = state.model;
  overview?.classList.add("ccv2-player-ready");
  panel.innerHTML = `<div class="ccv2-dashboard">
    <div class="ccv2-commandbar">
      <div class="ccv2-identity"><div class="kicker">CURRENT PLAYER · CANONICAL BASELINE</div><h2>${escapeHtml(model.player.name)}</h2><p>${escapeHtml(formatAlly(model.player.allyCode))} · ${escapeHtml(model.player.guildName || "No Guild baseline")} · ${escapeHtml(sourceLabel(model))}</p></div>
      <div class="ccv2-command-actions"><span class="status ${model.source.logicalRosterComplete ? "ready" : "warning"}">${model.source.logicalRosterComplete ? "ROSTER READY" : "ROSTER CHECK"}</span><button id="playerCommandRefresh" type="button">Refresh Persisted</button><button id="playerCommandLive" type="button">Refresh Live</button></div>
    </div>
    ${dashboardKpis(model)}
    ${launchRail()}
    <div class="ccv2-module-grid">${journeyModule()}${roteModule(model)}${progressionModule(model)}</div>
    <details class="ccv2-deep-dive"><summary>More Player Intelligence · Guild ranks · ROTE details · development · history</summary><div class="ccv2-deep-content">
      <section class="guild-page-card"><div class="kicker">ROSTER DETAIL</div>${rosterDetailHtml(model)}</section>
      <section class="guild-page-card"><div class="kicker">GUILD RELATIVE</div>${ranksDetailHtml(model)}</section>
      <section class="guild-page-card"><div class="kicker">ROTE REQUIREMENT COVERAGE</div>${roteDetailHtml(model)}</section>
      <section class="guild-page-card"><div class="kicker">DEVELOPMENT EVIDENCE</div>${developmentDetailHtml(model)}</section>
      <section class="guild-page-card"><div class="kicker">PERSISTENT HISTORY</div>${historyDetailHtml(model)}</section>
      <div class="guild-member-evidence"><strong>Metric boundary:</strong> GP rank, roster depth, ROTE requirement coverage and progression history remain separate evidence streams. Command Center does not collapse them into a fabricated universal player score.</div>
    </div></details>
  </div>`;

  $("playerCommandRefresh")?.addEventListener("click", () => load(true));
  $("playerCommandLive")?.addEventListener("click", refreshLiveDetail);
  for (const button of panel.querySelectorAll("[data-player-development-action]")) button.addEventListener("click", () => openRosterSlice(button.dataset.playerDevelopmentAction));
  bindDashboardActions(panel);
}

function bindDashboardActions(panel) {
  for (const button of panel.querySelectorAll("[data-ccv2-launch]")) {
    button.addEventListener("click", () => launch(button.dataset.ccv2Launch));
  }
}

function launch(id) {
  if (id === "actions") {
    window.location.assign("/actions");
    return;
  }
  if (id === "journey") {
    openJourneyGuide();
    return;
  }
  openWorkspace(id);
}

function openWorkspace(id) {
  document.querySelector(`button[data-workspace-tab="${CSS.escape(id)}"]`)?.click();
}

function openJourneyGuide() {
  openWorkspace("farm");
  let attempts = 0;
  const activate = () => {
    const button = document.querySelector('[data-farm-view="map"]');
    if (button) {
      button.click();
      return;
    }
    attempts += 1;
    if (attempts < 12) setTimeout(activate, 100);
  };
  setTimeout(activate, 80);
}

function refreshLiveDetail() {
  const form = $("allyForm");
  if (form?.requestSubmit) form.requestSubmit();
}

function openRosterSlice(action) {
  openWorkspace("roster");
  setTimeout(() => {
    const type = $("proRosterType");
    const relic = $("proRosterMinRelic");
    const upgrade = $("proRosterUpgrade");
    if (action === "characters" && type) type.value = "Character";
    else if (action === "ships" && type) type.value = "Ship";
    else if (action === "relic7" && relic) relic.value = "7";
    else if (action === "zeta" && upgrade) upgrade.value = "zeta";
    else if (action === "omicron" && upgrade) upgrade.value = "omicron";
    const changed = action === "characters" ? type : action === "ships" ? type : action === "relic7" ? relic : ["zeta", "omicron"].includes(action) ? upgrade : null;
    if (changed) changed.dispatchEvent(new Event("change", { bubbles: true }));
  }, 60);
}

async function fetchJson(url, { required = false } = {}) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (required) throw error;
    return null;
  }
}

async function load(force = false) {
  const allyCode = currentAllyCode();
  if (allyCode.length !== 9) {
    state.allyCode = "";
    state.model = null;
    state.fetchedAt = 0;
    render();
    return;
  }
  if (state.loading) return;
  if (!force && state.model && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) {
    render();
    return;
  }

  state.loading = true;
  const panel = $("playerCommandDashboard");
  if (panel) panel.innerHTML = '<div class="workspace-note">Assembling compact canonical Player Command intelligence…</div>';
  try {
    const refresh = force ? "refresh=1" : "";
    const suffix = refresh ? `?${refresh}` : "";
    const historyQuery = `events=100&snapshots=90${force ? "&refresh=1" : ""}`;
    const [playerBody, guildBody, historyBody, operations] = await Promise.all([
      fetchJson(`/api/player/${allyCode}/baseline${suffix}`, { required: true }),
      fetchJson(`/api/guild/by-player/${allyCode}/baseline${suffix}`),
      fetchJson(`/api/player/${allyCode}/history?${historyQuery}`),
      fetchJson("/api/rote/operations"),
    ]);
    const model = buildPlayerCommandDashboard({ playerBody, guildBody, historyBody, operations });
    if (!model) throw new Error("The canonical Player Command response was incomplete.");
    state.allyCode = allyCode;
    state.model = model;
    state.fetchedAt = Date.now();
    render();
  } catch (error) {
    state.model = null;
    document.querySelector('[data-workspace-panel="overview"]')?.classList.remove("ccv2-player-ready");
    if (panel) panel.innerHTML = `<div class="workspace-error">${escapeHtml(error?.message || "Player Command is unavailable.")}</div>`;
  } finally {
    state.loading = false;
  }
}

function build() {
  ensureV2Stylesheet();
  const overview = document.querySelector('[data-workspace-panel="overview"]');
  if (!overview || $("playerCommandDashboard")) return false;
  const section = document.createElement("section");
  section.id = "playerCommandDashboard";
  section.className = "card workspace-intro";
  overview.appendChild(section);
  render();

  $("allyForm")?.addEventListener("submit", () => {
    state.allyCode = "";
    state.model = null;
    state.fetchedAt = 0;
    setTimeout(() => load(false), 400);
  });
  document.querySelector('button[data-workspace-tab="overview"]')?.addEventListener("click", () => load(false));
  load(false);
  return true;
}

if (!build()) {
  const observer = new MutationObserver(() => {
    if (build()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
