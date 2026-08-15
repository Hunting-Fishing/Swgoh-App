const CACHE_MS = 25_000;
const state = { body: null, allyCode: "", fetchedAt: 0, squad: [], size: 5, initialized: false };
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

function storageKey() {
  return `swgoh:squad-workbench:v1:${digits($("allyCode")?.value) || state.allyCode || "default"}`;
}

function characters(body = state.body) {
  return Array.isArray(body?.units) ? body.units : [];
}

async function loadLive(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < CACHE_MS) {
    state.body = shared.body; state.allyCode = allyCode; state.fetchedAt = Number(shared.fetchedAt || Date.now()); return shared.body;
  }
  if (!force && state.body && state.allyCode === allyCode && Date.now() - state.fetchedAt < CACHE_MS) return state.body;
  const response = await fetch(`/api/player/${allyCode}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `Live roster returned HTTP ${response.status}`);
  state.body = body; state.allyCode = allyCode; state.fetchedAt = Date.now();
  window.__swgohLiveSnapshot = { allyCode, body, fetchedAt: state.fetchedAt };
  return body;
}

function readSaved() {
  try { const parsed = JSON.parse(localStorage.getItem(storageKey()) || "[]"); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function writeSaved(value) { localStorage.setItem(storageKey(), JSON.stringify(value)); }

function unitById(baseId) { return characters().find((unit) => String(unit.baseId) === String(baseId)); }

function currentMembers() { return state.squad.map(unitById).filter(Boolean).slice(0, state.size); }

function commonFactions(members) {
  if (!members.length) return [];
  let common = new Set(members[0].factions || []);
  for (const member of members.slice(1)) common = new Set([...common].filter((faction) => (member.factions || []).includes(faction)));
  return [...common].sort();
}

function squadMetrics(members) {
  const totalGp = members.reduce((sum, unit) => sum + Number(unit.power || 0), 0);
  const avgSpeed = members.length ? Math.round(members.reduce((sum, unit) => sum + Number(unit.speed || 0), 0) / members.length) : 0;
  const relicMembers = members.filter((unit) => Number(unit.relic || 0) > 0);
  const avgRelic = relicMembers.length ? relicMembers.reduce((sum, unit) => sum + Number(unit.relic || 0), 0) / relicMembers.length : 0;
  const fullMods = members.filter((unit) => Number(unit.equippedMods || 0) >= 6).length;
  return {
    totalGp, avgSpeed, avgRelic,
    fullMods,
    zetas: members.reduce((sum, unit) => sum + Number(unit.zetas || 0), 0),
    omicrons: members.reduce((sum, unit) => sum + Number(unit.omicrons || 0), 0),
    commonFactions: commonFactions(members),
  };
}

function portrait(unit) {
  if (!unit) return '<div class="pro-squad-empty-icon">+</div>';
  return unit.image ? `<img src="${escapeAttr(unit.image)}" alt="${escapeAttr(unit.name)}" loading="lazy">` : `<div class="pro-squad-empty-icon">${escapeHtml(String(unit.name || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2))}</div>`;
}

function renderSquad() {
  const slots = $("proSquadSlots");
  const summary = $("proSquadSummary");
  if (!slots || !summary) return;
  const members = currentMembers();
  const metrics = squadMetrics(members);
  slots.innerHTML = Array.from({ length: state.size }, (_, index) => {
    const unit = members[index];
    return `
      <article class="pro-squad-slot${unit ? " filled" : ""}">
        <div class="pro-squad-portrait">${portrait(unit)}</div>
        ${unit ? `<strong>${escapeHtml(unit.name)}</strong><span>${number(unit.power)} GP · ${Number(unit.relic || 0) ? `R${Number(unit.relic)}` : `G${Number(unit.gear || 0)}`} · ${number(unit.speed)} SPD</span><button type="button" data-remove-squad="${escapeAttr(unit.baseId)}">Remove</button>` : `<strong>Open Slot ${index + 1}</strong><span>Add an owned character</span>`}
      </article>`;
  }).join("");
  summary.innerHTML = `
    <div class="pro-summary-stat"><span>Squad GP</span><strong>${number(metrics.totalGp)}</strong></div>
    <div class="pro-summary-stat"><span>Avg Speed</span><strong>${number(metrics.avgSpeed)}</strong></div>
    <div class="pro-summary-stat"><span>Avg Relic</span><strong>R${metrics.avgRelic.toFixed(1)}</strong></div>
    <div class="pro-summary-stat"><span>Full Mod Sets</span><strong>${metrics.fullMods}/${members.length || 0}</strong></div>
    <div class="pro-summary-stat"><span>Zetas</span><strong>${number(metrics.zetas)}</strong></div>
    <div class="pro-summary-stat"><span>Omicrons</span><strong>${number(metrics.omicrons)}</strong></div>
    <div class="pro-summary-stat wide"><span>Shared Factions</span><strong>${escapeHtml(metrics.commonFactions.slice(0, 4).join(" · ") || "Mixed")}</strong></div>`;
  for (const button of slots.querySelectorAll("button[data-remove-squad]")) button.addEventListener("click", () => removeFromSquad(button.dataset.removeSquad));
  renderPicker();
}

function addToSquad(baseId) {
  const id = String(baseId || "");
  if (!id || !unitById(id) || state.squad.includes(id)) return;
  if (state.squad.length >= state.size) state.squad = state.squad.slice(0, state.size - 1);
  state.squad.push(id);
  renderSquad();
}
function removeFromSquad(baseId) { state.squad = state.squad.filter((id) => id !== baseId); renderSquad(); }

function pickerFilters() {
  return {
    query: $("proSquadSearch")?.value.trim().toLowerCase() || "",
    faction: $("proSquadFaction")?.value || "All",
    role: $("proSquadRole")?.value || "All",
    minRelic: Number($("proSquadMinRelic")?.value || 0),
    sort: $("proSquadSort")?.value || "power",
  };
}

function renderPicker() {
  const list = $("proSquadPickerList");
  if (!list || !state.body) return;
  const f = pickerFilters();
  const available = characters()
    .filter((unit) => !state.squad.includes(String(unit.baseId)))
    .filter((unit) => f.faction === "All" || (unit.factions || []).includes(f.faction))
    .filter((unit) => f.role === "All" || unit.role === f.role)
    .filter((unit) => Number(unit.relic || 0) >= f.minRelic)
    .filter((unit) => !f.query || [unit.name, unit.baseId, unit.role, ...(unit.factions || [])].join(" ").toLowerCase().includes(f.query))
    .sort((a, b) => {
      if (f.sort === "speed") return Number(b.speed || 0) - Number(a.speed || 0);
      if (f.sort === "relic") return Number(b.relic || 0) - Number(a.relic || 0) || Number(b.power || 0) - Number(a.power || 0);
      if (f.sort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      return Number(b.power || 0) - Number(a.power || 0);
    }).slice(0, 80);
  list.innerHTML = available.length ? available.map((unit) => `
    <article class="pro-picker-unit">
      <div>${portrait(unit)}</div><section><strong>${escapeHtml(unit.name)}</strong><span>${escapeHtml((unit.factions || []).slice(0, 2).join(" · ") || unit.role || "")} · ${number(unit.power)} GP · ${Number(unit.relic || 0) ? `R${Number(unit.relic)}` : `G${Number(unit.gear || 0)}`}</span></section><button type="button" data-add-workbench="${escapeAttr(unit.baseId)}">Add</button>
    </article>`).join("") : '<div class="workspace-note">No owned characters match the picker filters.</div>';
  for (const button of list.querySelectorAll("button[data-add-workbench]")) button.addEventListener("click", () => addToSquad(button.dataset.addWorkbench));
}

function refreshPickerOptions() {
  const chars = characters();
  const factions = [...new Set(chars.flatMap((unit) => unit.factions || []).filter(Boolean))].sort();
  const roles = [...new Set(chars.map((unit) => unit.role).filter(Boolean))].sort();
  setOptions($("proSquadFaction"), factions, "All factions");
  setOptions($("proSquadRole"), roles, "All roles");
}
function setOptions(select, values, label) {
  if (!select) return; const selected = select.value || "All";
  select.innerHTML = `<option value="All">${escapeHtml(label)}</option>${values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join("")}`;
  select.value = values.includes(selected) ? selected : "All";
}

function factionCores() {
  const map = new Map();
  for (const unit of characters()) for (const faction of unit.factions || []) {
    if (!map.has(faction)) map.set(faction, []);
    map.get(faction).push(unit);
  }
  return [...map.entries()].map(([faction, units]) => ({
    faction,
    units: units.slice().sort((a, b) => Number(b.power || 0) - Number(a.power || 0)).slice(0, state.size),
  })).filter((entry) => entry.units.length >= state.size)
    .map((entry) => ({ ...entry, gp: entry.units.reduce((sum, unit) => sum + Number(unit.power || 0), 0) }))
    .sort((a, b) => b.gp - a.gp).slice(0, 10);
}

function renderFactionCores() {
  const container = $("proFactionCores"); if (!container) return;
  const cores = factionCores();
  container.innerHTML = cores.length ? cores.map((core) => `<button type="button" class="pro-core-button" data-build-core="${escapeAttr(core.faction)}"><span>${escapeHtml(core.faction)}</span><strong>${number(core.gp)} GP</strong></button>`).join("") : '<div class="workspace-note">Load a roster to generate owned faction cores.</div>';
  for (const button of container.querySelectorAll("button[data-build-core]")) button.addEventListener("click", () => {
    const core = cores.find((entry) => entry.faction === button.dataset.buildCore);
    if (core) { state.squad = core.units.map((unit) => String(unit.baseId)); renderSquad(); }
  });
}

function saveSquad() {
  const name = String($("proSquadName")?.value || "").trim() || `Squad ${readSaved().length + 1}`;
  const members = currentMembers(); if (!members.length) return;
  const saved = readSaved().filter((entry) => entry.name !== name);
  saved.push({ name, size: state.size, members: members.map((unit) => unit.baseId), updatedAt: new Date().toISOString() });
  writeSaved(saved); renderSaved();
}

function renderSaved() {
  const container = $("proSavedSquads"); if (!container) return;
  const saved = readSaved();
  container.innerHTML = saved.length ? saved.map((entry, index) => {
    const members = (entry.members || []).map(unitById).filter(Boolean);
    const metrics = squadMetrics(members);
    return `<article class="pro-saved-squad"><div><strong>${escapeHtml(entry.name)}</strong><span>${members.length}/${entry.size || 5} · ${number(metrics.totalGp)} GP</span></div><div><button type="button" data-load-squad="${index}">Load</button><button type="button" data-delete-squad="${index}">Delete</button></div></article>`;
  }).join("") : '<div class="workspace-note">No saved squads for this Ally Code yet.</div>';
  for (const button of container.querySelectorAll("button[data-load-squad]")) button.addEventListener("click", () => {
    const entry = readSaved()[Number(button.dataset.loadSquad)]; if (!entry) return;
    state.size = Number(entry.size) === 3 ? 3 : 5; state.squad = (entry.members || []).slice(0, state.size); $("proSquadSize").value = String(state.size); $("proSquadName").value = entry.name || ""; renderSquad();
  });
  for (const button of container.querySelectorAll("button[data-delete-squad]")) button.addEventListener("click", () => {
    const savedNow = readSaved(); savedNow.splice(Number(button.dataset.deleteSquad), 1); writeSaved(savedNow); renderSaved();
  });
}

async function refresh(force = false) {
  const status = $("proSquadStatus");
  try {
    const body = await loadLive(force);
    if (!body) { if (status) status.textContent = "Load an Ally Code to build squads."; return; }
    refreshPickerOptions(); renderSquad(); renderFactionCores(); renderSaved();
    if (status) status.textContent = `${body.player?.name || body.player?.allyCode || "Player"} · ${number(characters().length)} owned characters available`;
  } catch (error) { if (status) status.textContent = error?.message || "Squad workbench unavailable."; }
}

function build() {
  const panel = document.querySelector('[data-workspace-panel="squads"]');
  if (!panel || $("proSquadWorkbench")) return false;
  const section = document.createElement("section"); section.id = "proSquadWorkbench"; section.className = "pro-squad-workbench";
  section.innerHTML = `
    <section class="card workspace-intro pro-command-header"><div><div class="kicker">MANUAL + ROSTER-AWARE TEAM BUILDING</div><h2>Squad Workbench</h2><p>Build and save 3v3 or 5v5 squads from the loaded roster. Composition metrics remain separate from GAC meta claims; SWGOH.GG-style battle performance can be layered in later as a distinct data source.</p></div><div id="proSquadStatus" class="status">Load an Ally Code</div></section>
    <section class="card pro-squad-toolbar"><label>Squad Name<input id="proSquadName" placeholder="e.g. ROTE Jedi Core"></label><label>Format<select id="proSquadSize"><option value="5">5v5</option><option value="3">3v3</option></select></label><button id="proSaveSquad" type="button">Save Squad</button><button id="proClearSquad" type="button">Clear</button></section>
    <section id="proSquadSummary" class="pro-summary-grid"></section>
    <section id="proSquadSlots" class="pro-squad-slots"></section>
    <div class="pro-workbench-columns">
      <section class="card workspace-intro"><div class="kicker">OWNED ROSTER PICKER</div><h3>Add Characters</h3><div class="pro-picker-filters"><input id="proSquadSearch" placeholder="Search character or faction…"><select id="proSquadFaction"><option value="All">All factions</option></select><select id="proSquadRole"><option value="All">All roles</option></select><label>Min R<input id="proSquadMinRelic" type="number" min="0" max="15" value="0"></label><select id="proSquadSort"><option value="power">GP</option><option value="speed">Speed</option><option value="relic">Relic</option><option value="name">Name</option></select></div><div id="proSquadPickerList" class="pro-picker-list"></div></section>
      <section><section class="card workspace-intro"><div class="kicker">OWNED FACTION CORES</div><h3>Strongest Available Cores</h3><p class="workspace-note">Deterministic roster-strength suggestions only—not presented as current meta teams.</p><div id="proFactionCores" class="pro-core-grid"></div></section><section class="card workspace-intro"><div class="kicker">SAVED LOADOUTS</div><h3>Your Squads</h3><div id="proSavedSquads"></div></section></section>
    </div>`;
  panel.prepend(section);
  for (const id of ["proSquadSearch", "proSquadMinRelic"]) $(id)?.addEventListener("input", renderPicker);
  for (const id of ["proSquadFaction", "proSquadRole", "proSquadSort"]) $(id)?.addEventListener("change", renderPicker);
  $("proSquadSize")?.addEventListener("change", () => { state.size = Number($("proSquadSize").value) === 3 ? 3 : 5; state.squad = state.squad.slice(0, state.size); renderSquad(); renderFactionCores(); });
  $("proSaveSquad")?.addEventListener("click", saveSquad);
  $("proClearSquad")?.addEventListener("click", () => { state.squad = []; renderSquad(); });
  $("allyForm")?.addEventListener("submit", () => { state.body = null; state.fetchedAt = 0; state.squad = []; setTimeout(() => refresh(true), 350); });
  document.querySelector('button[data-workspace-tab="squads"]')?.addEventListener("click", () => refresh(false));
  window.addEventListener("swgoh:add-to-squad", (event) => { addToSquad(event.detail?.baseId); });
  state.initialized = true; refresh(false); return true;
}

if (!build()) { const observer = new MutationObserver(() => { if (build()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); }
