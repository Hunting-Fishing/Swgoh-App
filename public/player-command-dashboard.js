import { buildPlayerCommandDashboard } from "./player-command-model.js";

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
const nullableNumber = (value) => value === null || value === undefined || value === "" ? "—" : number(value);
const signed = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric > 0 ? "+" : ""}${new Intl.NumberFormat().format(numeric)}`;
};

function currentAllyCode() {
  const input = digits($("allyCode")?.value);
  if (input.length === 9) return input;
  return digits(new URLSearchParams(location.search).get("allyCode"));
}

function formatTime(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function stat(label, value, detail = "") {
  return `<div class="pro-summary-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function rankLabel(row) {
  return row?.known ? `#${number(row.rank)} / ${number(row.total)}` : "—";
}

function sourceLabel(model) {
  if (!model) return "No player loaded";
  const complete = model.source.logicalRosterComplete ? "FULL ROSTER" : "ROSTER CHECK REQUIRED";
  return `${complete} · ${formatTime(model.source.syncedAt)}`;
}

function rosterHtml(model) {
  const r = model.roster;
  return `
    <div class="pro-summary-grid">
      ${stat("Galactic Power", number(model.player.galacticPower))}
      ${stat("Character GP", number(model.player.characterGp))}
      ${stat("Ship GP", number(model.player.shipGp))}
      ${stat("Owned Roster", number(r.ownedUnits), `${number(r.characters)} characters · ${number(r.ships)} ships`)}
      ${stat("Galactic Legends", number(r.galacticLegends))}
      ${stat("R7+ Characters", number(r.relic7Plus), `${number(r.relic9)} at R9`)}
      ${stat("Zetas", nullableNumber(r.zetas))}
      ${stat("Omicrons", nullableNumber(r.omicrons))}
      ${stat("Ultimates", nullableNumber(r.ultimates))}
      ${stat("Omega / Eta", nullableNumber(r.omegaEta), r.omegaEta == null ? "Unclassified until ability evidence is authoritative" : "Verified persisted upgrades")}
      ${stat("G13", number(r.gear13))}
      ${stat("7★ Ships", number(r.sevenStarShips))}
    </div>`;
}

function ranksHtml(model) {
  const ranks = model.guildRanks;
  if (!ranks.available) return '<div class="workspace-note">Guild-relative ranks are unavailable until a canonical Guild baseline is linked to this player.</div>';
  return `
    <div class="guild-page-stat-grid">
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

function gapLabel(row) {
  if (!row.owned) return row.unitType === "Ship" ? `Missing · target ${number(row.target)}★` : `Missing · target R${number(row.target)}`;
  return row.unitType === "Ship"
    ? `${number(row.current)}★ → ${number(row.target)}★`
    : `R${number(row.current)} → R${number(row.target)}`;
}

function roteHtml(model) {
  const rote = model.rote;
  if (!rote.requirementsAvailable) return '<div class="workspace-note">ROTE Operations requirements are unavailable. Current roster state remains valid.</div>';
  const rows = rote.priorityGaps.length ? rote.priorityGaps.map((row) => `
    <div class="guild-change ${row.owned ? "gp" : "left"}">
      <strong><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(row.baseId)}">${escapeHtml(row.name || row.baseId)}</button></strong>
      <span>${escapeHtml(gapLabel(row))}</span>
      <small>${number(row.requiredCount)} aggregated Operation slot${Number(row.requiredCount) === 1 ? "" : "s"} demand</small>
    </div>`).join("") : '<div class="guild-member-clean">Every aggregated ROTE requirement in the current dataset meets its highest recorded gate on this roster.</div>';
  return `
    <div class="pro-summary-grid">
      ${stat("ROTE Required Units", number(rote.uniqueRequiredUnits))}
      ${stat("Owned Required", number(rote.ownedRequiredUnits))}
      ${stat("Highest-Gate Ready", number(rote.highestGateReadyUnits))}
      ${stat("Upgrade Needed", number(rote.upgradeNeededUnits))}
      ${stat("Missing Required", number(rote.missingRequiredUnits))}
      ${stat("Supported Demand", `${number(rote.supportedOccurrences)} / ${number(rote.demandedOccurrences)}`, "Aggregated threshold occurrences; not assignments")}
    </div>
    <div class="section-heading"><div><div class="kicker">DEVELOPMENT PRESSURE</div><h3>Highest-demand ROTE gaps</h3><p class="workspace-note">Ordered by aggregated demand, then progression gap. This is not a fabricated universal player score.</p></div></div>
    <div class="guild-change-list">${rows}</div>`;
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

function historyHtml(model) {
  const history = model.history;
  if (!history.available) return '<div class="workspace-note">Persistent player history is not available yet. Current roster and Guild-rank data remain usable.</div>';
  const summary = history.summary || {};
  const trend = history.trend || {};
  const trendDetail = trend.comparable
    ? `${signed(trend.galacticPower)} GP · ${signed(trend.relic7Plus)} R7+ · ${signed(trend.omicrons)} Omicrons`
    : "Daily comparison starts after the next UTC snapshot";
  const rows = history.recentChanges.length ? history.recentChanges.map((event) => `
    <div class="guild-change gp">
      <strong>${escapeHtml(eventLabels(event))}</strong>
      <span><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(event.baseId)}">${escapeHtml(event.unitName || event.baseId)}</button></span>
      <small>${escapeHtml(formatTime(event.changedAt))}</small>
    </div>`).join("") : '<div class="workspace-note">No player progression events have been recorded since the persistence baseline.</div>';
  return `
    <div class="pro-summary-grid">
      ${stat("Recorded Changes", number(summary.events || 0))}
      ${stat("GP Gained", signed(summary.gpGained || 0))}
      ${stat("Relic Levels", signed(summary.relicLevelsGained || 0))}
      ${stat("Zetas Added", signed(summary.zetasAdded || 0))}
      ${stat("Omicrons Added", signed(summary.omicronsAdded || 0))}
      ${stat("Daily Trend", trend.comparable ? "ACTIVE" : "BASELINE", trendDetail)}
    </div>
    <div class="guild-change-list">${rows}</div>`;
}

function developmentRankDetail(row = {}) {
  const band = row.band === "lower-quartile" ? "Lower quartile" : "Lower half";
  return `${rankLabel(row)} · ${band}`;
}

function developmentHtml(model) {
  const development = model.development || {};
  const roteGaps = Array.isArray(development.roteGaps) ? development.roteGaps : [];
  const rankSignals = Array.isArray(development.guildRankSignals) ? development.guildRankSignals : [];
  const momentum = Array.isArray(development.recentMomentum) ? development.recentMomentum : [];
  if (!development.hasEvidence) {
    return '<div class="workspace-note">No evidence-backed development signals are available yet. Refresh the persisted baseline after more roster history is captured.</div>';
  }

  const roteRows = roteGaps.length ? roteGaps.slice(0, 5).map((row) => `
    <div class="guild-change ${row.owned ? "gp" : "left"}">
      <strong><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(row.baseId)}">${escapeHtml(row.name || row.baseId)}</button></strong>
      <span>${escapeHtml(gapLabel(row))}</span>
      <small>ROTE evidence · ${number(row.requiredCount)} Operation slot${Number(row.requiredCount) === 1 ? "" : "s"} demand</small>
    </div>`).join("") : '<div class="workspace-note">No current ROTE requirement gaps.</div>';

  const rankRows = rankSignals.length ? rankSignals.slice(0, 5).map((row) => `
    <div class="guild-change warning">
      <strong>${escapeHtml(row.label)}</strong>
      <span>${escapeHtml(developmentRankDetail(row))}</span>
      <small>Guild-relative evidence · current value ${nullableNumber(row.value)} · not a universal score</small>
    </div>`).join("") : '<div class="workspace-note">No lower-half Guild-relative development signals.</div>';

  const momentumRows = momentum.length ? momentum.slice(0, 5).map((row) => `
    <div class="guild-change gp">
      <strong>${escapeHtml((row.evidence || []).join(" · ") || "Progression")}</strong>
      <span>${row.baseId ? `<button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(row.baseId)}">${escapeHtml(row.unitName || row.baseId)}</button>` : escapeHtml(row.unitName || "Roster")}</span>
      <small>Verified progression evidence · ${escapeHtml(formatTime(row.changedAt))}</small>
    </div>`).join("") : '<div class="workspace-note">No recent verified progression events in the current history window.</div>';

  return `
    <div class="pro-summary-grid">
      ${stat("ROTE Priorities", number(roteGaps.length), "Direct requirement gaps")}
      ${stat("Guild Rank Signals", number(rankSignals.length), "Lower-half evidence only")}
      ${stat("Recent Momentum", number(momentum.length), "Verified progression events")}
    </div>
    <div class="guild-page-two-col">
      <div>
        <div class="kicker">MISSION VALUE</div>
        <h3>ROTE next upgrades</h3>
        <p class="workspace-note">Direct progression gaps tied to current Operation demand.</p>
        <div class="guild-change-list">${roteRows}</div>
      </div>
      <div>
        <div class="kicker">ROSTER BALANCE</div>
        <h3>Guild-relative pressure</h3>
        <p class="workspace-note">Only known lower-half dimensions are shown. These are comparison signals, not prescriptions.</p>
        <div class="guild-change-list">${rankRows}</div>
      </div>
    </div>
    <div class="section-heading"><div><div class="kicker">MOMENTUM</div><h3>What you are already advancing</h3><p class="workspace-note">Recent verified progression stays separate from future priorities so activity is not mistaken for strategic value.</p></div></div>
    <div class="guild-change-list">${momentumRows}</div>`;
}

function render() {
  const panel = $("playerCommandDashboard");
  if (!panel) return;
  if (!state.model) {
    panel.innerHTML = `
      <div class="kicker">PLAYER COMMAND</div>
      <h2>Player Command Center</h2>
      <div class="workspace-note">Load a 9-digit Ally Code to activate the persisted Player Command dashboard.</div>`;
    return;
  }
  const model = state.model;
  panel.innerHTML = `
    <div class="database-heading">
      <div>
        <div class="kicker">PLAYER COMMAND · CANONICAL BASELINE</div>
        <h2>${escapeHtml(model.player.name)}</h2>
        <p>${escapeHtml(model.player.guildName || "No Guild baseline")} · Ally Code ${escapeHtml(model.player.allyCode)} · Level ${number(model.player.level)}</p>
      </div>
      <div>
        <div class="status ${model.source.logicalRosterComplete ? "ready" : "warning"}">${escapeHtml(sourceLabel(model))}</div>
        <div class="pro-preset-row">
          <button id="playerCommandOpenRoster" type="button">Open Full Roster</button>
          <button id="playerCommandOpenRote" type="button">ROTE Required Units</button>
          <button id="playerCommandRefresh" type="button">Refresh Persisted</button>
          <button id="playerCommandLive" type="button">Refresh Live Detail</button>
        </div>
      </div>
    </div>
    ${rosterHtml(model)}
    <section class="guild-page-card"><div class="kicker">DEVELOPMENT COMMAND</div><h3>Evidence-backed next moves</h3><p class="workspace-note">Three independent signals: mission value, Guild-relative roster pressure, and verified recent momentum.</p>${developmentHtml(model)}</section>
    <div class="guild-page-two-col">
      <section class="guild-page-card"><div class="kicker">GUILD RELATIVE</div><h3>Rank inside current 50-member baseline</h3>${ranksHtml(model)}</section>
      <section class="guild-page-card"><div class="kicker">ROTE PRESSURE</div><h3>Operations requirement coverage</h3>${roteHtml(model)}</section>
    </div>
    <section class="guild-page-card"><div class="kicker">WHAT CHANGED</div><h3>Persistent progression intelligence</h3>${historyHtml(model)}</section>
    <div class="guild-member-evidence"><strong>Metric boundary:</strong> GP rank, roster depth, ROTE requirement coverage and progression history remain separate evidence streams. The Command Center does not collapse them into a fabricated universal player score.</div>`;

  $("playerCommandRefresh")?.addEventListener("click", () => load(true));
  $("playerCommandLive")?.addEventListener("click", refreshLiveDetail);
  $("playerCommandOpenRoster")?.addEventListener("click", () => openRoster(false));
  $("playerCommandOpenRote")?.addEventListener("click", () => openRoster(true));
}

function refreshLiveDetail() {
  const form = $("allyForm");
  if (form?.requestSubmit) form.requestSubmit();
}

function openRoster(roteOnly) {
  const tab = document.querySelector('button[data-workspace-tab="roster"]');
  if (tab) tab.click();
  setTimeout(() => {
    if (!roteOnly) return;
    const select = $("proRosterRote");
    if (!select) return;
    select.value = "required";
    select.dispatchEvent(new Event("change", { bubbles: true }));
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
  if (panel) panel.innerHTML = '<div class="workspace-note">Assembling canonical Player Command intelligence…</div>';
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
    if (panel) panel.innerHTML = `<div class="workspace-error">${escapeHtml(error?.message || "Player Command is unavailable.")}</div>`;
  } finally {
    state.loading = false;
  }
}

function build() {
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