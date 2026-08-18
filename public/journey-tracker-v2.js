import { JOURNEY_PRESETS, journeyPresetById } from "./farm-presets.js";
import {
  currentGear,
  currentLevel,
  currentRelic,
  currentStars,
  eventProgress,
  metricReadiness,
  readinessBand,
  readinessLabel,
  requirementProgress,
} from "./journey-progress.js";

const state = {
  catalog: [],
  catalogMap: new Map(),
  liveBody: null,
  allyCode: "",
  lastFetch: 0,
  initialized: false,
  views: new Map(),
  durableGoals: null,
  durableGoalLoadAttempted: false,
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

function readLocalTracked() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    return Array.isArray(value) ? value.filter((id) => journeyPresetById(id)) : [];
  } catch {
    return [];
  }
}

function writeLocalTracked(ids) {
  localStorage.setItem(storageKey(), JSON.stringify([...new Set(ids)].filter((id) => journeyPresetById(id))));
}

function durableMatchesLoadedPlayer() {
  const accountAlly = digits(state.durableGoals?.player?.allyCode);
  const loadedAlly = digits($("allyCode")?.value) || state.allyCode;
  return accountAlly.length === 9 && loadedAlly.length === 9 && accountAlly === loadedAlly;
}

function hasUnsyncedLocalGoals() {
  return durableMatchesLoadedPlayer()
    && !(state.durableGoals?.trackedIds || []).length
    && readLocalTracked().length > 0;
}

function readTracked() {
  if (durableMatchesLoadedPlayer()) return Array.isArray(state.durableGoals?.trackedIds) ? state.durableGoals.trackedIds.filter((id) => journeyPresetById(id)) : [];
  return readLocalTracked();
}

async function goalRequest(method = "GET", eventIds) {
  const response = await fetch("/api/account/web-actions/journey-goals", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", ...(method === "PUT" ? { "Content-Type": "application/json" } : {}) },
    ...(method === "PUT" ? { body: JSON.stringify({ eventIds }) } : {}),
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `Journey goal sync returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function loadDurableGoals(force = false) {
  if (state.durableGoalLoadAttempted && !force) return state.durableGoals;
  state.durableGoalLoadAttempted = true;
  try {
    state.durableGoals = await goalRequest("GET");
  } catch (error) {
    if (![401, 403, 404].includes(Number(error?.status))) console.warn("Journey goal account sync unavailable", error);
    state.durableGoals = null;
  }
  return state.durableGoals;
}

async function writeTracked(ids) {
  const normalized = [...new Set(ids)].filter((id) => journeyPresetById(id));
  if (!durableMatchesLoadedPlayer()) {
    writeLocalTracked(normalized);
    return { durable: false, trackedIds: normalized };
  }
  state.durableGoals = await goalRequest("PUT", normalized);
  writeLocalTracked(state.durableGoals.trackedIds || normalized);
  return { durable: true, trackedIds: state.durableGoals.trackedIds || normalized };
}

function viewFor(eventId) {
  if (!state.views.has(eventId)) state.views.set(eventId, { filter: "needs", sort: "priority" });
  return state.views.get(eventId);
}

async function loadCatalog() {
  if (state.catalog.length) return state.catalog;
  const response = await fetch("/data/catalog.json?journey=3", { cache: "no-store" });
  if (!response.ok) throw new Error(`Game catalog returned HTTP ${response.status}`);
  const body = await response.json();
  state.catalog = Array.isArray(body?.units) ? body.units : [];
  state.catalogMap = new Map(state.catalog.map((unit) => [String(unit.baseId), unit]));
  return state.catalog;
}

async function loadLive(force = false) {
  const allyCode = digits($("allyCode")?.value);
  if (allyCode.length !== 9) return null;
  const shared = window.__swgohLiveSnapshot;
  if (!force && shared?.allyCode === allyCode && shared?.body && Date.now() - Number(shared.fetchedAt || 0) < LIVE_CACHE_MS) {
    state.liveBody = shared.body;
    state.allyCode = allyCode;
    state.lastFetch = Number(shared.fetchedAt || Date.now());
    return shared.body;
  }
  if (!force && state.liveBody && state.allyCode === allyCode && Date.now() - state.lastFetch < LIVE_CACHE_MS) return state.liveBody;
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
  if (requirement.type === "RELIC") return `Relic ${requirement.tier}`;
  if (requirement.type === "GEAR") return `Gear ${requirement.tier}`;
  return `${requirement.tier} Stars`;
}

function unitName(baseId) { return state.catalogMap.get(baseId)?.name || baseId; }
function unitImage(baseId) { return state.catalogMap.get(baseId)?.image || ""; }

function targetSummary(event, liveMap) {
  const target = liveMap.get(event.targetBaseId);
  if (!target) return "Not unlocked yet";
  const relic = currentRelic(target);
  return relic > 0 ? `Unlocked · ${currentStars(target)}★ · G${currentGear(target)} · R${relic}` : `Unlocked · ${currentStars(target)}★ · G${currentGear(target)}`;
}

function metricCard(label, current, required, formatter) {
  if (!required) return "";
  const tone = metricReadiness(current, required);
  return `<div class="farm-metric tone-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatter(current))}</strong><small>need ${escapeHtml(formatter(required))}</small></div>`;
}

function requirementModel(requirement, liveMap) {
  const unit = liveMap.get(requirement.baseId) || null;
  const progress = requirementProgress(unit, requirement);
  const owned = Boolean(unit?.baseId);
  const tone = owned ? readinessBand(progress.percent, progress.complete) : "far";
  return { requirement, unit, progress, owned, tone, name: unitName(requirement.baseId) };
}

function requirementCard(model) {
  const { requirement, unit, progress, owned, tone, name } = model;
  const image = unit?.image || unitImage(requirement.baseId);
  const status = readinessLabel(progress.percent, progress.complete, owned);
  return `<article class="farm-requirement tone-${tone}" data-inspect-base-id="${escapeAttr(requirement.baseId)}" tabindex="0" role="button" aria-label="Inspect ${escapeAttr(name)}"><div class="farm-requirement-head"><div class="farm-unit-identity">${image ? `<img src="${escapeAttr(image)}" alt="" loading="lazy">` : '<span class="farm-avatar-fallback">?</span>'}<div><strong>${escapeHtml(name)}</strong><span class="farm-required-target">Target · ${escapeHtml(requiredLabel(requirement))}</span></div></div><div class="farm-unit-score"><span class="farm-tone-badge tone-${tone}">${escapeHtml(status)}</span><strong>${progress.percent}%</strong></div></div><div class="farm-progress-track tone-${tone}" aria-label="${progress.percent}% ready"><span style="width:${progress.percent}%"></span></div><div class="farm-metric-grid">${metricCard("Stars", progress.stars, progress.requiredStars, (value) => `${value}★`)}${metricCard("Level", progress.level, progress.requiredLevel, (value) => String(value))}${metricCard("Gear", progress.gear, progress.requiredGear, (value) => `G${value}`)}${metricCard("Relic", progress.relic, progress.requiredRelic, (value) => `R${value}`)}</div>${!owned ? '<div class="farm-action-note">Not owned — acquisition is the first blocker.</div>' : progress.complete ? '<div class="farm-action-note ready">Requirement complete.</div>' : `<div class="farm-action-note">Still needs ${escapeHtml(requirement.type === "RELIC" ? `R${requirement.tier}` : requirement.type === "GEAR" ? `G${requirement.tier}` : `${requirement.tier}★`)}.</div>`}</article>`;
}

function filterModels(models, view) {
  let rows = models.slice();
  if (view.filter === "needs") rows = rows.filter((row) => !row.progress.complete);
  if (view.filter === "far") rows = rows.filter((row) => row.tone === "far" || row.tone === "building");
  if (view.filter === "close") rows = rows.filter((row) => row.tone === "close");
  if (view.filter === "ready") rows = rows.filter((row) => row.progress.complete);
  if (view.sort === "closest") rows.sort((a,b)=>Number(a.progress.complete)-Number(b.progress.complete)||b.progress.percent-a.progress.percent||a.name.localeCompare(b.name));
  else if (view.sort === "name") rows.sort((a,b)=>a.name.localeCompare(b.name));
  else rows.sort((a,b)=>Number(a.progress.complete)-Number(b.progress.complete)||a.progress.percent-b.progress.percent||a.name.localeCompare(b.name));
  return rows;
}

function summaryCounts(models) { const counts={ready:0,close:0,building:0,far:0}; for(const model of models) counts[model.tone]+=1; return counts; }
function summaryBox(label,value,tone){return `<div class="farm-summary-box tone-${tone}"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;}

function eventCard(event, liveMap) {
  const models=event.requirements.map((requirement)=>requirementModel(requirement,liveMap));
  const summary=eventProgress(event.requirements,liveMap); const overallTone=readinessBand(summary.percent,summary.complete); const counts=summaryCounts(models);
  const target=state.catalogMap.get(event.targetBaseId); const targetImage=liveMap.get(event.targetBaseId)?.image||target?.image||""; const view=viewFor(event.id); const visible=filterModels(models,view);
  return `<article class="journey-card farm-journey-card tone-${overallTone}" data-journey-card="${escapeAttr(event.id)}"><header class="farm-journey-head"><div class="journey-target farm-target">${targetImage?`<button class="journey-target-image" type="button" data-inspect-base-id="${escapeAttr(event.targetBaseId)}"><img src="${escapeAttr(targetImage)}" alt=""></button>`:'<span class="farm-target-fallback">★</span>'}<div><span class="journey-category">${escapeHtml(event.category)}</span><h3>${escapeHtml(event.name)}</h3><small>${escapeHtml(targetSummary(event,liveMap))}</small></div></div><div class="farm-overall-score"><span class="farm-tone-badge tone-${overallTone}">${escapeHtml(readinessLabel(summary.percent,summary.complete,true))}</span><strong>${summary.percent}%</strong><small>${summary.completeCount}/${event.requirements.length} ready</small></div><button class="journey-remove" type="button" data-untrack-journey="${escapeAttr(event.id)}" aria-label="Stop tracking ${escapeAttr(event.name)}">×</button></header><div class="farm-progress-track farm-overall-progress tone-${overallTone}" aria-label="${summary.percent}% complete"><span style="width:${summary.percent}%"></span></div><div class="farm-summary-strip">${summaryBox("Far / Missing",counts.far,"far")}${summaryBox("Building",counts.building,"building")}${summaryBox("Close",counts.close,"close")}${summaryBox("Ready",counts.ready,"ready")}</div><div class="farm-card-toolbar"><div class="farm-filter-buttons" role="group" aria-label="Filter ${escapeAttr(event.name)} requirements">${[["needs","Needs Work",models.filter((row)=>!row.progress.complete).length],["far","Far / Building",counts.far+counts.building],["close","Close",counts.close],["ready","Ready",counts.ready],["all","All",models.length]].map(([key,label,count])=>`<button type="button" class="${view.filter===key?"active":""}" data-journey-filter="${key}" data-journey-id="${escapeAttr(event.id)}">${escapeHtml(label)} <span>${count}</span></button>`).join("")}</div><label>Sort<select data-journey-sort="${escapeAttr(event.id)}"><option value="priority" ${view.sort==="priority"?"selected":""}>Needs most first</option><option value="closest" ${view.sort==="closest"?"selected":""}>Closest first</option><option value="name" ${view.sort==="name"?"selected":""}>Name</option></select></label></div><div class="farm-requirement-grid">${visible.length?visible.map(requirementCard).join(""):'<div class="farm-filter-empty">No requirements match this filter.</div>'}</div></article>`;
}

function presetChooser() {
  const categories=[...new Set(JOURNEY_PRESETS.map((event)=>event.category))];
  return categories.map((category)=>`<section class="journey-preset-group"><div class="farm-preset-group-head"><h4>${escapeHtml(category)}</h4><span>${JOURNEY_PRESETS.filter((event)=>event.category===category).length} farms</span></div><div class="journey-preset-buttons farm-preset-grid">${JOURNEY_PRESETS.filter((event)=>event.category===category).map((event)=>`<button type="button" class="farm-preset-button ${event.featured?"featured":""}" data-track-journey="${escapeAttr(event.id)}"><span class="farm-preset-title">${escapeHtml(event.shortName||event.name)}</span><small>${event.requirements.length} requirements</small>${event.featured?'<b>NEW</b>':""}<i>+</i></button>`).join("")}</div></section>`).join("");
}

function installShell(panel) {
  panel.innerHTML=`<section class="card workspace-intro journey-intro farm-intro"><div><div class="kicker">JOURNEY / EVENT FARMING</div><h2>Farm Command</h2><p>Pick an unlock, then see the exact blockers first. Every required unit is graded from <strong class="farm-word far">Far</strong> → <strong class="farm-word building">Building</strong> → <strong class="farm-word close">Close</strong> → <strong class="farm-word ready">Ready</strong> using the loaded live roster.</p></div><div class="farm-legend" aria-label="Readiness color legend"><span class="tone-far">Red · Far / Missing</span><span class="tone-building">Orange · Building</span><span class="tone-close">Yellow · Close</span><span class="tone-ready">Green · Ready</span></div></section><section class="card journey-chooser farm-chooser"><div class="journey-chooser-head"><div><div class="kicker">ADD A FARM</div><h3>Journey Guide Targets</h3><p class="workspace-note">Track several unlocks at once. For your verified player, selections sync to your Command Center account and are used by TB Farm Plan. Other manually loaded Ally Codes stay device-local.</p></div><div class="journey-select-row"><select id="journeyEventSelect" aria-label="Journey event">${[...new Set(JOURNEY_PRESETS.map((event)=>event.category))].map((category)=>`<optgroup label="${escapeAttr(category)}">${JOURNEY_PRESETS.filter((event)=>event.category===category).map((event)=>`<option value="${escapeAttr(event.id)}">${escapeHtml(event.shortName||event.name)}</option>`).join("")}</optgroup>`).join("")}</select><button id="journeyTrackSelected" type="button">+ Track Farm</button></div></div><div id="journeyGoalSync" class="workspace-note"></div><details class="journey-preset-picker farm-preset-picker"><summary>Browse all ${JOURNEY_PRESETS.length} available farm presets</summary>${presetChooser()}</details></section><section class="journey-live-status card" id="journeyLiveStatus">Load an Ally Code to compare farm requirements with a live roster.</section><section id="journeyTrackedList" class="journey-tracked-list"></section>`;
}

function syncMessage() {
  const target=$("journeyGoalSync"); if(!target)return;
  if(!state.durableGoals){target.textContent="Journey selections are device-local until you sign in with a verified Command Center player.";return;}
  if(!durableMatchesLoadedPlayer()){target.textContent=`Signed-in goals belong to ${state.durableGoals.player?.name||state.durableGoals.player?.allyCode}. This manually loaded player uses device-local selections only.`;return;}
  const local=readLocalTracked(); const durable=state.durableGoals.trackedIds||[];
  if(!durable.length&&local.length){target.innerHTML=`${local.length} device-local goal${local.length===1?"":"s"} found for this Ally Code. <button type="button" id="journeySyncLocalGoals">Save device goals to my account</button>`;return;}
  target.textContent=`${durable.length} tracked goal${durable.length===1?"":"s"} synced to your verified Command Center account and available to TB Farm Plan.`;
}

async function render(force=false) {
  const list=$("journeyTrackedList"); const status=$("journeyLiveStatus"); if(!list||!status)return;
  await Promise.all([loadCatalog(),loadDurableGoals(false)]);
  const body=await loadLive(force); const trackedIds=readTracked(); syncMessage();
  if(!body){status.textContent=`Load a 9-digit Ally Code first. ${JOURNEY_PRESETS.length} farm presets are ready; live readiness requires the player roster.`;list.innerHTML=trackedIds.map((id)=>{const event=journeyPresetById(id);return `<article class="journey-card journey-no-player"><h3>${escapeHtml(event.name)}</h3><p>Waiting for live roster.</p></article>`;}).join("");return;}
  const units=[...(body.units||[]),...(body.ships||[])]; const liveMap=new Map(units.map((unit)=>[String(unit.baseId),unit]));
  status.innerHTML=`<strong>${escapeHtml(body.player?.name||body.player?.allyCode||"Player")}</strong><span>${units.length} owned units loaded</span><span>${trackedIds.length} farm${trackedIds.length===1?"":"s"} tracked</span><span>${durableMatchesLoadedPlayer()?"Account synced":"Device-local"}</span>`;
  if(!trackedIds.length){list.innerHTML=`<section class="card journey-empty"><h3>No farms tracked yet</h3><p>Choose a Galactic Legend, capital ship, or Journey Guide unit above. Tracked goals for your verified account also personalize TB Farm Plan.</p></section>`;return;}
  list.innerHTML=trackedIds.map((id)=>eventCard(journeyPresetById(id),liveMap)).join("");
}

async function addTracked(id) {
  if(!journeyPresetById(id))return;
  if(hasUnsyncedLocalGoals()){
    showError(new Error("Device-local Journey goals are waiting to be synced. Use 'Save device goals to my account' before changing the verified account list."));
    return;
  }
  const next=readTracked(); if(!next.includes(id))next.push(id);
  try{await writeTracked(next);await render(false);}catch(error){showError(error);}
}
async function removeTracked(id) {
  if(hasUnsyncedLocalGoals()){
    showError(new Error("Device-local Journey goals are waiting to be synced before the verified account list can be changed."));
    return;
  }
  try{await writeTracked(readTracked().filter((value)=>value!==id));await render(false);}catch(error){showError(error);}
}
async function syncLocalGoals() {
  if(!durableMatchesLoadedPlayer())return;
  try{await writeTracked(readLocalTracked());await render(false);}catch(error){showError(error);}
}

function showError(error) { const status=$("journeyLiveStatus"); if(status)status.textContent=error?.message||"Farm Tracker data is unavailable."; }

function init() {
  if(state.initialized)return; const panel=$("workspace-farm"); if(!panel){setTimeout(init,75);return;} state.initialized=true; installShell(panel);
  $("journeyTrackSelected")?.addEventListener("click",()=>addTracked($("journeyEventSelect")?.value));
  panel.addEventListener("click",(event)=>{const sync=event.target.closest("#journeySyncLocalGoals");if(sync){syncLocalGoals();return;}const add=event.target.closest("[data-track-journey]");if(add){addTracked(add.dataset.trackJourney);return;}const remove=event.target.closest("[data-untrack-journey]");if(remove){removeTracked(remove.dataset.untrackJourney);return;}const filter=event.target.closest("[data-journey-filter]");if(filter){viewFor(filter.dataset.journeyId).filter=filter.dataset.journeyFilter;render(false).catch(showError);}});
  panel.addEventListener("change",(event)=>{const select=event.target.closest("[data-journey-sort]");if(!select)return;viewFor(select.dataset.journeySort).sort=select.value;render(false).catch(showError);});
  panel.addEventListener("keydown",(event)=>{const row=event.target.closest("[data-inspect-base-id]");if(row&&(event.key==="Enter"||event.key===" "))row.click();});
  $("allyForm")?.addEventListener("submit",()=>{state.liveBody=null;state.lastFetch=0;setTimeout(()=>render(true).catch(showError),500);});
  document.querySelector("[data-workspace-tab='farm']")?.addEventListener("click",()=>{setTimeout(()=>render(false).catch(showError),0);});
  render(false).catch(showError);
}

init();
