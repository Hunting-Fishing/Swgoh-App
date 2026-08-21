import { validFleetDraft } from './gac-board-v2-model.js';
import { boardSnapshot } from './gac-manual-board-workspace.js';
import { normalizeId } from './gac-fleet-war-room-model.js';

const state = {
  contextKey: '',
  initialized: false,
  syncing: false,
  timer: null,
  requestId: 0,
  canonicalBySlot: new Map(),
  ownDefenseFleets: [],
  status: 'local-fallback',
  error: '',
  ignoreDiffUntil: 0,
};

const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g, '').slice(0,9);

function contextBase(snapshot) {
  return `swgoh:gac-visible-board:v1:${snapshot?.ownerCode || 'anonymous'}:${snapshot?.opponentCode || 'manual'}:${snapshot?.round || 0}:${snapshot?.format || '5v5'}`;
}
function fleetKey(snapshot) { return `${contextBase(snapshot)}:fleet`; }
function reserveKey(snapshot) { return `${contextBase(snapshot)}:fleet-reserve`; }
function canonicalReady(snapshot) {
  return /^\d{9}$/.test(allyCode(snapshot?.ownerCode))
    && /^\d{9}$/.test(allyCode(snapshot?.opponentCode))
    && [1,2,3].includes(Number(snapshot?.round));
}
function readRows(key) {
  try {
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
function localDrafts(snapshot) {
  return readRows(fleetKey(snapshot)).map(validFleetDraft).filter((row) => row.complete).sort((a,b)=>Number(a.slot)-Number(b.slot));
}
function canonicalDraft(row = {}, opponentCode = '') {
  return validFleetDraft({
    id: String(row.id ?? ''),
    zone: clean(row.zone || 'BACK-TOP'),
    slot: row.slot,
    capitalShipBaseId: row.capitalShipBaseId,
    starters: row.starters,
    reinforcements: row.reinforcements,
    source: clean(row.source || 'user-confirmed-current-fleet-board'),
    observedAt: clean(row.observedAt),
    opponentAllyCode: allyCode(opponentCode),
  });
}
function compositionKey(row = {}) {
  const draft = validFleetDraft(row);
  return [
    Number(draft.slot),
    normalizeId(draft.capitalShipBaseId),
    [...draft.starters].map(normalizeId).sort().join(','),
    [...draft.reinforcements].map(normalizeId).sort().join(','),
  ].join('|');
}
async function fetchJson(pathname, options = {}) {
  const response = await fetch(pathname, {
    cache:'no-store',
    credentials:'same-origin',
    headers:{Accept:'application/json', ...(options.body ? {'Content-Type':'application/json'} : {})},
    ...options,
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}
function endpoint(snapshot, owner = 'defense') {
  return `/api/gac/current-fleet-board/${allyCode(snapshot.ownerCode)}/${owner}`;
}
async function postFleet(snapshot, row, owner = 'defense') {
  const draft = validFleetDraft(row);
  return fetchJson(endpoint(snapshot,owner), {
    method:'POST',
    body:JSON.stringify({
      round:Number(snapshot.round),
      opponentAllyCode:allyCode(snapshot.opponentCode),
      slot:Number(draft.slot),
      capitalShipBaseId:normalizeId(draft.capitalShipBaseId),
      starters:draft.starters.map(normalizeId),
      reinforcements:draft.reinforcements.map(normalizeId),
    }),
  });
}
async function deleteFleet(snapshot, id, owner = 'defense') {
  return fetchJson(endpoint(snapshot,owner), {method:'DELETE',body:JSON.stringify({round:Number(snapshot.round),id:Number(id)})});
}
function ownDefenseReserveIds(rows = []) {
  return [...new Set(rows.flatMap((row) => [row.capitalShipBaseId, ...(row.starters || []), ...(row.reinforcements || [])].map(normalizeId).filter(Boolean)))];
}
function publish(snapshot) {
  const detail = Object.freeze({
    status: state.status,
    error: state.error,
    canonical: state.status === 'canonical',
    enemyFleets: Object.freeze([...state.canonicalBySlot.values()]),
    ownDefenseFleets: Object.freeze(state.ownDefenseFleets),
    ownDefenseReserveIds: Object.freeze(ownDefenseReserveIds(state.ownDefenseFleets)),
    ownerCode: allyCode(snapshot?.ownerCode),
    opponentCode: allyCode(snapshot?.opponentCode),
    round: Number(snapshot?.round) || null,
  });
  window.__gacFleetCanonicalState = detail;
  window.dispatchEvent(new CustomEvent('gac-fleet-canonical-updated',{detail}));
}
function hydrateLocal(snapshot, canonicalRows, preserveRows = []) {
  const bySlot = new Map();
  for (const row of preserveRows.map(validFleetDraft).filter((row)=>row.complete)) bySlot.set(Number(row.slot), row);
  for (const row of canonicalRows) bySlot.set(Number(row.slot), canonicalDraft(row,snapshot.opponentCode));
  const rows = [...bySlot.values()].sort((a,b)=>Number(a.slot)-Number(b.slot));
  localStorage.setItem(fleetKey(snapshot),JSON.stringify(rows));
  state.ignoreDiffUntil = Date.now()+700;
  try { window.dispatchEvent(new HashChangeEvent('hashchange')); }
  catch { window.dispatchEvent(new Event('hashchange')); }
}
async function loadCanonical(snapshot, {migrateLocal = false} = {}) {
  const requestId = ++state.requestId;
  const local = localDrafts(snapshot);
  const [enemy,own] = await Promise.all([
    fetchJson(`${endpoint(snapshot,'defense')}?round=${Number(snapshot.round)}`),
    fetchJson(`${endpoint(snapshot,'my-defense')}?round=${Number(snapshot.round)}`),
  ]);
  if (requestId !== state.requestId) return;
  let enemyRows = Array.isArray(enemy?.fleets) ? enemy.fleets : [];
  if (migrateLocal) {
    const canonicalSlots = new Set(enemyRows.map((row)=>Number(row.slot)));
    for (const row of local) {
      const same = enemyRows.find((value)=>Number(value.slot)===Number(row.slot) && compositionKey(value)===compositionKey(row));
      if (same) continue;
      if (!canonicalSlots.has(Number(row.slot)) || !same) await postFleet(snapshot,row,'defense');
    }
    if (local.length) {
      const reloaded = await fetchJson(`${endpoint(snapshot,'defense')}?round=${Number(snapshot.round)}`);
      enemyRows = Array.isArray(reloaded?.fleets) ? reloaded.fleets : [];
    }
  }
  state.canonicalBySlot = new Map(enemyRows.map((row)=>[Number(row.slot),row]));
  state.ownDefenseFleets = Array.isArray(own?.fleets) ? own.fleets : [];
  state.status = 'canonical';
  state.error = '';
  const canonicalReserve = ownDefenseReserveIds(state.ownDefenseFleets);
  if (state.ownDefenseFleets.length) localStorage.setItem(reserveKey(snapshot),JSON.stringify(canonicalReserve));
  hydrateLocal(snapshot,enemyRows,[]);
  publish(snapshot);
}
async function initialize(snapshot) {
  if (!canonicalReady(snapshot)) {
    state.initialized = true;
    state.status = 'local-fallback';
    state.error = 'Confirm the current opponent and round to enable canonical fleet persistence.';
    publish(snapshot);
    return;
  }
  state.syncing = true;
  try {
    await loadCanonical(snapshot,{migrateLocal:true});
  } catch (error) {
    state.status = 'local-fallback';
    state.error = clean(error?.message || error || 'Canonical fleet persistence unavailable');
    publish(snapshot);
  } finally {
    state.initialized = true;
    state.syncing = false;
  }
}
async function reconcile(snapshot) {
  if (!state.initialized || state.syncing || state.status !== 'canonical' || Date.now() < state.ignoreDiffUntil) return;
  const local = localDrafts(snapshot);
  const localBySlot = new Map(local.map((row)=>[Number(row.slot),row]));
  const operations = [];
  for (const row of local) {
    const canonical = state.canonicalBySlot.get(Number(row.slot));
    if (!canonical || compositionKey(canonical) !== compositionKey(row)) operations.push(postFleet(snapshot,row,'defense'));
  }
  for (const [slot,row] of state.canonicalBySlot) {
    if (!localBySlot.has(slot) && row?.id != null) operations.push(deleteFleet(snapshot,row.id,'defense'));
  }
  if (!operations.length) return;
  state.syncing = true;
  try {
    await Promise.all(operations);
    await loadCanonical(snapshot);
  } catch (error) {
    state.error = clean(error?.message || error || 'Fleet board sync failed');
    publish(snapshot);
  } finally { state.syncing=false; }
}
function syncContext(snapshot) {
  const key = contextBase(snapshot);
  if (state.contextKey === key) return false;
  state.contextKey = key;
  state.initialized = false;
  state.syncing = false;
  state.canonicalBySlot = new Map();
  state.ownDefenseFleets = [];
  state.status = 'local-fallback';
  state.error = '';
  state.ignoreDiffUntil = 0;
  return true;
}
async function run() {
  const snapshot = boardSnapshot();
  if (!snapshot?.rule) return;
  syncContext(snapshot);
  if (!state.initialized) await initialize(snapshot);
  else await reconcile(snapshot);
}
function schedule(delay=100) {
  clearTimeout(state.timer);
  state.timer=setTimeout(()=>void run(),Math.max(0,delay));
}

if (typeof document !== 'undefined') {
  window.addEventListener('gac-board-v2-rendered',()=>schedule(120));
  window.addEventListener('gac-v2-matchup-loaded',()=>schedule(180));
  window.addEventListener('gac-board-evidence-updated',()=>schedule(180));
  document.addEventListener('change',(event)=>{
    if (event.target?.matches?.('[data-gacv2-round],[data-gacv2-opponent],[data-gacv2-mode]') || event.target?.id==='allyCode') schedule(220);
  },true);
  document.addEventListener('DOMContentLoaded',()=>schedule(250),{once:true});
  schedule(500);
}

export {
  canonicalDraft,
  canonicalReady,
  compositionKey,
  contextBase,
  deleteFleet,
  endpoint,
  fleetKey,
  localDrafts,
  ownDefenseReserveIds,
  postFleet,
  reserveKey,
};
