import { buildGuildRoteOperationSafety } from "./guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments, normalizeDonationPreference } from "./guild-rote-safe-planner.js";
import {
  buildGuildUnitOwnershipMatrix,
  filterGuildUnitOwnershipRows,
  guildOperationUnitsForPhase,
} from "./guild-unit-ownership-model.js";

const state = {
  target: null,
  guildBody: null,
  catalog: [],
  allyCode: "",
  operations: null,
  planningOverlay: null,
  planningOverlayError: "",
  safety: null,
  plan: null,
  phase: "P1",
  baseId: "",
  memberSearch: "",
  ownership: "All",
  sort: "safety",
  loadingOperations: false,
  error: "",
};

const asArray = (value) => Array.isArray(value) ? value : [];
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const escapeAttr = escapeHtml;

function guildId() {
  return String(state.guildBody?.guild?.id || "");
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}

function redundancyTarget() {
  let value = Number(window.__swgohGuildRoteRedundancyTarget || 0);
  if (!Number.isFinite(value) || value <= 0) {
    try { value = Number(localStorage.getItem("swgoh:guild-rote-redundancy-target") || 2); } catch { value = 2; }
  }
  return Math.max(1, Math.min(5, Number.isFinite(value) ? Math.floor(value) : 2));
}

function preferenceKey(row = {}) {
  return `${String(row?.memberId || "").trim()}|${String(row?.baseId || "").trim().toUpperCase()}`;
}

function normalizedPreferenceRows(rows = []) {
  return asArray(rows)
    .filter((row) => row?.memberId && row?.baseId && ["give", "keep"].includes(normalizeDonationPreference(row.preference)))
    .map((row) => ({
      memberId: String(row.memberId),
      baseId: String(row.baseId).toUpperCase(),
      preference: normalizeDonationPreference(row.preference),
    }));
}

function plannerControls() {
  const id = guildId();
  const officer = id ? readJson(`swgoh-roster-command:guild-rote-officer:${id}`) : {};
  const safety = id ? readJson(`swgoh-roster-command:guild-rote-safety:${id}`) : {};
  const preferenceMap = new Map();
  for (const row of normalizedPreferenceRows(safety?.preferences)) preferenceMap.set(preferenceKey(row), row);
  for (const row of normalizedPreferenceRows(state.planningOverlay?.preferences)) preferenceMap.set(preferenceKey(row), row);

  const ignored = new Set(asArray(safety?.ignoredMembers).map((value) => String(value || "").trim()).filter(Boolean));
  for (const value of asArray(state.planningOverlay?.ignoredMembers)) {
    const idValue = String(value || "").trim();
    if (idValue) ignored.add(idValue);
  }
  for (const row of asArray(state.planningOverlay?.unavailableMembers)) {
    for (const value of [row?.memberId, row?.allyCode, row?.memberName]) {
      const idValue = String(value || "").trim();
      if (idValue) ignored.add(idValue);
    }
  }

  return {
    locks: asArray(officer?.locks),
    reservations: asArray(officer?.reservations),
    preferences: [...preferenceMap.values()],
    ignoredMembers: [...ignored],
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}

async function ensurePlanningOverlay() {
  state.planningOverlay = null;
  state.planningOverlayError = "";
  if (digits(state.allyCode).length !== 9) return;
  try {
    state.planningOverlay = await fetchJson(`/api/guild/by-player/${digits(state.allyCode)}/planning-overlay`);
  } catch (error) {
    state.planningOverlayError = error?.message || "Durable guild planning controls are unavailable.";
  }
}

function resolveUnit(value) {
  const query = String(value || "").trim().toLowerCase();
  if (!query) return null;
  return state.catalog.find((unit) => String(unit?.baseId || "").toLowerCase() === query)
    || state.catalog.find((unit) => String(unit?.name || "").toLowerCase() === query)
    || null;
}

function queryState() {
  const params = new URLSearchParams(location.search);
  const phase = String(params.get("phase") || "P1").toUpperCase();
  state.phase = /^P[1-6]$/.test(phase) ? phase : "All";
  const requestedUnit = String(params.get("unit") || "");
  if (requestedUnit) state.baseId = requestedUnit;
}

function updateUrl() {
  const params = new URLSearchParams(location.search);
  if (digits(state.allyCode).length === 9) params.set("allyCode", digits(state.allyCode));
  if (state.phase && state.phase !== "All") params.set("phase", state.phase); else params.delete("phase");
  if (state.baseId) params.set("unit", state.baseId); else params.delete("unit");
  history.replaceState(null, "", `${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
}

async function ensureOperations() {
  if (state.operations || state.loadingOperations) return;
  state.loadingOperations = true;
  try {
    state.operations = await fetchJson("/api/rote/operations");
  } catch (error) {
    state.error = error?.message || "ROTE Operation requirements are unavailable.";
  } finally {
    state.loadingOperations = false;
  }
}

function computePlanningContext() {
  if (!state.guildBody || !state.operations || !state.catalog.length) {
    state.safety = null;
    state.plan = null;
    return;
  }
  const controls = plannerControls();
  state.safety = buildGuildRoteOperationSafety(state.guildBody, state.catalog, { redundancyTarget: redundancyTarget() });
  state.plan = planGuildRoteSafeAssignments(state.guildBody, state.operations, {
    maxPerTerritory: 10,
    locks: controls.locks,
    reservations: controls.reservations,
    preferences: controls.preferences,
    ignoredMembers: controls.ignoredMembers,
    protections: state.safety.protections,
  });
}

function defaultUnit() {
  if (state.baseId && state.catalog.some((unit) => String(unit.baseId) === String(state.baseId))) return;
  if (state.operations && /^P[1-6]$/.test(state.phase)) {
    state.baseId = guildOperationUnitsForPhase(state.operations, state.phase)[0]?.baseId || "";
  }
  if (!state.baseId) state.baseId = state.catalog.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))[0]?.baseId || "";
}

function progression(row, unitType) {
  if (!row.owned) return "Missing";
  if (unitType === "Ship") return `${number(row.stars)}★ · ${number(row.unitGp)} GP`;
  if (row.relic > 0) return `R${number(row.relic)} · ${number(row.stars)}★ · ${number(row.unitGp)} GP`;
  return `${number(row.stars)}★ · G${number(row.gear)} · ${number(row.unitGp)} GP`;
}

function bandLabel(row) {
  return ({
    give: "GIVE",
    safe: "SAFE DONOR",
    owned: "OWNED",
    protected: "MISSION PROTECTED",
    keep: "KEEP",
    unavailable: "UNAVAILABLE",
    below: "BELOW GATE",
    missing: "MISSING",
  })[row.band] || row.band;
}

function protectionText(row) {
  const reasons = asArray(row?.protection?.reasons);
  return reasons.slice(0, 2).join(" · ") || "";
}

function formatRequirement(requirement) {
  if (!requirement) return "No Operation demand";
  const gate = requirement.maxRequirement?.unitType === "Ship"
    ? `${number(requirement.maxRequirement.requiredRarity)}★ max gate`
    : `R${number(requirement.maxRequirement.requiredRelic)} max gate`;
  return `${number(requirement.demand)} slot${requirement.demand === 1 ? "" : "s"} · ${gate}`;
}

function selectedStaticUnit() {
  return state.catalog.find((unit) => String(unit?.baseId || "") === String(state.baseId || "")) || null;
}

function operationQuickOptions() {
  if (!state.operations || !/^P[1-6]$/.test(state.phase)) return [];
  return guildOperationUnitsForPhase(state.operations, state.phase);
}

function stat(label, value, tone = "", detail = "") {
  return `<div class="guild-unit-stat ${escapeAttr(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function matrixLink(baseId, phase = state.phase) {
  const params = new URLSearchParams();
  if (digits(state.allyCode).length === 9) params.set("allyCode", digits(state.allyCode));
  if (/^P[1-6]$/.test(phase)) params.set("phase", phase);
  params.set("unit", baseId);
  return `/guild/units?${params.toString()}`;
}

function renderQuickDemand() {
  const rows = operationQuickOptions().slice(0, 18);
  if (!rows.length) return '<div class="guild-unit-context-note">Choose P1–P6 to overlay ROTE Operation demand and donor safety.</div>';
  return `<div class="guild-unit-demand-grid">${rows.map((row) => `<a class="${row.baseId === state.baseId ? "active" : ""}" href="${escapeAttr(matrixLink(row.baseId))}" data-guild-unit-quick="${escapeAttr(row.baseId)}"><strong>${escapeHtml(row.name)}</strong><span>${number(row.demand)} slot${row.demand === 1 ? "" : "s"} · ${escapeHtml(formatRequirement(row))}</span></a>`).join("")}</div>`;
}

function renderTable(matrix) {
  const staticUnit = matrix.staticUnit || selectedStaticUnit() || {};
  const rows = filterGuildUnitOwnershipRows(matrix.members, {
    search: state.memberSearch,
    ownership: state.ownership,
    sort: state.sort,
  });
  if (!rows.length) return '<div class="guild-unit-context-note">No guild members match the current filters.</div>';

  return `<div class="guild-unit-table-wrap"><table class="guild-unit-table"><thead><tr><th>Member</th><th>${escapeHtml(staticUnit.name || state.baseId)}</th><th>Unit GP</th><th>Operation Fit</th><th>Safety / Status</th><th>Assigned</th><th>Protection</th><th>Player</th></tr></thead><tbody>${rows.map((row) => {
    const playerUrl = row.allyCode ? `/?allyCode=${encodeURIComponent(digits(row.allyCode))}#roster` : "";
    const fit = matrix.requirement
      ? row.owned ? `${number(row.qualifyingSlots)} / ${number(row.totalDemandSlots)} slots` : "—"
      : row.owned ? "Roster owner" : "—";
    const reason = protectionText(row);
    const availabilityNote = row.unavailable ? "<small>Excluded from automatic Operation assignment</small>" : "";
    return `<tr class="band-${escapeAttr(row.band)}"><td><strong>${escapeHtml(row.memberName)}</strong><small>${number(row.memberGp)} GP · ${escapeHtml(row.allyCode || "")}</small></td><td><strong>${escapeHtml(progression(row, staticUnit.unitType || "Character"))}</strong></td><td>${row.owned ? number(row.unitGp) : "—"}</td><td>${escapeHtml(fit)}</td><td><span class="guild-unit-band ${escapeAttr(row.band)}">${escapeHtml(bandLabel(row))}</span>${availabilityNote}${row.preference !== "default" ? `<small>${escapeHtml(row.preference.toUpperCase())} preference</small>` : ""}</td><td>${row.assigned ? `<strong>${number(row.assigned)} slot${row.assigned === 1 ? "" : "s"}</strong>` : "—"}</td><td><span class="guild-unit-protection">${escapeHtml(reason || "—")}</span></td><td>${playerUrl ? `<a class="guild-unit-player-link" href="${escapeAttr(playerUrl)}">Open Roster →</a>` : "—"}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function render() {
  const target = state.target;
  if (!target || !state.guildBody || !state.catalog.length) return;
  defaultUnit();
  const staticUnit = selectedStaticUnit();
  if (!staticUnit) {
    target.innerHTML = '<div class="workspace-error">The selected unit is not present in the current game catalog.</div>';
    return;
  }

  const controls = plannerControls();
  const matrix = buildGuildUnitOwnershipMatrix({
    guildSnapshot: state.guildBody,
    catalog: state.catalog,
    operations: state.operations || {},
    phase: /^P[1-6]$/.test(state.phase) ? state.phase : "",
    baseId: state.baseId,
    preferences: controls.preferences,
    ignoredMembers: controls.ignoredMembers,
    protections: state.safety?.protections || [],
    assignments: state.plan?.assignments || [],
  });
  const s = matrix.summary;
  const operationContext = Boolean(matrix.requirement);
  const quickOptions = operationQuickOptions();
  const overlaySynced = Boolean(state.planningOverlay?.bound && state.planningOverlay?.durable);
  const overlayPreferenceCount = asArray(state.planningOverlay?.preferences).length;
  const overlayUnavailableCount = asArray(state.planningOverlay?.ignoredMembers).length;

  target.innerHTML = `
    <section class="guild-route-page-heading guild-unit-page-heading"><div><div class="kicker">GUILD UNIT INTELLIGENCE</div><h2>Unit Ownership Matrix</h2><p>Search any character or ship across the current guild. Select a ROTE phase to overlay Operation demand, qualifying owners, GIVE/KEEP preferences, mission protection, availability and current safe assignments.</p></div><a class="guild-unit-tb-link" href="${escapeAttr(`/guild/tb?allyCode=${encodeURIComponent(digits(state.allyCode))}`)}">Open TB Command →</a></section>
    ${state.error ? `<div class="guild-unit-context-note warn">Operation overlay unavailable: ${escapeHtml(state.error)}. Generic guild ownership remains available.</div>` : ""}
    ${overlaySynced ? `<div class="guild-unit-context-note">Durable guild controls synced · ${number(overlayPreferenceCount)} GIVE/KEEP preference${overlayPreferenceCount === 1 ? "" : "s"} · ${number(overlayUnavailableCount)} unavailable member${overlayUnavailableCount === 1 ? "" : "s"}.</div>` : ""}
    <section class="guild-unit-controls guild-page-card">
      <div class="guild-unit-control-primary"><label>Unit<input id="guildUnitLookup" list="guildUnitCatalogOptions" value="${escapeAttr(staticUnit.name || state.baseId)}" placeholder="Character, ship or Base ID"></label><datalist id="guildUnitCatalogOptions">${state.catalog.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))).map((unit) => `<option value="${escapeAttr(unit.name || unit.baseId)}">${escapeHtml(unit.baseId)} · ${escapeHtml(unit.unitType || "Character")}</option>`).join("")}</datalist><button id="guildUnitApply" type="button">Inspect Unit</button></div>
      <div class="guild-unit-control-grid"><label>ROTE Context<select id="guildUnitPhase"><option value="All"${state.phase === "All" ? " selected" : ""}>All roster · no Operation gate</option>${[1,2,3,4,5,6].map((phase) => `<option value="P${phase}"${state.phase === `P${phase}` ? " selected" : ""}>P${phase} Operations</option>`).join("")}</select></label><label>Operation Quick Pick<select id="guildUnitQuickSelect"${quickOptions.length ? "" : " disabled"}><option value="">${quickOptions.length ? "Choose required unit…" : "No phase selected"}</option>${quickOptions.map((row) => `<option value="${escapeAttr(row.baseId)}"${row.baseId === state.baseId ? " selected" : ""}>${escapeHtml(row.name)} · ${number(row.demand)} slot${row.demand === 1 ? "" : "s"}</option>`).join("")}</select></label><label>Member Filter<select id="guildUnitOwnership"><option value="All">All members</option><option value="Owned"${state.ownership === "Owned" ? " selected" : ""}>Owners only</option><option value="Missing"${state.ownership === "Missing" ? " selected" : ""}>Missing only</option>${operationContext ? `<option value="Qualifying"${state.ownership === "Qualifying" ? " selected" : ""}>Qualifying only</option><option value="Safe"${state.ownership === "Safe" ? " selected" : ""}>Safe/GIVE donors</option><option value="Protected"${state.ownership === "Protected" ? " selected" : ""}>Protected/KEEP</option><option value="Unavailable"${state.ownership === "Unavailable" ? " selected" : ""}>Unavailable</option>` : ""}</select></label><label>Sort<select id="guildUnitSort"><option value="safety">Safety / strongest fit</option><option value="unitGp"${state.sort === "unitGp" ? " selected" : ""}>Unit GP</option><option value="memberGp"${state.sort === "memberGp" ? " selected" : ""}>Member GP</option><option value="relic"${state.sort === "relic" ? " selected" : ""}>Relic / progression</option><option value="name"${state.sort === "name" ? " selected" : ""}>Member name</option></select></label></div>
      <label class="guild-unit-member-search">Search Members<input id="guildUnitMemberSearch" value="${escapeAttr(state.memberSearch)}" placeholder="Member name, Ally Code, safety state, protection reason…"></label>
    </section>
    <section class="guild-unit-selected guild-page-card"><div><div class="kicker">${escapeHtml(staticUnit.unitType || "UNIT")}</div><h2>${escapeHtml(staticUnit.name || state.baseId)}</h2><p>${escapeHtml(state.baseId)} · ${escapeHtml(matrix.requirement ? `${state.phase} Operation requirement: ${formatRequirement(matrix.requirement)}` : "No Operation requirement in the selected context")}</p></div><div class="guild-unit-selected-badge ${operationContext ? "operation" : "generic"}">${operationContext ? "OPERATION INTELLIGENCE" : "GUILD OWNERSHIP"}</div></section>
    <div class="guild-unit-summary">${stat("Guild Owners", s.owners, s.owners ? "good" : "bad", `${s.guildMembers} members`)}${stat("Missing", s.missingMembers, s.missingMembers ? "" : "good")}${staticUnit.unitType === "Ship" ? stat("7★ Owners", s.sevenStarOwners) : stat("R7+ Owners", s.relic7Owners)}${stat("Average Unit GP", number(s.averageUnitGp))}${operationContext ? stat("Operation Demand", s.demand) : ""}${operationContext ? stat("Qualifying", s.qualifyingOwners, s.qualifyingOwners >= s.demand ? "good" : "warn") : ""}${operationContext ? stat("Safe / GIVE", s.safeOwners, s.safeOwners >= s.demand ? "good" : "warn") : ""}${operationContext ? stat("Protected / KEEP", s.protectedOwners + s.keepOwners, (s.protectedOwners + s.keepOwners) ? "warn" : "good") : ""}${operationContext ? stat("Unavailable", s.unavailableOwners, s.unavailableOwners ? "warn" : "good") : ""}</div>
    ${/^P[1-6]$/.test(state.phase) ? `<section class="guild-page-card"><div class="kicker">${escapeHtml(state.phase)} OPERATION QUICK PICKS</div><h3>Highest-demand units in this phase</h3>${renderQuickDemand()}</section>` : ""}
    <section class="guild-page-card"><div class="guild-unit-table-title"><div><div class="kicker">CURRENT GUILD ROSTER</div><h3>${escapeHtml(staticUnit.name)} ownership by member</h3></div><span>${number(filterGuildUnitOwnershipRows(matrix.members, { search: state.memberSearch, ownership: state.ownership, sort: state.sort }).length)} rows</span></div>${renderTable(matrix)}<div class="guild-unit-foot"><strong>Evidence boundary:</strong> ownership/progression comes from the hydrated live guild roster. Operation qualification uses normalized ROTE slot requirements. Mission-protected/KEEP and unavailable status are planning intelligence; they are not proof of an in-game deployment.</div></section>`;

  wireControls();
  updateUrl();
}

function applyUnitLookup() {
  const input = document.getElementById("guildUnitLookup");
  const unit = resolveUnit(input?.value);
  if (!unit) {
    if (input) input.setCustomValidity("Choose an exact character, ship, or Base ID from the game catalog.");
    input?.reportValidity();
    return;
  }
  input.setCustomValidity("");
  state.baseId = String(unit.baseId);
  render();
}

function wireControls() {
  document.getElementById("guildUnitApply")?.addEventListener("click", applyUnitLookup);
  document.getElementById("guildUnitLookup")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); applyUnitLookup(); }
  });
  document.getElementById("guildUnitPhase")?.addEventListener("change", (event) => {
    state.phase = event.target.value;
    state.ownership = "All";
    if (/^P[1-6]$/.test(state.phase)) {
      const currentRequired = guildOperationUnitsForPhase(state.operations || {}, state.phase).some((row) => row.baseId === state.baseId);
      if (!currentRequired) state.baseId = guildOperationUnitsForPhase(state.operations || {}, state.phase)[0]?.baseId || state.baseId;
    }
    render();
  });
  document.getElementById("guildUnitQuickSelect")?.addEventListener("change", (event) => {
    if (!event.target.value) return;
    state.baseId = event.target.value;
    render();
  });
  document.getElementById("guildUnitOwnership")?.addEventListener("change", (event) => { state.ownership = event.target.value; render(); });
  document.getElementById("guildUnitSort")?.addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  document.getElementById("guildUnitMemberSearch")?.addEventListener("input", (event) => { state.memberSearch = event.target.value; render(); });
  for (const link of document.querySelectorAll("[data-guild-unit-quick]")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.baseId = link.dataset.guildUnitQuick;
      render();
    });
  }
}

export async function renderGuildUnitMatrixPage({ target, guildBody, catalog, allyCode } = {}) {
  if (!target || !guildBody || !Array.isArray(catalog)) return;
  state.target = target;
  state.guildBody = guildBody;
  state.catalog = catalog;
  state.allyCode = digits(allyCode);
  queryState();
  target.innerHTML = '<section class="guild-page-card"><div class="workspace-note">Building guild-wide unit ownership and Operation safety context…</div></section>';
  await Promise.all([ensureOperations(), ensurePlanningOverlay()]);
  computePlanningContext();
  defaultUnit();
  render();
}
