import {
  isCanonicalRosterBody,
  isLiveRosterBody,
  nullableMetric,
  rosterEndpoint,
  rosterNeedsLiveDetail,
  rosterSourceStatus,
} from "./roster-source-policy.js";

const CACHE_MS = 25_000;
const VIEW_KEY = "swgoh:pro-roster-views:v1";

const state = {
  body: null,
  allyCode: "",
  fetchedAt: 0,
  rote: null,
  requirementMap: new Map(),
  initialized: false,
  loadPromise: null,
};

const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

function ownedUnits(body) {
  return [...(body?.units || []), ...(body?.ships || [])];
}

function currentAllyCode() {
  return digits($("allyCode")?.value);
}

function acceptRosterBody(body) {
  return Boolean(body?.player && Array.isArray(body?.units) && Array.isArray(body?.ships));
}

function rememberRoster(allyCode, body) {
  state.body = body;
  state.allyCode = allyCode;
  state.fetchedAt = Date.now();
  if (isLiveRosterBody(body)) {
    window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.fetchedAt };
  }
  return body;
}

async function fetchRoster(allyCode, forceLive = false) {
  const response = await fetch(rosterEndpoint(allyCode, { forceLive }), { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    const source = forceLive ? "Live" : "Persisted";
    const error = new Error(body?.error || `${source} roster returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!acceptRosterBody(body)) throw new Error("Roster source returned an invalid full-roster response.");
  return body;
}

async function loadRoster(forceLive = false) {
  const allyCode = currentAllyCode();
  if (allyCode.length !== 9) return null;

  const shared = window.__swgohLiveSnapshot;
  if (!forceLive && shared?.allyCode === allyCode && acceptRosterBody(shared?.body) && Date.now() - Number(shared.fetchedAt || 0) < CACHE_MS) {
    state.body = shared.body;
    state.allyCode = allyCode;
    state.fetchedAt = Number(shared.fetchedAt || Date.now());
    return shared.body;
  }
  if (!forceLive && state.body && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) return state.body;
  if (state.loadPromise) return state.loadPromise;

  state.loadPromise = (async () => {
    if (forceLive) return rememberRoster(allyCode, await fetchRoster(allyCode, true));
    try {
      return rememberRoster(allyCode, await fetchRoster(allyCode, false));
    } catch (error) {
      if (![404, 503].includes(Number(error?.status))) throw error;
      return rememberRoster(allyCode, await fetchRoster(allyCode, true));
    }
  })();

  try {
    return await state.loadPromise;
  } finally {
    state.loadPromise = null;
  }
}

async function loadRote(force = false) {
  if (!force && state.rote) return state.rote;
  try {
    const response = await fetch("/api/rote/operations", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `ROTE operations returned HTTP ${response.status}`);
    state.rote = body;
    state.requirementMap = new Map((body.requirements || []).map((entry) => [String(entry.baseId), entry]));
  } catch {
    state.rote = { requirements: [], totalSlots: 0 };
    state.requirementMap = new Map();
  }
  return state.rote;
}

function readyOccurrences(requirement, unit) {
  if (!requirement || !unit) return 0;
  if (requirement.unitType === "Ship") {
    const stars = Number(unit.stars || 0);
    return Object.entries(requirement.rarityCounts || {}).reduce((sum, [required, count]) => sum + (stars >= Number(required) ? Number(count) : 0), 0);
  }
  const relic = Number(unit.relic || 0);
  return Object.entries(requirement.relicCounts || {}).reduce((sum, [required, count]) => sum + (relic >= Number(required) ? Number(count) : 0), 0);
}

function roteInfo(unit) {
  const requirement = state.requirementMap.get(String(unit.baseId));
  if (!requirement) return { requirement: null, ready: 0, total: 0, status: "not-required" };
  const ready = readyOccurrences(requirement, unit);
  const total = Number(requirement.requiredCount || 0);
  return { requirement, ready, total, status: ready >= total ? "ready" : ready > 0 ? "partial" : "blocked" };
}

function filters() {
  return {
    query: $("proRosterSearch")?.value.trim().toLowerCase() || "",
    type: $("proRosterType")?.value || "All",
    faction: $("proRosterFaction")?.value || "All",
    role: $("proRosterRole")?.value || "All",
    alignment: $("proRosterAlignment")?.value || "All",
    minStars: Number($("proRosterMinStars")?.value || 0),
    minGear: Number($("proRosterMinGear")?.value || 0),
    minRelic: Number($("proRosterMinRelic")?.value || 0),
    minGp: Number($("proRosterMinGp")?.value || 0),
    minSpeed: Number($("proRosterMinSpeed")?.value || 0),
    mods: $("proRosterMods")?.value || "Any",
    upgrade: $("proRosterUpgrade")?.value || "Any",
    rote: $("proRosterRote")?.value || "All",
    readiness: $("proRosterReadiness")?.value || "All",
    sort: $("proRosterSort")?.value || "power",
    direction: $("proRosterDirection")?.value || "desc",
  };
}

function unitSearchText(unit) {
  return [unit.name, unit.baseId, unit.unitType, unit.role, unit.alignment, ...(unit.factions || []), ...(unit.tags || [])].join(" ").toLowerCase();
}

function matches(unit, f) {
  if (f.type !== "All" && unit.unitType !== f.type) return false;
  if (f.faction !== "All" && !(unit.factions || []).includes(f.faction)) return false;
  if (f.role !== "All" && String(unit.role || "") !== f.role) return false;
  if (f.alignment !== "All" && unit.alignment !== f.alignment) return false;
  if (f.query && !unitSearchText(unit).includes(f.query)) return false;
  if (Number(unit.stars || 0) < f.minStars) return false;
  if (f.minGear > 0 && unit.unitType !== "Ship" && Number(unit.gear || 0) < f.minGear) return false;
  if (f.minRelic > 0 && (unit.unitType === "Ship" || Number(unit.relic || 0) < f.minRelic)) return false;
  if (Number(unit.power || 0) < f.minGp) return false;
  if (Number(unit.speed || 0) < f.minSpeed) return false;

  const equippedMods = nullableMetric(unit.equippedMods, null);
  if (f.mods !== "Any" && equippedMods === null) return false;
  if (f.mods === "full" && equippedMods < 6) return false;
  if (f.mods === "open" && equippedMods >= 6) return false;

  if (f.upgrade === "zeta" && Number(unit.zetas || 0) < 1) return false;
  if (f.upgrade === "omicron" && Number(unit.omicrons || 0) < 1) return false;
  const omegaCount = nullableMetric(unit.omegas, null);
  if (f.upgrade === "omega" && (omegaCount === null || omegaCount < 1)) return false;

  const readiness = nullableMetric(unit.readiness, null);
  if (f.readiness !== "All" && readiness === null) return false;
  if (f.readiness === "90" && readiness < 90) return false;
  if (f.readiness === "75" && readiness < 75) return false;
  if (f.readiness === "under75" && readiness >= 75) return false;

  const rote = roteInfo(unit);
  if (f.rote === "required" && !rote.requirement) return false;
  if (f.rote === "ready" && rote.status !== "ready") return false;
  if (f.rote === "partial" && rote.status !== "partial") return false;
  if (f.rote === "blocked" && rote.status !== "blocked") return false;
  return true;
}

function sortValue(unit, key) {
  if (key === "name") return String(unit.name || "").toLowerCase();
  if (key === "relic") return Number(unit.relic || 0);
  if (key === "speed") return Number(unit.speed || 0);
  if (key === "readiness") return nullableMetric(unit.readiness, -1);
  if (key === "rote") return Number(roteInfo(unit).requirement?.requiredCount || 0);
  if (key === "omicrons") return Number(unit.omicrons || 0);
  return Number(unit.power || 0);
}

function sortedFilteredUnits() {
  const f = filters();
  const direction = f.direction === "asc" ? 1 : -1;
  return ownedUnits(state.body).filter((unit) => matches(unit, f)).sort((a, b) => {
    const av = sortValue(a, f.sort);
    const bv = sortValue(b, f.sort);
    if (typeof av === "string") return direction * av.localeCompare(bv);
    return direction * (av - bv) || String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function progressionLabel(unit) {
  if (unit.unitType === "Ship") return `${Number(unit.stars || 0)}★`;
  return Number(unit.relic || 0) > 0 ? `G${Number(unit.gear || 13)} · R${Number(unit.relic)}` : `G${Number(unit.gear || 0)}`;
}

function roteLabel(unit) {
  const info = roteInfo(unit);
  if (!info.requirement) return "—";
  const target = info.requirement.unitType === "Ship" ? `${info.requirement.maxRarity}★` : `R${info.requirement.maxRelic}`;
  return `${info.ready}/${info.total} · ${target}`;
}

function summary(units) {
  const gp = units.reduce((sum, unit) => sum + Number(unit.power || 0), 0);
  const speedRows = units.map((unit) => nullableMetric(unit.speed, null)).filter((value) => value !== null);
  const avgSpeed = speedRows.length ? Math.round(speedRows.reduce((sum, value) => sum + value, 0) / speedRows.length) : null;
  const r5 = units.filter((unit) => unit.unitType !== "Ship" && Number(unit.relic || 0) >= 5).length;
  const r7 = units.filter((unit) => unit.unitType !== "Ship" && Number(unit.relic || 0) >= 7).length;
  const r9 = units.filter((unit) => unit.unitType !== "Ship" && Number(unit.relic || 0) >= 9).length;
  const roteRequired = units.filter((unit) => roteInfo(unit).requirement).length;
  return `
    <div class="pro-summary-stat"><span>Matching</span><strong>${number(units.length)}</strong></div>
    <div class="pro-summary-stat"><span>Combined GP</span><strong>${number(gp)}</strong></div>
    <div class="pro-summary-stat"><span>Avg Speed</span><strong>${avgSpeed === null ? "—" : number(avgSpeed)}</strong></div>
    <div class="pro-summary-stat"><span>R5+</span><strong>${number(r5)}</strong></div>
    <div class="pro-summary-stat"><span>R7+</span><strong>${number(r7)}</strong></div>
    <div class="pro-summary-stat"><span>R9</span><strong>${number(r9)}</strong></div>
    <div class="pro-summary-stat"><span>ROTE Demanded</span><strong>${number(roteRequired)}</strong></div>
  `;
}

function tableRows(units) {
  return units.map((unit) => {
    const factions = (unit.factions || []).slice(0, 3).join(" · ");
    const info = roteInfo(unit);
    const equippedMods = nullableMetric(unit.equippedMods, null);
    const omegaCount = nullableMetric(unit.omegas, null);
    const readiness = nullableMetric(unit.readiness, null);
    const modLabel = unit.unitType === "Ship" ? "—" : equippedMods === null ? "—" : `${number(equippedMods)}/6`;
    const abilityLabel = `Z${number(unit.zetas)} · Ω${omegaCount === null ? "—" : number(omegaCount)} · O${number(unit.omicrons)}`;
    const readinessLabel = readiness === null ? "—" : `${number(readiness)}%`;
    return `
      <tr data-unit-row="${escapeAttr(unit.baseId)}">
        <td class="pro-unit-cell"><button type="button" class="pro-unit-link" data-inspect-base-id="${escapeAttr(unit.baseId)}">${escapeHtml(unit.name || unit.baseId)}</button><small>${escapeHtml(factions || unit.role || "")}</small></td>
        <td>${escapeHtml(unit.unitType || "")}</td>
        <td>${number(unit.power)}</td>
        <td>${Number(unit.stars || 0)}★</td>
        <td>${escapeHtml(progressionLabel(unit))}</td>
        <td>${number(unit.speed)}</td>
        <td>${escapeHtml(modLabel)}</td>
        <td>${escapeHtml(abilityLabel)}</td>
        <td><span class="pro-rote-status ${escapeAttr(info.status)}">${escapeHtml(roteLabel(unit))}</span></td>
        <td>${escapeHtml(readinessLabel)}</td>
        <td class="pro-actions"><button type="button" data-add-squad="${escapeAttr(unit.baseId)}">Squad +</button><button type="button" data-inspect-base-id="${escapeAttr(unit.baseId)}">Inspect</button></td>
      </tr>
    `;
  }).join("");
}

function render() {
  const output = $("proRosterResults");
  const summaryEl = $("proRosterSummary");
  const countEl = $("proRosterCount");
  if (!output || !summaryEl || !countEl) return;
  if (!state.body) {
    output.innerHTML = '<div class="workspace-note">Load an Ally Code to activate advanced roster command.</div>';
    summaryEl.innerHTML = "";
    countEl.textContent = "No roster loaded";
    return;
  }
  const units = sortedFilteredUnits();
  const allOwned = ownedUnits(state.body);
  summaryEl.innerHTML = summary(units);
  countEl.textContent = `${number(units.length)} matching / ${number(allOwned.length)} owned`;
  output.innerHTML = units.length ? `
    <div class="pro-table-wrap">
      <table class="workspace-table pro-roster-table">
        <thead><tr><th>Unit</th><th>Type</th><th>GP</th><th>Stars</th><th>Gear / Relic</th><th>Speed</th><th>Mods</th><th>Abilities</th><th>ROTE Ops</th><th>Ready</th><th></th></tr></thead>
        <tbody>${tableRows(units)}</tbody>
      </table>
    </div>
  ` : '<div class="workspace-note">No owned units match the active filters.</div>';
  wireResultActions(output);
}

function wireResultActions(container) {
  for (const button of container.querySelectorAll("button[data-add-squad]")) {
    button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("swgoh:add-to-squad", { detail: { baseId: button.dataset.addSquad } }));
      const squadTab = document.querySelector('button[data-workspace-tab="squads"]');
      if (squadTab) squadTab.click();
    });
  }
}

function dynamicOptions(body) {
  const units = ownedUnits(body);
  const factions = [...new Set(units.flatMap((unit) => unit.factions || []).filter(Boolean))].sort();
  const roles = [...new Set(units.map((unit) => unit.role).filter(Boolean))].sort();
  replaceOptions($("proRosterFaction"), factions, "All factions");
  replaceOptions($("proRosterRole"), roles, "All roles");
}

function replaceOptions(select, values, allLabel) {
  if (!select) return;
  const selected = select.value || "All";
  select.innerHTML = `<option value="All">${escapeHtml(allLabel)}</option>${values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = values.includes(selected) ? selected : "All";
}

function allFilterControls() {
  return [
    "proRosterSearch", "proRosterType", "proRosterFaction", "proRosterRole", "proRosterAlignment",
    "proRosterMinStars", "proRosterMinGear", "proRosterMinRelic", "proRosterMinGp", "proRosterMinSpeed",
    "proRosterMods", "proRosterUpgrade", "proRosterRote", "proRosterReadiness", "proRosterSort", "proRosterDirection",
  ].map($).filter(Boolean);
}

function resetFilters() {
  const defaults = {
    proRosterSearch: "", proRosterType: "All", proRosterFaction: "All", proRosterRole: "All", proRosterAlignment: "All",
    proRosterMinStars: "0", proRosterMinGear: "0", proRosterMinRelic: "0", proRosterMinGp: "0", proRosterMinSpeed: "0",
    proRosterMods: "Any", proRosterUpgrade: "Any", proRosterRote: "All", proRosterReadiness: "All", proRosterSort: "power", proRosterDirection: "desc",
  };
  for (const [id, value] of Object.entries(defaults)) if ($(id)) $(id).value = value;
  render();
}

function applyPreset(name) {
  resetFilters();
  if (name === "rote") { $("proRosterRote").value = "required"; $("proRosterSort").value = "rote"; }
  if (name === "r7") $("proRosterMinRelic").value = "7";
  if (name === "mods") $("proRosterMods").value = "open";
  if (name === "omicron") $("proRosterUpgrade").value = "omicron";
  if (name === "fast") $("proRosterSort").value = "speed";
  if (name === "ships") $("proRosterType").value = "Ship";
  if (state.body && !isLiveRosterBody(state.body) && rosterNeedsLiveDetail(filters())) void refresh(true);
  else render();
}

function readViews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeViews(views) {
  localStorage.setItem(VIEW_KEY, JSON.stringify(views));
}

function refreshSavedViews() {
  const select = $("proSavedViews");
  if (!select) return;
  const views = readViews();
  select.innerHTML = '<option value="">Saved views</option>' + Object.keys(views).sort().map((name) => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join("");
}

function saveCurrentView() {
  const input = $("proViewName");
  const name = String(input?.value || "").trim();
  if (!name) return;
  const views = readViews();
  views[name] = filters();
  writeViews(views);
  input.value = "";
  refreshSavedViews();
}

function applyFilterView(view) {
  const mapping = {
    query: "proRosterSearch", type: "proRosterType", faction: "proRosterFaction", role: "proRosterRole", alignment: "proRosterAlignment",
    minStars: "proRosterMinStars", minGear: "proRosterMinGear", minRelic: "proRosterMinRelic", minGp: "proRosterMinGp", minSpeed: "proRosterMinSpeed",
    mods: "proRosterMods", upgrade: "proRosterUpgrade", rote: "proRosterRote", readiness: "proRosterReadiness", sort: "proRosterSort", direction: "proRosterDirection",
  };
  for (const [key, id] of Object.entries(mapping)) if ($(id) && view[key] !== undefined) $(id).value = String(view[key]);
  if (state.body && !isLiveRosterBody(state.body) && rosterNeedsLiveDetail(filters())) void refresh(true);
  else render();
}

function loadSavedView() {
  const name = $("proSavedViews")?.value;
  const view = readViews()[name];
  if (!view) return;
  applyFilterView(view);
}

function deleteSavedView() {
  const name = $("proSavedViews")?.value;
  if (!name) return;
  const views = readViews();
  delete views[name];
  writeViews(views);
  refreshSavedViews();
}

async function refresh(forceLive = false) {
  const status = $("proRosterStatus");
  if (state.loadPromise) return state.loadPromise;
  try {
    if (status) status.textContent = forceLive ? "Loading live roster detail…" : "Loading full persisted roster…";
    await Promise.all([loadRote(false), loadRoster(forceLive)]);
    if (!state.body) {
      if (status) status.textContent = "Load an Ally Code to activate advanced roster command.";
      render();
      return;
    }
    dynamicOptions(state.body);
    if (status) status.textContent = rosterSourceStatus(state.body, ownedUnits(state.body).length);
    render();
  } catch (error) {
    if (status) status.textContent = error?.message || "Advanced roster data is unavailable.";
  }
}

function handleFilterChange() {
  if (state.body && !isLiveRosterBody(state.body) && rosterNeedsLiveDetail(filters())) {
    void refresh(true);
    return;
  }
  render();
}

function build() {
  const panel = document.querySelector('[data-workspace-panel="roster"]');
  if (!panel || $("proRosterCommander")) return false;
  const section = document.createElement("section");
  section.id = "proRosterCommander";
  section.className = "pro-command-shell";
  section.innerHTML = `
    <section class="card workspace-intro pro-command-header">
      <div><div class="kicker">POWER USER ROSTER COMMAND</div><h2>Roster Commander</h2><p>Filter the complete owned roster by progression, ability investment, role, faction and ROTE Operations demand. The persisted full roster loads first; live refresh enriches mods, readiness and other live-only fields without truncating the roster.</p></div>
      <div><div id="proRosterStatus" class="status">Load an Ally Code</div><button id="proRosterLiveRefresh" type="button">Refresh Live Detail</button></div>
    </section>
    <section class="card pro-filter-card">
      <div class="pro-preset-row">
        <button type="button" data-pro-preset="rote">ROTE Demand</button><button type="button" data-pro-preset="r7">R7+</button><button type="button" data-pro-preset="mods">Open Mod Slots</button><button type="button" data-pro-preset="omicron">Omicrons</button><button type="button" data-pro-preset="fast">Fastest</button><button type="button" data-pro-preset="ships">Ships</button>
      </div>
      <div class="pro-filter-grid">
        <label>Search<input id="proRosterSearch" placeholder="Unit, faction, role, Base ID…"></label>
        <label>Type<select id="proRosterType"><option>All</option><option>Character</option><option>Ship</option></select></label>
        <label>Faction<select id="proRosterFaction"><option value="All">All factions</option></select></label>
        <label>Role<select id="proRosterRole"><option value="All">All roles</option></select></label>
        <label>Alignment<select id="proRosterAlignment"><option>All</option><option>Light</option><option>Dark</option><option>Neutral</option><option>Unknown</option></select></label>
        <label>Min Stars<input id="proRosterMinStars" type="number" min="0" max="7" value="0"></label>
        <label>Min Gear<input id="proRosterMinGear" type="number" min="0" max="13" value="0"></label>
        <label>Min Relic<input id="proRosterMinRelic" type="number" min="0" max="15" value="0"></label>
        <label>Min GP<input id="proRosterMinGp" type="number" min="0" step="1000" value="0"></label>
        <label>Min Speed<input id="proRosterMinSpeed" type="number" min="0" value="0"></label>
        <label>Mods<select id="proRosterMods"><option value="Any">Any</option><option value="full">6 / 6 equipped</option><option value="open">Open slots · live</option></select></label>
        <label>Ability Investment<select id="proRosterUpgrade"><option value="Any">Any</option><option value="zeta">Has Zeta</option><option value="omicron">Has Omicron</option><option value="omega">Has Omega / Eta · live</option></select></label>
        <label>ROTE Operations<select id="proRosterRote"><option value="All">All</option><option value="required">Required anywhere</option><option value="ready">Fully ready</option><option value="partial">Partially ready</option><option value="blocked">Required / blocked</option></select></label>
        <label>Development<select id="proRosterReadiness"><option value="All">Any readiness</option><option value="90">90%+ · live</option><option value="75">75%+ · live</option><option value="under75">Under 75% · live</option></select></label>
        <label>Sort<select id="proRosterSort"><option value="power">GP</option><option value="speed">Speed</option><option value="relic">Relic</option><option value="readiness">Readiness · live</option><option value="rote">ROTE demand</option><option value="omicrons">Omicrons</option><option value="name">Name</option></select></label>
        <label>Direction<select id="proRosterDirection"><option value="desc">High → Low</option><option value="asc">Low → High</option></select></label>
      </div>
      <div class="pro-view-row"><input id="proViewName" placeholder="Saved view name"><button id="proSaveView" type="button">Save View</button><select id="proSavedViews"><option value="">Saved views</option></select><button id="proLoadView" type="button">Load</button><button id="proDeleteView" type="button">Delete</button><button id="proResetFilters" type="button">Reset Filters</button><span id="proRosterCount"></span></div>
    </section>
    <section id="proRosterSummary" class="pro-summary-grid"></section>
    <section id="proRosterResults" class="card workspace-intro"><div class="workspace-note">Load an Ally Code to activate advanced roster command.</div></section>
  `;
  panel.prepend(section);
  $("controls")?.classList.add("pro-legacy-roster");
  $("roster")?.classList.add("pro-legacy-roster");

  for (const control of allFilterControls()) control.addEventListener(control.tagName === "INPUT" ? "input" : "change", handleFilterChange);
  for (const button of section.querySelectorAll("button[data-pro-preset]")) button.addEventListener("click", () => applyPreset(button.dataset.proPreset));
  $("proResetFilters")?.addEventListener("click", resetFilters);
  $("proSaveView")?.addEventListener("click", saveCurrentView);
  $("proLoadView")?.addEventListener("click", loadSavedView);
  $("proDeleteView")?.addEventListener("click", deleteSavedView);
  $("proRosterLiveRefresh")?.addEventListener("click", () => refresh(true));
  refreshSavedViews();

  $("allyForm")?.addEventListener("submit", () => {
    state.body = null;
    state.allyCode = "";
    state.fetchedAt = 0;
    setTimeout(() => refresh(false), 400);
  });
  document.querySelector('button[data-workspace-tab="roster"]')?.addEventListener("click", () => refresh(false));
  state.initialized = true;
  refresh(false);
  return true;
}

if (!build()) {
  const observer = new MutationObserver(() => {
    if (build()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
