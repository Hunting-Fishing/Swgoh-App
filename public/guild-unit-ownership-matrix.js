import { buildGuildRoteOperationSafety } from "./guild-rote-operation-safety.js";
import { planGuildRoteSafeAssignments, normalizeDonationPreference } from "./guild-rote-safe-planner.js";
import { buildGuildUnitOwnershipMatrix, guildOperationUnitsForPhase } from "./guild-unit-ownership-model.js";

const state = { allyCode: "", guild: null, operations: null, catalog: null, safety: null, plan: null, phase: "P1", baseId: "", search: "", sort: "safety", loading: false, loadedAt: 0 };
const $ = (id) => document.getElementById(id);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);
const number = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat().format(Number(value)) : "0";
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function guildId() { return String(state.guild?.guild?.id || ""); }
function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } }
function redundancyTarget() { const n = Number(window.__swgohGuildRoteRedundancyTarget || localStorage.getItem("swgoh:guild-rote-redundancy-target") || 2); return Math.max(1, Math.min(5, Number.isFinite(n) ? Math.floor(n) : 2)); }
function plannerControls() {
  const id = guildId();
  if (!id) return { locks: [], reservations: [], preferences: [], ignoredMembers: [] };
  const officer = readJson(`swgoh-roster-command:guild-rote-officer:${id}`);
  const safety = readJson(`swgoh-roster-command:guild-rote-safety:${id}`);
  return {
    locks: Array.isArray(officer?.locks) ? officer.locks : [],
    reservations: Array.isArray(officer?.reservations) ? officer.reservations : [],
    preferences: Array.isArray(safety?.preferences) ? safety.preferences.filter((row) => row?.memberId && row?.baseId && ["give", "keep"].includes(normalizeDonationPreference(row.preference))) : [],
    ignoredMembers: Array.isArray(safety?.ignoredMembers) ? safety.ignoredMembers : [],
  };
}
async function fetchJson(url, force = false) {
  if (force && window.__swgohFetchCache?.invalidate) { try { window.__swgohFetchCache.invalidate(url); } catch {} }
  const response = await fetch(url, { cache: force ? "reload" : "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error || `${url} returned HTTP ${response.status}`);
  return body;
}
async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const body = await fetchJson("/data/catalog.json?guild-unit-matrix=1");
  if (!Array.isArray(body?.units) || !body.units.length) throw new Error("Static unit catalog is unavailable.");
  state.catalog = body.units;
  return state.catalog;
}
function recompute() {
  if (!state.guild || !state.operations || !state.catalog) return;
  const controls = plannerControls();
  state.safety = buildGuildRoteOperationSafety(state.guild, state.catalog, { redundancyTarget: redundancyTarget() });
  state.plan = planGuildRoteSafeAssignments(state.guild, state.operations, { maxPerTerritory: 10, locks: controls.locks, reservations: controls.reservations, preferences: controls.preferences, ignoredMembers: controls.ignoredMembers, protections: state.safety.protections });
  const units = guildOperationUnitsForPhase(state.operations, state.phase);
  if (!units.some((row) => row.baseId === state.baseId)) state.baseId = units[0]?.baseId || "";
  render();
}
async function load(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9 || state.loading) { render(); return; }
  if (!force && state.guild && state.allyCode === allyCode && Date.now() - state.loadedAt < 25_000) { render(); return; }
  state.loading = true; renderLoading();
  try {
    const [guild, operations, catalog] = await Promise.all([fetchJson(`/api/guild/by-player/${allyCode}/roster`, force), state.operations && !force ? Promise.resolve(state.operations) : fetchJson("/api/rote/operations", force), loadCatalog()]);
    state.allyCode = allyCode; state.guild = guild; state.operations = operations; state.catalog = catalog; state.loadedAt = Date.now(); recompute();
  } catch (error) { renderError(error?.message || "Guild unit ownership matrix is unavailable."); }
  finally { state.loading = false; }
}
function installSurface() {
  const panel = document.querySelector('[data-workspace-panel="guild"]');
  if (!panel) return false;
  if ($("guildUnitOwnershipMatrix")) return true;
  const section = document.createElement("section"); section.id = "guildUnitOwnershipMatrix"; section.className = "card workspace-intro guild-unit-matrix"; section.innerHTML = '<div class="workspace-note">Load an Ally Code to inspect guild-wide Operation unit ownership.</div>';
  const phaseBoard = $("guildTbPhaseCommand");
  if (phaseBoard?.parentNode === panel && phaseBoard.nextSibling) panel.insertBefore(section, phaseBoard.nextSibling); else panel.appendChild(section);
  return true;
}
function renderLoading() { const target = $("guildUnitOwnershipMatrix"); if (target) target.innerHTML = '<div class="workspace-note">Building guild ownership matrix from the live roster…</div>'; }
function renderError(message) { const target = $("guildUnitOwnershipMatrix"); if (target) target.innerHTML = `<div class="workspace-error">${esc(message)}</div>`; }
function progression(row) {
  if (!row.owned) return "Missing";
  if (String(row.unit?.unitType || "Character") === "Ship") return `${number(row.stars)}★ · ${number(row.unitGp)} GP`;
  return row.relic > 0 ? `R${number(row.relic)} · ${number(row.unitGp)} GP` : `${number(row.stars)}★ · G${number(row.gear)} · ${number(row.unitGp)} GP`;
}
function bandLabel(row) { return ({ give: "GIVE", safe: "SAFE", protected: "MISSION PROTECTED", keep: "KEEP", below: "BELOW GATE", missing: "MISSING" })[row.band] || row.band; }
function protectionText(row) { const reasons = Array.isArray(row.protection?.reasons) ? row.protection.reasons : []; return reasons.slice(0, 2).join(" · ") || "—"; }
function sortRows(rows) {
  const list = rows.slice();
  if (state.sort === "unitgp") return list.sort((a,b)=>b.unitGp-a.unitGp || b.memberGp-a.memberGp);
  if (state.sort === "membergp") return list.sort((a,b)=>b.memberGp-a.memberGp || b.unitGp-a.unitGp);
  if (state.sort === "name") return list.sort((a,b)=>a.memberName.localeCompare(b.memberName));
  return list;
}
function loadMember(allyCode) {
  const input = $("allyCode"), form = $("allyForm"); if (!input || !form || digits(allyCode).length !== 9) return;
  input.value = digits(allyCode); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); window.scrollTo({ top: 0, behavior: "smooth" });
}
function render() {
  installSurface(); const target = $("guildUnitOwnershipMatrix"); if (!target) return;
  const allyCode = digits($("allyCode")?.value); if (allyCode.length !== 9) { target.innerHTML = '<div class="kicker">GUILD ROSTER INTELLIGENCE</div><h3>Operation Unit Ownership Matrix</h3><p class="workspace-note">Load a guild member Ally Code first.</p>'; return; }
  if (!state.guild || !state.operations || !state.safety || !state.plan) return;
  const phases = [...new Set((state.operations.slots || []).map((row)=>String(row.phase || "")).filter((phase)=>/^P[1-6]$/.test(phase)))].sort();
  const unitOptions = guildOperationUnitsForPhase(state.operations, state.phase);
  if (!unitOptions.length) { target.innerHTML = '<div class="workspace-note">No normalized Operation units are available for this phase.</div>'; return; }
  if (!state.baseId) state.baseId = unitOptions[0].baseId;
  const controls = plannerControls();
  const matrix = buildGuildUnitOwnershipMatrix({ guildSnapshot: state.guild, operations: state.operations, phase: state.phase, baseId: state.baseId, preferences: controls.preferences, protections: state.safety.protections, assignments: state.plan.assignments });
  const q = state.search.trim().toLowerCase();
  const rows = sortRows(matrix.members.filter((row)=>!q || [row.memberName,row.allyCode,row.band,protectionText(row)].join(" ").toLowerCase().includes(q)));
  const r = matrix.requirement, s = matrix.summary;
  const req = r.maxRequirement.unitType === "Ship" ? `${r.maxRequirement.requiredRarity}★ max` : `R${r.maxRequirement.requiredRelic} max`;
  target.innerHTML = `<div class="guild-unit-matrix-head"><div><div class="kicker">GUILD UNIT OWNERSHIP · OPERATIONS</div><h3>${esc(r.name)} · ${esc(state.phase)}</h3><p>Every current guild member against this Operation requirement: ownership, progression, unit GP, qualifying-slot depth, safe-donor status, mission protection, GIVE/KEEP preference, and current draft assignments.</p></div></div>
  <div class="guild-unit-matrix-toolbar"><label>Phase<select id="guildUnitPhase">${phases.map((p)=>`<option value="${esc(p)}"${p===state.phase?" selected":""}>${esc(p)}</option>`).join("")}</select></label><label>Operation Unit<select id="guildUnitBaseId">${unitOptions.map((u)=>`<option value="${esc(u.baseId)}"${u.baseId===r.baseId?" selected":""}>${esc(u.name)} · demand ${u.demand}</option>`).join("")}</select></label><label>Sort<select id="guildUnitSort"><option value="safety">Safety / Best donor</option><option value="unitgp"${state.sort==="unitgp"?" selected":""}>Unit GP</option><option value="membergp"${state.sort==="membergp"?" selected":""}>Member GP</option><option value="name"${state.sort==="name"?" selected":""}>Member name</option></select></label><button id="guildUnitRefresh" type="button">Refresh</button></div>
  <div class="guild-unit-matrix-toolbar" style="grid-template-columns:minmax(240px,1fr)"><label>Search members<input id="guildUnitSearch" value="${esc(state.search)}" placeholder="Member, Ally Code, safety state…"></label></div>
  <div class="guild-unit-matrix-summary">${[ ["Demand",s.demand,""],["Max Gate",req,""],["Owners",s.owners,""],["Qualifying",s.qualifyingOwners,s.qualifyingOwners>=s.demand?"good":"warn"],["Safe/GIVE",s.safeOwners,s.safeOwners>=s.demand?"good":"warn"],["Protected/KEEP",s.protectedOwners+s.keepOwners,(s.protectedOwners+s.keepOwners)?"warn":""],["Missing",s.missingMembers,s.missingMembers?"bad":"good"] ].map(([l,v,t])=>`<div class="guild-unit-matrix-stat ${t}"><span>${esc(l)}</span><strong>${esc(String(v))}</strong></div>`).join("")}</div>
  <div class="guild-unit-matrix-wrap"><table class="guild-unit-matrix-table"><thead><tr><th>Member</th><th>Unit Progression</th><th>Qualifying Slots</th><th>Safety</th><th>Assigned</th><th>Protection / Preference</th><th>Action</th></tr></thead><tbody>${rows.map((row)=>`<tr><td><strong>${esc(row.memberName)}</strong><small>${number(row.memberGp)} member GP · ${esc(row.allyCode||"")}</small></td><td><strong>${esc(progression(row))}</strong></td><td>${row.owned?`${number(row.qualifyingSlots)} / ${number(row.totalDemandSlots)}`:"—"}</td><td><span class="guild-unit-band ${esc(row.band)}">${esc(bandLabel(row))}</span></td><td>${row.assigned?`<strong>${number(row.assigned)} slot${row.assigned===1?"":"s"}</strong>`:"—"}</td><td><span class="guild-unit-protection">${esc(protectionText(row))}${row.preference!=="default"?` · ${esc(row.preference.toUpperCase())}`:""}</span></td><td>${row.allyCode?`<button class="guild-unit-load-member" type="button" data-guild-unit-ally="${esc(row.allyCode)}">Load Member</button>`:"—"}</td></tr>`).join("")}</tbody></table></div>
  <div class="guild-unit-matrix-foot"><strong>Interpretation:</strong> “qualifying” means the owned unit satisfies at least one normalized Operation slot for this unit in the selected phase. “Safe/GIVE” excludes current mission-protected and KEEP donors. This is roster capability, not proof of an in-game placement.</div>`;
  $("guildUnitPhase")?.addEventListener("change", (e)=>{ state.phase=e.target.value; state.baseId=""; render(); });
  $("guildUnitBaseId")?.addEventListener("change", (e)=>{ state.baseId=e.target.value; render(); });
  $("guildUnitSort")?.addEventListener("change", (e)=>{ state.sort=e.target.value; render(); });
  $("guildUnitSearch")?.addEventListener("input", (e)=>{ state.search=e.target.value; render(); });
  $("guildUnitRefresh")?.addEventListener("click", ()=>load(true));
  for (const button of document.querySelectorAll("#guildUnitOwnershipMatrix [data-guild-unit-ally]")) button.addEventListener("click",()=>loadMember(button.dataset.guildUnitAlly));
}
function install() {
  if (!installSurface()) { const observer = new MutationObserver(()=>{ if (installSurface()) { observer.disconnect(); render(); } }); observer.observe(document.body,{childList:true,subtree:true}); }
  document.addEventListener("click", (event)=>{ if (event.target.closest?.('button[data-workspace-tab="guild"]')) setTimeout(()=>load(false),0); }, true);
  $("allyForm")?.addEventListener("submit", ()=>{ state.allyCode=""; state.guild=null; state.safety=null; state.plan=null; state.loadedAt=0; setTimeout(()=>{ if(location.hash.toLowerCase()==="#guild") load(true); },450); });
  window.addEventListener("swgoh:guild-rote-redundancy-target", ()=>{ if(state.guild&&state.operations&&state.catalog) recompute(); });
  if (location.hash.toLowerCase()==="#guild") load(false);
}
if (typeof document!=="undefined"&&typeof window!=="undefined") { if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install,{once:true}); else install(); }
