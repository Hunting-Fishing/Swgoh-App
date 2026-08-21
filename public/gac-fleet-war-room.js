import { validFleetDraft } from './gac-board-v2-model.js';
import { boardSnapshot } from './gac-manual-board-workspace.js';
import {
  allocateFleetCounters,
  fleetCandidates,
  fleetRosterAvailability,
  isCapitalShip,
  normalizeId,
} from './gac-fleet-war-room-model.js';

const state = {
  contextKey: '',
  reserved: new Set(),
  evidence: null,
  plan: null,
  loading: false,
  error: '',
  briefSlot: null,
  timer: null,
  requestId: 0,
};

const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const number = new Intl.NumberFormat('en-US');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;

function contextBase(snapshot) {
  return `swgoh:gac-visible-board:v1:${snapshot?.ownerCode || 'anonymous'}:${snapshot?.opponentCode || 'manual'}:${snapshot?.round || 0}:${snapshot?.format || '5v5'}`;
}
function fleetKey(snapshot) { return `${contextBase(snapshot)}:fleet`; }
function reserveKey(snapshot) { return `${contextBase(snapshot)}:fleet-reserve`; }
function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function readFleetDrafts(snapshot) {
  return readArray(fleetKey(snapshot))
    .map(validFleetDraft)
    .filter((row) => row.complete)
    .sort((a,b) => Number(a.slot)-Number(b.slot));
}
function writeReserved(snapshot) {
  localStorage.setItem(reserveKey(snapshot), JSON.stringify([...state.reserved].sort()));
}
function syncContext(snapshot) {
  const key = contextBase(snapshot);
  if (state.contextKey === key) return;
  state.contextKey = key;
  state.reserved = new Set(readArray(reserveKey(snapshot)).map(normalizeId).filter(Boolean));
  state.evidence = null;
  state.plan = null;
  state.error = '';
  state.briefSlot = null;
}
function ships(roster = {}) {
  return (Array.isArray(roster?.units) ? roster.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() === 'ship');
}
function unitIndex(snapshot, side = 'owner') {
  const rosterShips = ships(side === 'owner' ? snapshot?.ownerRoster : snapshot?.opponentRoster);
  const catalogShips = (Array.isArray(snapshot?.catalog?.units) ? snapshot.catalog.units : []).filter((unit) => clean(unit?.unitType).toLowerCase() === 'ship');
  const rows = rosterShips.length ? rosterShips : catalogShips;
  return new Map(rows.map((unit) => [normalizeId(unit),unit]).filter(([id]) => id));
}
function imageUrl(unit = {}) {
  return clean(unit.image || unit.imageUrl || unit.portrait || unit.portraitUrl || unit.thumbnail || unit.icon);
}
function portrait(unit = {}, cls = '') {
  const name = clean(unit?.name || unit?.baseId || 'Unknown');
  const id = normalizeId(unit);
  const image = imageUrl(unit);
  return `<span class="gac-fleet-unit ${escapeAttr(cls)}" title="${escapeAttr(name)}">${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
async function fetchJson(pathname) {
  const response = await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}
async function loadEvidence(snapshot, drafts) {
  const capitals = [...new Set(drafts.map((row) => normalizeId(row.capitalShipBaseId)).filter(Boolean))];
  if (!capitals.length) return null;
  return fetchJson(`/api/gac/fleet/counters/batch?format=${encodeURIComponent(snapshot.format)}&capitals=${encodeURIComponent(capitals.join(','))}&limit=50`);
}
function assignmentForSlot(slot) {
  return (Array.isArray(state.plan?.assignments) ? state.plan.assignments : []).find((row) => Number(row?.slot) === Number(slot)) || null;
}
function candidatePool(snapshot, defense) {
  return fleetCandidates(snapshot.ownerRoster, snapshot.catalog, defense, state.evidence || {}, {reservedBaseIds:[...state.reserved]});
}
function observedPercent(value) {
  return value == null ? '—' : `${Math.round(n(value)*1000)/10}% observed`;
}
function formatDate(value) {
  if (!value) return 'date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? clean(value) : date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function recommendationMarkup(snapshot, assignment) {
  const recommendation = assignment?.recommendation;
  if (!recommendation) return '';
  const index = unitIndex(snapshot,'owner');
  const capital = index.get(normalizeId(recommendation.counterCapitalShipBaseId)) || recommendation.fleet.find((unit) => normalizeId(unit) === normalizeId(recommendation.counterCapitalShipBaseId)) || {baseId:recommendation.counterCapitalShipBaseId,name:recommendation.counterCapitalShipBaseId};
  const members = recommendation.counterMembers
    .filter((id) => normalizeId(id) !== normalizeId(recommendation.counterCapitalShipBaseId))
    .map((id) => index.get(normalizeId(id)) || recommendation.fleet.find((unit) => normalizeId(unit) === normalizeId(id)) || {baseId:id,name:id});
  return `<div class="gac-fleet-counter-line"><div class="gac-fleet-capital">${portrait(capital,'is-capital')}<b>CAPITAL</b></div><div class="gac-fleet-counter-ships">${members.map((unit)=>portrait(unit,'is-counter')).join('')}</div></div>`;
}
function decorateFleetCards(snapshot, drafts) {
  const root = document.querySelector('[data-gac-board-v2]');
  if (!root) return;
  for (const defense of drafts) {
    const edit = root.querySelector(`[data-gac-board-v2-fleet-edit="${defense.slot}"]`);
    const card = edit?.closest('.gac-board-v2-slot.is-fleet');
    const gate = card?.querySelector('.gac-board-v2-fleet-gate');
    if (!card || !gate) continue;
    const assignment = assignmentForSlot(defense.slot);
    const candidates = candidatePool(snapshot, defense);
    const actionable = candidates.filter((row) => row.actionable);
    const ownedBlocked = candidates.find((row) => row.compositionMatch?.actionable && row.reliability?.automatic && !row.available);
    if (assignment?.recommendation) {
      const rec = assignment.recommendation;
      gate.className = 'gac-board-v2-fleet-gate gac-fleet-gate is-evidence';
      gate.innerHTML = `<div><strong>HISTORICAL FLEET COUNTER</strong><span>${escapeHtml(rec.compositionMatch.label)} · ${rec.wins}/${rec.battles} observed wins · ${escapeHtml(observedPercent(rec.observedWinRate))}</span></div>${recommendationMarkup(snapshot,assignment)}<p>${escapeHtml(assignment.allocationReason)}</p><button type="button" data-gac-fleet-brief="${defense.slot}">Open Fleet Attack Brief</button>`;
    } else if (ownedBlocked) {
      gate.className = 'gac-board-v2-fleet-gate gac-fleet-gate is-blocked';
      const reason = ownedBlocked.missingBaseIds.length
        ? `Missing required ships: ${ownedBlocked.missingBaseIds.join(', ')}`
        : `Reserved/allocated conflict: ${ownedBlocked.reserveUses.join(', ')}`;
      gate.innerHTML = `<strong>FLEET EVIDENCE FOUND · ROSTER BLOCKED</strong><span>${escapeHtml(reason)}</span><small>${actionable.length} actionable owned alternatives remain after current reserves.</small>`;
    } else if (candidates.length) {
      const best = candidates[0];
      gate.className = 'gac-board-v2-fleet-gate gac-fleet-gate is-supporting';
      gate.innerHTML = `<strong>SUPPORTING FLEET HISTORY · NOT AUTO-ALLOCATED</strong><span>${escapeHtml(best.compositionMatch.label)} · ${best.wins}/${best.battles} observed wins</span><small>Command Center requires positive actionable composition evidence plus an owned non-overlapping fleet before allocating.</small>`;
    } else {
      gate.className = 'gac-board-v2-fleet-gate gac-fleet-gate is-empty';
      gate.innerHTML = `<strong>NO ACTIONABLE FLEET EVIDENCE LOADED</strong><span>The enemy fleet identity is saved, but no compatible historical counter is currently in the evidence warehouse.</span>`;
    }
  }
}
function fleetOrderHtml(snapshot, drafts) {
  if (!drafts.length) return '<p class="gac-fleet-note">Reveal and enter an enemy fleet to build fleet allocation.</p>';
  return drafts.map((defense,index) => {
    const assignment = assignmentForSlot(defense.slot);
    const enemyIndex = unitIndex(snapshot,'opponent');
    const enemyCapital = enemyIndex.get(normalizeId(defense.capitalShipBaseId)) || {baseId:defense.capitalShipBaseId,name:defense.capitalShipBaseId};
    if (!assignment?.recommendation) {
      return `<article class="gac-fleet-order-row is-blocked"><b>${index+1}</b><div><span>FLEET SLOT ${defense.slot+1}</span><strong>${escapeHtml(enemyCapital.name || defense.capitalShipBaseId)}</strong><small>No evidence-backed owned counter allocated.</small></div><em>BLOCKED</em></article>`;
    }
    const rec = assignment.recommendation;
    const ownerIndex = unitIndex(snapshot,'owner');
    const counterCapital = ownerIndex.get(normalizeId(rec.counterCapitalShipBaseId)) || {baseId:rec.counterCapitalShipBaseId,name:rec.counterCapitalShipBaseId};
    return `<article class="gac-fleet-order-row is-ready"><b>${index+1}</b><div><span>FLEET SLOT ${defense.slot+1}</span><strong>${escapeHtml(enemyCapital.name || defense.capitalShipBaseId)}</strong><small>${escapeHtml(rec.reliability.label)} · ${rec.wins}/${rec.battles} observed wins</small></div><div class="gac-fleet-order-counter">${portrait(counterCapital,'is-counter')}<em>ALLOCATED</em></div></article>`;
  }).join('');
}
function reserveHtml(snapshot) {
  if (!snapshot.ownerRoster) return '<p class="gac-fleet-note">Load your roster before reserving own-defense fleet resources.</p>';
  const availability = fleetRosterAvailability(snapshot.ownerRoster,state.plan || {},[...state.reserved]);
  const rows = availability.rows.slice(0,120);
  return `<details class="gac-fleet-reserve"><summary><span>OWN-DEFENSE FLEET RESERVE</span><strong>${availability.counts.reserved} reserved · ${availability.counts.allocated} allocated · ${availability.counts.available} available</strong></summary><p>Manually reserve ships you placed on your own GAC defense. Fleet defense persistence is not canonical yet, so these marks stay local to this opponent/round.</p><div class="gac-fleet-reserve-actions"><button type="button" data-gac-fleet-clear-reserves ${state.reserved.size?'':'disabled'}>Clear Local Reserves</button></div><div class="gac-fleet-reserve-grid">${rows.map((row) => `<button type="button" class="is-${row.status} ${row.capitalShip?'is-capital':''}" data-gac-fleet-toggle-reserve="${escapeAttr(row.baseId)}">${portrait(row.unit)}<span><strong>${escapeHtml(row.unit?.name || row.baseId)}</strong><small>${row.capitalShip?'Capital ship · ':''}${number.format(n(row.unit?.power))} GP</small></span><b>${row.status==='reserved'?'DEFENSE RESERVED':row.status==='allocated'?'ATTACK ALLOCATED':'AVAILABLE'}</b></button>`).join('')}</div></details>`;
}
function crewRowsHtml(readiness = []) {
  return readiness.map((row) => {
    const crew = row.crew;
    const crewText = crew.crewless
      ? 'Crewless ship'
      : !crew.known
        ? 'Crew mapping unavailable'
        : crew.crew.map((member) => `${member.name}: ${member.owned ? `R${member.relic ?? '—'} / G${member.gear ?? '—'}` : 'not owned'}`).join(' · ');
    return `<article><strong>${escapeHtml(row.name)}</strong><span>Ship readiness ${row.intrinsicScore}%${row.power == null?'':` · ${number.format(row.power)} GP`}</span><small>${escapeHtml(crewText)}</small></article>`;
  }).join('');
}
function briefHtml(snapshot,drafts) {
  if (state.briefSlot == null) return '';
  const defense = drafts.find((row) => Number(row.slot) === Number(state.briefSlot));
  const assignment = assignmentForSlot(state.briefSlot);
  const rec = assignment?.recommendation;
  if (!defense || !rec) return '';
  const enemyIndex = unitIndex(snapshot,'opponent');
  const enemyCapital = enemyIndex.get(normalizeId(defense.capitalShipBaseId)) || {baseId:defense.capitalShipBaseId,name:defense.capitalShipBaseId};
  return `<section class="gac-fleet-brief"><header><div><span>FLEET ATTACK BRIEF</span><strong>vs ${escapeHtml(enemyCapital.name || defense.capitalShipBaseId)} · Fleet Slot ${defense.slot+1}</strong><small>Evidence-backed fleet identity and allocation. Historical observed rate is not a predicted win probability.</small></div><button type="button" data-gac-fleet-close-brief>Close</button></header><div class="gac-fleet-brief-metrics"><div><span>COMPOSITION MATCH</span><strong>${escapeHtml(rec.compositionMatch.label)}</strong></div><div><span>HISTORICAL SAMPLE</span><strong>${rec.wins}/${rec.battles} wins · ${escapeHtml(observedPercent(rec.observedWinRate))}</strong></div><div><span>RELIABILITY</span><strong>${escapeHtml(rec.reliability.label)}</strong></div><div><span>LAST OBSERVED</span><strong>${escapeHtml(formatDate(rec.lastObservedAt))}</strong></div></div><div class="gac-fleet-brief-counter"><span>ALLOCATED ATTACK FLEET</span>${recommendationMarkup(snapshot,assignment)}<p>${escapeHtml(assignment.allocationReason)}</p></div><div class="gac-fleet-readiness"><span>SHIP + CREW READINESS</span>${crewRowsHtml(rec.readiness)}</div><div class="gac-fleet-source"><strong>PROVENANCE</strong><span>${escapeHtml(rec.evidenceSources.join(', ') || 'Persisted GAC fleet history')} · seasons ${escapeHtml(rec.seasons.join(', ') || 'unavailable')}</span><small>Persisted history retains capital ship and fleet member identities, but not starter-vs-reinforcement role labels. The matchup is therefore scoped as ${escapeHtml(rec.compositionMatch.key)}.</small></div><div class="gac-fleet-execution-gate"><strong>EXECUTION GUIDANCE · SOURCE GATED</strong><span>No opening sequence, reinforcement call order, target priority, or timing instruction is generated here unless a versioned fleet tactic source is attached.</span></div></section>`;
}
function commandHtml(snapshot,drafts) {
  const allocated = state.plan?.allocatedFleetCount || 0;
  const battleSamples = n(state.evidence?.battleSamples);
  const evidenceSources = Array.isArray(state.evidence?.evidenceSources) ? state.evidence.evidenceSources : [];
  return `<section class="gac-fleet-command" data-gac-fleet-command><header><div><span>FLEET WAR ROOM · B12/B13</span><strong>Evidence-backed capital-ship allocation</strong><p>Historical fleet battles are matched against the visible enemy fleet and your owned ships. No roster-fit fleet guess is generated when evidence is absent.</p></div><div class="${state.error?'is-error':state.loading?'is-loading':allocated?'is-ready':''}"><b>${state.loading?'LOADING EVIDENCE':state.error?'EVIDENCE UNAVAILABLE':allocated?'FLEET PLAN READY':'AWAITING ACTIONABLE EVIDENCE'}</b><strong>${allocated}/${drafts.length}</strong><small>fleet counters allocated · ${number.format(battleSamples)} historical battle samples</small></div></header>${state.error?`<div class="gac-fleet-error"><strong>Fleet evidence request failed</strong><span>${escapeHtml(state.error)}</span></div>`:''}<div class="gac-fleet-truth"><div><span>COUNTER SOURCE</span><strong>Historical fleet battles only</strong></div><div><span>RESOURCE LOCK</span><strong>Capital + ships cannot overlap</strong></div><div><span>DATACRONS</span><strong>Excluded from fleet mode</strong></div><div><span>EVIDENCE SOURCES</span><strong>${escapeHtml(evidenceSources.join(', ') || 'None loaded')}</strong></div></div><section class="gac-fleet-order"><header><span>FLEET ATTACK ALLOCATION</span><strong>${drafts.length} visible fleet defense${drafts.length===1?'':'s'}</strong></header><div>${fleetOrderHtml(snapshot,drafts)}</div></section>${reserveHtml(snapshot)}${briefHtml(snapshot,drafts)}</section>`;
}
function render(snapshot,drafts) {
  const board = document.querySelector('[data-gac-board-v2]');
  if (!board) return;
  decorateFleetCards(snapshot,drafts);
  let host = board.querySelector('[data-gac-fleet-command]');
  const markup = commandHtml(snapshot,drafts);
  if (host) host.outerHTML = markup;
  else {
    const attackOrder = board.querySelector('.gac-board-v2-attack-order');
    if (attackOrder) attackOrder.insertAdjacentHTML('afterend',markup);
    else board.insertAdjacentHTML('beforeend',markup);
  }
}
async function refresh() {
  const snapshot = boardSnapshot();
  if (!snapshot?.rule) return;
  syncContext(snapshot);
  const drafts = readFleetDrafts(snapshot);
  const requestId = ++state.requestId;
  if (!drafts.length || !snapshot.ownerRoster) {
    state.evidence = null;
    state.plan = null;
    state.loading = false;
    state.error = '';
    render(snapshot,drafts);
    return;
  }
  state.loading = true;
  state.error = '';
  render(snapshot,drafts);
  try {
    const evidence = await loadEvidence(snapshot,drafts);
    if (requestId !== state.requestId) return;
    state.evidence = evidence;
    state.plan = allocateFleetCounters(snapshot.ownerRoster,snapshot.catalog,drafts,evidence || {},{reservedBaseIds:[...state.reserved]});
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.evidence = null;
    state.plan = null;
    state.error = clean(error?.message || error || 'Fleet counter evidence unavailable');
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      render(snapshot,drafts);
      window.dispatchEvent(new CustomEvent('gac-fleet-plan-updated',{detail:{allocated:state.plan?.allocatedFleetCount||0,fleets:drafts.length}}));
    }
  }
}
function rebuildFromCurrentEvidence() {
  const snapshot = boardSnapshot();
  if (!snapshot?.rule) return;
  const drafts = readFleetDrafts(snapshot);
  state.plan = snapshot.ownerRoster && state.evidence
    ? allocateFleetCounters(snapshot.ownerRoster,snapshot.catalog,drafts,state.evidence,{reservedBaseIds:[...state.reserved]})
    : null;
  render(snapshot,drafts);
}
function bind() {
  if (document.documentElement.dataset.gacFleetWarRoomBound === 'true') return;
  document.documentElement.dataset.gacFleetWarRoomBound = 'true';
  document.addEventListener('click',(event) => {
    const reserve = event.target.closest?.('[data-gac-fleet-toggle-reserve]');
    if (reserve) {
      const snapshot = boardSnapshot();
      const id = normalizeId(reserve.dataset.gacFleetToggleReserve);
      if (state.reserved.has(id)) state.reserved.delete(id); else state.reserved.add(id);
      writeReserved(snapshot);
      rebuildFromCurrentEvidence();
      return;
    }
    if (event.target.closest?.('[data-gac-fleet-clear-reserves]')) {
      const snapshot = boardSnapshot();
      state.reserved.clear(); writeReserved(snapshot); rebuildFromCurrentEvidence(); return;
    }
    const brief = event.target.closest?.('[data-gac-fleet-brief]');
    if (brief) { state.briefSlot=Number(brief.dataset.gacFleetBrief); rebuildFromCurrentEvidence(); document.querySelector('.gac-fleet-brief')?.scrollIntoView?.({behavior:'smooth',block:'center'}); return; }
    if (event.target.closest?.('[data-gac-fleet-close-brief]')) { state.briefSlot=null; rebuildFromCurrentEvidence(); return; }
  },true);
  window.addEventListener('gac-board-v2-rendered',()=>schedule(40));
  window.addEventListener('gac-v2-matchup-loaded',()=>schedule(120));
  window.addEventListener('gac-board-evidence-updated',()=>schedule(120));
  document.addEventListener('change',(event)=>{
    if (event.target?.matches?.('[data-gac-board-league],[data-gac-board-format],[data-gacv2-round],[data-gacv2-opponent],[data-gacv2-mode]') || event.target?.id === 'allyCode') schedule(160);
  },true);
}
function schedule(delay=80) {
  clearTimeout(state.timer);
  state.timer=setTimeout(()=>void refresh(),Math.max(0,delay));
}
function injectStyle() {
  if (document.querySelector('link[data-gac-fleet-war-room-style]')) return;
  const link=document.createElement('link'); link.rel='stylesheet'; link.href='/gac-fleet-war-room.css?v=20260821-b13'; link.dataset.gacFleetWarRoomStyle='true'; document.head.appendChild(link);
}

if (typeof document !== 'undefined') {
  injectStyle(); bind(); schedule(320);
  document.addEventListener('DOMContentLoaded',()=>schedule(120),{once:true});
  new MutationObserver(()=>{ if(document.querySelector('[data-gac-board-v2]') && !document.querySelector('[data-gac-fleet-command]')) schedule(80); }).observe(document.documentElement,{childList:true,subtree:true});
}

export { contextBase, fleetKey, reserveKey, readFleetDrafts };
