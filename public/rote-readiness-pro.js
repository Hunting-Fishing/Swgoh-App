const CACHE_MS = 25_000;
const state = { body: null, allyCode: "", fetchedAt: 0, rote: null, initialized: false };
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;
const number = (value) => new Intl.NumberFormat().format(Number(value || 0));

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

async function loadRote(force = false) {
  if (!force && state.rote) return state.rote;
  const response = await fetch("/api/rote/operations", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `ROTE operations returned HTTP ${response.status}`);
  state.rote = body; return body;
}

function liveMap() { return new Map([...(state.body?.units || []), ...(state.body?.ships || [])].map((unit) => [String(unit.baseId), unit])); }

function occurrencesForHistogram(unit, requirement, histogram) {
  if (!unit) return 0;
  if (requirement.unitType === "Ship") {
    const stars = Number(unit.stars || 0);
    return Object.entries(histogram || {}).reduce((sum, [required, count]) => sum + (stars >= Number(required) ? Number(count) : 0), 0);
  }
  const relic = Number(unit.relic || 0);
  return Object.entries(histogram || {}).reduce((sum, [required, count]) => sum + (relic >= Number(required) ? Number(count) : 0), 0);
}

function requirementProgress(requirement, map = liveMap()) {
  const unit = map.get(String(requirement.baseId));
  const histogram = requirement.unitType === "Ship" ? requirement.rarityCounts : requirement.relicCounts;
  const ready = occurrencesForHistogram(unit, requirement, histogram);
  const total = Number(requirement.requiredCount || 0);
  const status = !unit ? "missing" : ready >= total ? "ready" : ready > 0 ? "partial" : "blocked";
  return { unit, ready, total, status };
}

function phaseProgress(phase, map = liveMap()) {
  let ready = 0; let total = 0;
  for (const requirement of state.rote?.requirements || []) {
    const phaseReq = (requirement.phaseRequirements || []).find((entry) => entry.phase === phase);
    if (!phaseReq) continue;
    total += Number(phaseReq.count || 0);
    const unit = map.get(String(requirement.baseId));
    const histogram = requirement.unitType === "Ship" ? phaseReq.rarityCounts : phaseReq.relicCounts;
    ready += occurrencesForHistogram(unit, requirement, histogram);
  }
  return { phase, ready, total, percent: total ? Math.round((ready / total) * 100) : 0 };
}

function targetLabel(requirement) { return requirement.unitType === "Ship" ? `${Number(requirement.maxRarity || 7)}★` : `R${Number(requirement.maxRelic || 0)}`; }
function currentLabel(requirement, unit) {
  if (!unit) return "Not owned";
  return requirement.unitType === "Ship" ? `${Number(unit.stars || 0)}★` : (Number(unit.relic || 0) ? `R${Number(unit.relic)}` : `G${Number(unit.gear || 0)}`);
}

function renderOverview() {
  const overview = $("roteOverview"); const phases = $("rotePhaseGrid"); if (!overview || !phases || !state.rote || !state.body) return;
  const map = liveMap(); const progress = (state.rote.requirements || []).map((req) => ({ req, ...requirementProgress(req, map) }));
  const readySlots = progress.reduce((sum, item) => sum + item.ready, 0);
  const totalSlots = progress.reduce((sum, item) => sum + item.total, 0);
  const ownedDemanded = progress.filter((item) => item.unit).length;
  const fullyReady = progress.filter((item) => item.status === "ready").length;
  const missing = progress.filter((item) => item.status === "missing").length;
  overview.innerHTML = `
    <div class="pro-summary-stat"><span>Operations Slots Covered</span><strong>${number(readySlots)} / ${number(totalSlots)}</strong></div>
    <div class="pro-summary-stat"><span>Slot Coverage</span><strong>${totalSlots ? Math.round((readySlots / totalSlots) * 100) : 0}%</strong></div>
    <div class="pro-summary-stat"><span>Demanded Units Owned</span><strong>${number(ownedDemanded)} / ${number(progress.length)}</strong></div>
    <div class="pro-summary-stat"><span>Fully Ready Units</span><strong>${number(fullyReady)}</strong></div>
    <div class="pro-summary-stat"><span>Missing Units</span><strong>${number(missing)}</strong></div>
    <div class="pro-summary-stat"><span>ROTE Conflicts</span><strong>${number(state.rote.conflictCount)}</strong></div>`;
  phases.innerHTML = (state.rote.phases || []).map(({ phase }) => {
    const item = phaseProgress(phase, map);
    return `<article class="pro-phase-card"><div><span>${escapeHtml(phase)}</span><strong>${item.percent}%</strong></div><div class="tracker-progress"><div style="width:${item.percent}%"></div></div><small>${number(item.ready)} / ${number(item.total)} operation slots currently satisfiable</small></article>`;
  }).join("");
}

function rowPriority(item) {
  if (item.status === "missing") return 100000 + item.total * 100;
  if (item.status === "blocked") return 50000 + (item.total - item.ready) * 100;
  if (item.status === "partial") return 25000 + (item.total - item.ready) * 100;
  return item.total;
}

function activeFilters() {
  return { query: $("roteSearch")?.value.trim().toLowerCase() || "", phase: $("rotePhaseFilter")?.value || "All", status: $("roteStatusFilter")?.value || "All", type: $("roteTypeFilter")?.value || "All", sort: $("roteSort")?.value || "priority" };
}

function renderTable() {
  const output = $("roteRequirementTable"); const count = $("roteRequirementCount"); if (!output || !count || !state.rote || !state.body) return;
  const map = liveMap(); const f = activeFilters();
  let rows = (state.rote.requirements || []).map((req) => ({ req, ...requirementProgress(req, map) }))
    .filter((item) => f.type === "All" || item.req.unitType === f.type)
    .filter((item) => f.status === "All" || item.status === f.status)
    .filter((item) => f.phase === "All" || (item.req.phases || []).includes(f.phase))
    .filter((item) => !f.query || [item.req.name, item.req.baseId, ...(item.req.phases || [])].join(" ").toLowerCase().includes(f.query));
  rows.sort((a, b) => {
    if (f.sort === "demand") return b.total - a.total || a.req.name.localeCompare(b.req.name);
    if (f.sort === "target") return (b.req.maxRelic || b.req.maxRarity || 0) - (a.req.maxRelic || a.req.maxRarity || 0) || b.total - a.total;
    if (f.sort === "name") return a.req.name.localeCompare(b.req.name);
    return rowPriority(b) - rowPriority(a) || b.total - a.total;
  });
  count.textContent = `${number(rows.length)} / ${number(state.rote.requirements?.length || 0)} demanded units`;
  output.innerHTML = rows.length ? `<div class="pro-table-wrap"><table class="workspace-table pro-rote-table"><thead><tr><th>Unit</th><th>Type</th><th>Demand</th><th>Phases</th><th>Highest Req.</th><th>Current</th><th>Slots Ready</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((item) => `<tr><td><button class="pro-unit-link" type="button" data-inspect-base-id="${escapeAttr(item.req.baseId)}">${escapeHtml(item.req.name)}</button><small>${escapeHtml(item.req.baseId)}</small></td><td>${escapeHtml(item.req.unitType)}</td><td>${number(item.total)}</td><td>${escapeHtml((item.req.phases || []).join(" · "))}</td><td><strong>${escapeHtml(targetLabel(item.req))}</strong></td><td>${escapeHtml(currentLabel(item.req, item.unit))}</td><td>${number(item.ready)} / ${number(item.total)}</td><td><span class="pro-rote-status ${escapeAttr(item.status)}">${escapeHtml(item.status.toUpperCase())}</span></td><td>${item.unit && item.req.unitType === "Character" ? `<button type="button" data-add-squad="${escapeAttr(item.req.baseId)}">Squad +</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="workspace-note">No ROTE requirements match the active filters.</div>';
  for (const button of output.querySelectorAll("button[data-add-squad]")) button.addEventListener("click", () => { window.dispatchEvent(new CustomEvent("swgoh:add-to-squad", { detail: { baseId: button.dataset.addSquad } })); document.querySelector('button[data-workspace-tab="squads"]')?.click(); });
}

function renderAll() { renderOverview(); renderTable(); }

async function refresh(force = false) {
  const status = $("roteStatus");
  try {
    const [body, rote] = await Promise.all([loadLive(force), loadRote(force)]);
    if (!body) { if (status) status.textContent = "Load an Ally Code to calculate ROTE readiness."; return; }
    if (status) status.textContent = `${body.player?.name || body.player?.allyCode || "Player"} · ${number(rote.totalSlots)} live operation requirements indexed`;
    renderAll();
  } catch (error) { if (status) status.textContent = error?.message || "ROTE readiness data unavailable."; }
}

function activate(pushHash = true) {
  for (const panel of document.querySelectorAll("[data-workspace-panel]")) panel.hidden = panel.dataset.workspacePanel !== "rote";
  for (const button of document.querySelectorAll("button[data-workspace-tab]")) { const active = button.dataset.workspaceTab === "rote"; button.classList.toggle("active", active); button.setAttribute("aria-selected", active ? "true" : "false"); }
  if (pushHash && location.hash !== "#rote") history.replaceState(null, "", "#rote");
  localStorage.setItem("swgoh:workspace-tab", "rote"); refresh(false); window.scrollTo({ top: 0, behavior: "smooth" });
}

function build() {
  const tabs = $("workspaceTabs"); if (!tabs || $("workspace-rote")) return false;
  const squadsButton = tabs.querySelector('button[data-workspace-tab="squads"]');
  const button = document.createElement("button"); button.type = "button"; button.className = "workspace-tab"; button.dataset.workspaceTab = "rote"; button.textContent = "ROTE"; button.setAttribute("aria-controls", "workspace-rote"); button.setAttribute("aria-selected", "false");
  if (squadsButton?.nextSibling) tabs.insertBefore(button, squadsButton.nextSibling); else tabs.appendChild(button);
  const panel = document.createElement("section"); panel.id = "workspace-rote"; panel.className = "workspace-panel"; panel.dataset.workspacePanel = "rote"; panel.hidden = true;
  panel.innerHTML = `
    <section class="card workspace-intro pro-command-header"><div><div class="kicker">RISE OF THE EMPIRE · PLAYER READINESS</div><h2>ROTE Operations Command</h2><p>Exact operation-unit demand is normalized from the current game-data extraction. The dashboard calculates how many published operation slots this live roster can satisfy now, phase by phase, including character relic and ship rarity requirements.</p></div><div id="roteStatus" class="status">Load an Ally Code</div></section>
    <section class="card workspace-intro"><div class="pro-reference-line"><strong>Reference model:</strong> SWGOH.GG's current ROTE database separates event information, platoons and rewards; this app keeps the workflow native and evaluates the loaded roster against current operation definitions.</div><div id="roteOverview" class="pro-summary-grid"></div><div id="rotePhaseGrid" class="pro-phase-grid"></div></section>
    <section class="card pro-filter-card"><div class="pro-filter-grid compact"><label>Search<input id="roteSearch" placeholder="Unit or Base ID…"></label><label>Phase<select id="rotePhaseFilter"><option>All</option><option>P1</option><option>P2</option><option>P3</option><option>P4</option><option>P5</option><option>P6</option></select></label><label>Status<select id="roteStatusFilter"><option value="All">All</option><option value="ready">Ready</option><option value="partial">Partial</option><option value="blocked">Blocked</option><option value="missing">Missing</option></select></label><label>Type<select id="roteTypeFilter"><option>All</option><option>Character</option><option>Ship</option></select></label><label>Sort<select id="roteSort"><option value="priority">Upgrade Priority</option><option value="demand">Demand Count</option><option value="target">Highest Requirement</option><option value="name">Name</option></select></label></div><div class="pro-view-row"><span id="roteRequirementCount"></span></div></section>
    <section id="roteRequirementTable" class="card workspace-intro"><div class="workspace-note">Load an Ally Code to calculate ROTE Operations coverage.</div></section>`;
  const panels = document.querySelector('[data-workspace-panel="squads"]')?.parentNode || tabs.parentNode;
  const squadsPanel = document.querySelector('[data-workspace-panel="squads"]'); if (squadsPanel?.nextSibling) panels.insertBefore(panel, squadsPanel.nextSibling); else panels.appendChild(panel);
  button.addEventListener("click", (event) => { event.preventDefault(); activate(true); });
  for (const id of ["roteSearch"]) $(id)?.addEventListener("input", renderTable);
  for (const id of ["rotePhaseFilter", "roteStatusFilter", "roteTypeFilter", "roteSort"]) $(id)?.addEventListener("change", renderTable);
  document.addEventListener("click", (event) => { const known = event.target.closest('button[data-workspace-tab]:not([data-workspace-tab="rote"])'); if (known) button.classList.remove("active"); });
  window.addEventListener("hashchange", () => { if (location.hash.toLowerCase() === "#rote") activate(false); });
  $("allyForm")?.addEventListener("submit", () => { state.body = null; state.fetchedAt = 0; if (location.hash.toLowerCase() === "#rote") setTimeout(() => refresh(true), 350); });
  state.initialized = true; if (location.hash.toLowerCase() === "#rote") activate(false); return true;
}

if (!build()) { const observer = new MutationObserver(() => { if (build()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); }
