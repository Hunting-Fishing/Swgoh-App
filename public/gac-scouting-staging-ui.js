import { boardSnapshot, openSquadSlot } from './gac-manual-board-workspace.js';
import { normalizeId, normalizeMembers, rosterIndex } from './gac-counter-matrix-model.js';
import { buildStagingPlan } from './gac-scouting-history-model.js';

const state = { loading:false, error:'', report:null, plan:null, allowZoneFallback:false, open:false, loadedKey:'' };
const clean = (value) => String(value ?? '').trim();
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const escapeAttr = escapeHtml;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function allyCode(value) {
  const code = clean(value).replace(/\D/g, '').slice(0,9);
  return /^\d{9}$/.test(code) ? code : '';
}
function opponentCode(snapshot = {}) {
  return allyCode(snapshot?.opponentCode || document.querySelector('[data-gac-manual-opponent]')?.value || document.querySelector('[data-gacv2-opponent]')?.value || document.getElementById('gacOpponentCode')?.value);
}
function format(snapshot = {}) {
  const raw = clean(snapshot?.format || snapshot?.rule?.format || '5v5').toLowerCase();
  return raw === '3v3' || raw === '3' ? '3v3' : '5v5';
}
async function fetchJson(pathname) {
  const response = await fetch(pathname, { cache:'no-store', credentials:'same-origin', headers:{ Accept:'application/json' } });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) { const error = new Error(body?.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
  return body;
}
function indexFor(snapshot = {}) {
  const index = rosterIndex(snapshot?.opponentRoster || {});
  for (const unit of Array.isArray(snapshot?.catalog?.units) ? snapshot.catalog.units : []) {
    const id = normalizeId(unit);
    if (id && !index.has(id)) index.set(id, unit);
  }
  return index;
}
function nameFor(index, id) { return clean(index.get(normalizeId(id))?.name || normalizeId(id) || 'Unknown'); }
function imageFor(index, id) {
  const unit = index.get(normalizeId(id)) || {};
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function portrait(index, id, leader=false) {
  const name = nameFor(index,id);
  const image = imageFor(index,id);
  return `<span class="gac-stage-unit ${leader?'is-leader':''}" title="${escapeAttr(name)}">${image?`<img src="${escapeAttr(image)}" alt="" loading="lazy">`:`<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function zoneLabel(zone) { return ({'FRONT-TOP':'Front Top','FRONT-BOTTOM':'Front Bottom','BACK-BOTTOM':'Rear Bottom'})[clean(zone).toUpperCase()] || clean(zone); }

async function build() {
  if (state.loading) return;
  const snapshot = boardSnapshot();
  const code = opponentCode(snapshot);
  if (!code) { state.error = 'Load an opponent Ally Code before staging historical defenses.'; state.open = true; render(); return; }
  state.loading = true; state.error=''; state.open=true; render();
  try {
    state.report = await fetchJson(`/api/gac/scouting/${code}?limit=2500&import=0`);
    state.plan = buildStagingPlan(state.report, snapshot, { allowZoneFallback:state.allowZoneFallback });
    state.loadedKey = `${code}|${format(snapshot)}|${state.allowZoneFallback?'zone':'exact'}`;
  } catch (error) {
    state.report = null; state.plan = null; state.error = clean(error?.message || error || 'Historical staging is unavailable.');
  } finally { state.loading=false; render(); }
}

async function fillEditor(row) {
  const leader = normalizeId(row?.leaderBaseId);
  const members = [leader, ...normalizeMembers(row?.members).filter((id)=>id!==leader)].filter(Boolean);
  if (!openSquadSlot(clean(row?.zone).toUpperCase(), Number(row?.slot))) return;
  await sleep(90);
  for (const id of members) {
    const input = document.querySelector('[data-gac-board-search]');
    if (!input) break;
    input.value = id;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    await sleep(45);
    const add = document.querySelector(`[data-gac-board-add-unit="${CSS.escape(id)}"]`);
    add?.click();
    await sleep(45);
  }
  const makeLeader = document.querySelector(`[data-gac-board-make-leader="${CSS.escape(leader)}"]`);
  if (makeLeader && !makeLeader.disabled) makeLeader.click();
  document.querySelector('[data-gac-board-editor-host]')?.scrollIntoView?.({ behavior:'smooth', block:'center' });
}

function rowMarkup(row, index, position) {
  const source = row.exactSlot ? 'VERIFIED SLOT' : 'VERIFIED ZONE · SLOT INFERRED';
  return `<article class="gac-stage-row ${row.exactSlot?'is-exact':'is-zone'}"><header><div><span>#${position} ${escapeHtml(source)}</span><strong>${escapeHtml(nameFor(index,row.leaderBaseId))}</strong><small>${escapeHtml(zoneLabel(row.zone))} · Slot ${Number(row.slot)+1} · ${row.verifiedHistoricalBoards || row.verifiedSamples || 0} historical board samples</small></div><i>${row.exactSlot?'REVIEW':'CONFIRM SLOT'}</i></header><div class="gac-stage-team">${row.members.map((id)=>portrait(index,id,normalizeId(id)===normalizeId(row.leaderBaseId))).join('')}</div><footer><div><span>${row.lastSeenAt?`Last seen ${escapeHtml(new Date(row.lastSeenAt).toLocaleDateString())}`:'Historical evidence'}</span><small>${row.latestVerifiedDatacron?'Historical Datacron observed; reconfirm the current DC in-game.':'No current Datacron claim.'}</small></div><button type="button" data-gac-stage-review data-stage-index="${position-1}">REVIEW THIS SLOT</button></footer></article>`;
}

function ensureRoot() {
  const scouting = document.querySelector('[data-gac-scout-history]');
  const matrix = document.querySelector('[data-gac-counter-matrix]');
  const host = scouting || matrix || document.querySelector('.gac-manual-enemy-board');
  if (!host) return null;
  let root = document.querySelector('[data-gac-scout-staging]');
  if (!root) { root=document.createElement('section'); root.className='gac-scout-staging'; root.dataset.gacScoutStaging='true'; host.insertAdjacentElement('afterend',root); }
  if (scouting && scouting.nextElementSibling !== root) scouting.insertAdjacentElement('afterend',root);
  return root;
}

function render() {
  const root = ensureRoot(); if (!root) return;
  const snapshot = boardSnapshot();
  const key = `${opponentCode(snapshot)}|${format(snapshot)}|${state.allowZoneFallback?'zone':'exact'}`;
  if (state.loadedKey && key !== state.loadedKey) { state.loadedKey=''; state.report=null; state.plan=null; state.open=false; state.error=''; }
  const index = indexFor(snapshot);
  const staged = Array.isArray(state.plan?.staged) ? state.plan.staged : [];
  root.innerHTML = `<header><div><span>HISTORICAL BOARD STAGING</span><strong>Review prior defenses without claiming hidden-board truth</strong><small>Nothing is saved automatically. Each historical suggestion must be reviewed against the game before you save the current board.</small></div><div>${state.loadedKey?`<button type="button" data-gac-stage-toggle>${state.open?'HIDE':'VIEW · '+staged.length}</button>`:''}<button type="button" data-gac-stage-build ${state.loading?'disabled':''}>${state.loading?'BUILDING…':state.loadedKey?'REBUILD STAGING':'BUILD HISTORICAL DRAFT'}</button></div></header><label class="gac-stage-fallback"><input type="checkbox" data-gac-stage-fallback ${state.allowZoneFallback?'checked':''}><span>Allow verified-zone fallback when exact historical slot evidence is unavailable</span><small>Off by default. Zone-only rows never claim the historical slot was verified.</small></label>${state.error?`<div class="gac-stage-error">${escapeHtml(state.error)}</div>`:''}${state.open && state.plan?`<div class="gac-stage-summary"><b>${staged.length}</b><span>reviewable historical suggestions</span><small>${state.plan.exactSlotCount || 0} exact-slot · ${state.plan.zoneOnlyCount || 0} zone-only · ${state.plan.skipped?.length || 0} skipped/occupied</small></div><div class="gac-stage-grid">${staged.length?staged.map((row,i)=>rowMarkup(row,index,i+1)).join(''):'<div class="gac-stage-empty">No open historical suggestions meet the current staging rules.</div>'}</div>`:''}`;
}

function installScoutingStaging() {
  if (window.__gacScoutingStagingInstalled) return;
  window.__gacScoutingStagingInstalled = true;
  document.addEventListener('click',(event)=>{
    if (!event.target?.closest?.('[data-gac-scout-staging]')) return;
    if (event.target.closest('[data-gac-stage-build]')) { void build(); return; }
    if (event.target.closest('[data-gac-stage-toggle]')) { state.open=!state.open; render(); return; }
    const review=event.target.closest('[data-gac-stage-review]');
    if (review) { const row=state.plan?.staged?.[Number(review.dataset.stageIndex)]; if (row) void fillEditor(row); }
  });
  document.addEventListener('change',(event)=>{
    if (!event.target?.closest?.('[data-gac-scout-staging]')) return;
    if (event.target.matches('[data-gac-stage-fallback]')) { state.allowZoneFallback=event.target.checked===true; state.loadedKey=''; state.plan=null; state.report=null; render(); }
  });
  const tick=()=>{ if (location.hash && location.hash!=='#gac') return; render(); };
  tick(); document.addEventListener('DOMContentLoaded',tick,{once:true}); window.addEventListener('hashchange',tick); window.addEventListener('gac-visible-board-rendered',tick);
}

if (typeof window!=='undefined' && typeof document!=='undefined') installScoutingStaging();
export { build, fillEditor, installScoutingStaging };
