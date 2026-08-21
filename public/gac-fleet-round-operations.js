import { validFleetDraft } from './gac-board-v2-model.js';
import { boardSnapshot } from './gac-manual-board-workspace.js';
import {
  allocateFleetCounters,
  isCapitalShip,
  normalizeId,
} from './gac-fleet-war-room-model.js';

const state = {
  contextKey: '',
  enemyFleets: [],
  ownDefenseFleets: [],
  assignments: [],
  evidence: null,
  planner: null,
  loading: false,
  error: '',
  roleEditor: null,
  ownEditor: null,
  timer: null,
  requestId: 0,
  archiveBusy: new Set(),
  archivedKeys: new Set(),
};

const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g,'').slice(0,9);
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const number = new Intl.NumberFormat('en-US');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;

function contextKey(snapshot) {
  return `${allyCode(snapshot?.ownerCode) || 'anonymous'}:${allyCode(snapshot?.opponentCode) || 'manual'}:${Number(snapshot?.round) || 0}:${snapshot?.format || '5v5'}`;
}
function canonicalReady(snapshot) {
  return /^\d{9}$/.test(allyCode(snapshot?.ownerCode))
    && /^\d{9}$/.test(allyCode(snapshot?.opponentCode))
    && [1,2,3].includes(Number(snapshot?.round));
}
function localReserveKey(snapshot) {
  return `swgoh:gac-visible-board:v1:${snapshot?.ownerCode || 'anonymous'}:${snapshot?.opponentCode || 'manual'}:${snapshot?.round || 0}:${snapshot?.format || '5v5'}:fleet-reserve`;
}
function normalizeFleetRow(row = {}) {
  return validFleetDraft({
    id: String(row.id ?? ''),
    zone: clean(row.zone || 'BACK-TOP'),
    slot: Number(row.slot),
    capitalShipBaseId: normalizeId(row.capitalShipBaseId),
    starters: Array.isArray(row.starters) ? row.starters.map(normalizeId) : [],
    reinforcements: Array.isArray(row.reinforcements) ? row.reinforcements.map(normalizeId) : [],
    source: clean(row.source || 'user-confirmed-current-fleet-board'),
    observedAt: clean(row.observedAt),
    opponentAllyCode: '',
  });
}
function reserveIds(rows = []) {
  return [...new Set(rows.flatMap((row) => [row.capitalShipBaseId,...(row.starters||[]),...(row.reinforcements||[])].map(normalizeId).filter(Boolean)))];
}
function assignmentUsedIds(assignments = []) {
  const ids = new Set();
  for (const assignment of assignments) {
    for (const attempt of Array.isArray(assignment?.attemptLog) ? assignment.attemptLog : []) {
      for (const id of Array.isArray(attempt?.members) ? attempt.members : []) {
        const normalized = normalizeId(id);
        if (normalized) ids.add(normalized);
      }
    }
    const status = clean(assignment?.status).toLowerCase();
    if (['planned','attempted'].includes(status)) {
      for (const id of Array.isArray(assignment?.members) ? assignment.members : []) {
        const normalized = normalizeId(id);
        if (normalized) ids.add(normalized);
      }
    }
  }
  return [...ids];
}
function assignmentForDefense(defenseId) {
  return state.assignments.find((row)=>Number(row?.defenseFleetId)===Number(defenseId)) || null;
}
function openEnemyDrafts() {
  return state.enemyFleets.filter((defense)=>{
    const assignment=assignmentForDefense(defense.id);
    return !assignment || ['loss','abandoned'].includes(clean(assignment.status).toLowerCase());
  });
}
function plannerAssignmentForSlot(slot) {
  return (Array.isArray(state.planner?.assignments) ? state.planner.assignments : []).find((row)=>Number(row?.slot)===Number(slot)) || null;
}
function evidenceForCapitals(capitals = [], format = '5v5') {
  if (!capitals.length) return Promise.resolve(null);
  return fetchJson(`/api/gac/fleet/counters/batch?format=${encodeURIComponent(format)}&capitals=${encodeURIComponent([...new Set(capitals)].join(','))}&limit=60`);
}
async function fetchJson(pathname, options = {}) {
  const hasBody = options.body !== undefined;
  const response = await fetch(pathname,{
    cache:'no-store',
    credentials:'same-origin',
    headers:{Accept:'application/json',...(hasBody?{'Content-Type':'application/json'}:{})},
    ...options,
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status=response.status;
    throw error;
  }
  return body;
}
function boardEndpoint(snapshot, owner='defense') {
  return `/api/gac/current-fleet-board/${allyCode(snapshot.ownerCode)}/${owner}`;
}
function planEndpoint(snapshot) { return `/api/gac/fleet-attack-plan/${allyCode(snapshot.ownerCode)}`; }
function archiveEndpoint(snapshot) { return `/api/gac/fleet-verified-battle/${allyCode(snapshot.ownerCode)}`; }
function writeCanonicalReserveFallback(snapshot) {
  const ids=reserveIds(state.ownDefenseFleets);
  try { localStorage.setItem(localReserveKey(snapshot),JSON.stringify(ids)); } catch {}
}
function publish(snapshot) {
  const detail=Object.freeze({
    canonical:true,
    ownerCode:allyCode(snapshot?.ownerCode),
    opponentCode:allyCode(snapshot?.opponentCode),
    round:Number(snapshot?.round)||null,
    enemyFleets:Object.freeze(state.enemyFleets),
    ownDefenseFleets:Object.freeze(state.ownDefenseFleets),
    ownDefenseReserveIds:Object.freeze(reserveIds(state.ownDefenseFleets)),
    assignments:Object.freeze(state.assignments),
  });
  window.__gacFleetCanonicalOperations=detail;
  window.dispatchEvent(new CustomEvent('gac-fleet-round-state-updated',{detail}));
}
function shipRows(snapshot) {
  return (Array.isArray(snapshot?.ownerRoster?.units) ? snapshot.ownerRoster.units : []).filter((unit)=>clean(unit?.unitType).toLowerCase()==='ship');
}
function shipIndex(snapshot) {
  return new Map(shipRows(snapshot).map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));
}
function imageUrl(unit={}) { return clean(unit.image||unit.imageUrl||unit.portrait||unit.portraitUrl||unit.thumbnail||unit.icon); }
function portrait(unit={},cls='') {
  const name=clean(unit?.name||unit?.baseId||'Unknown');
  const image=imageUrl(unit);
  return `<span class="gac-fleet-op-unit ${escapeAttr(cls)}" title="${escapeAttr(name)}">${image?`<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">`:`<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function unitFor(snapshot,id) {
  return shipIndex(snapshot).get(normalizeId(id)) || {baseId:normalizeId(id),name:normalizeId(id)};
}
function formatDate(value) {
  if (!value) return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?clean(value):date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function observedPercent(value) { return value==null?'—':`${Math.round(n(value)*1000)/10}% observed`; }

function recomputePlanner(snapshot) {
  if (!snapshot?.ownerRoster || !state.evidence) { state.planner=null; return; }
  const baseUnavailable=[...new Set([...reserveIds(state.ownDefenseFleets),...assignmentUsedIds(state.assignments)])];
  state.planner=allocateFleetCounters(snapshot.ownerRoster,snapshot.catalog,openEnemyDrafts(),state.evidence,{reservedBaseIds:baseUnavailable});
  writeCanonicalReserveFallback(snapshot);
}

async function loadState(snapshot) {
  if (!canonicalReady(snapshot)) {
    state.enemyFleets=[];
    state.ownDefenseFleets=[];
    state.assignments=[];
    state.evidence=null;
    state.planner=null;
    state.error='Confirm the current opponent and round to enable canonical fleet operations.';
    render(snapshot);
    return;
  }
  const requestId=++state.requestId;
  state.loading=true;
  state.error='';
  render(snapshot);
  try {
    const [enemyBody,ownBody,planBody]=await Promise.all([
      fetchJson(`${boardEndpoint(snapshot,'defense')}?round=${Number(snapshot.round)}`),
      fetchJson(`${boardEndpoint(snapshot,'my-defense')}?round=${Number(snapshot.round)}`),
      fetchJson(`${planEndpoint(snapshot)}?round=${Number(snapshot.round)}`),
    ]);
    if(requestId!==state.requestId)return;
    state.enemyFleets=(Array.isArray(enemyBody?.fleets)?enemyBody.fleets:[]).map(normalizeFleetRow).filter((row)=>row.complete);
    state.ownDefenseFleets=(Array.isArray(ownBody?.fleets)?ownBody.fleets:[]).map(normalizeFleetRow).filter((row)=>row.complete);
    state.assignments=Array.isArray(planBody?.assignments)?planBody.assignments:[];
    state.evidence=await evidenceForCapitals(state.enemyFleets.map((row)=>normalizeId(row.capitalShipBaseId)).filter(Boolean),snapshot.format);
    if(requestId!==state.requestId)return;
    recomputePlanner(snapshot);
    state.error='';
    publish(snapshot);
  } catch(error) {
    if(requestId!==state.requestId)return;
    state.error=clean(error?.message||error||'Canonical fleet round state unavailable');
    state.planner=null;
  } finally {
    if(requestId===state.requestId){ state.loading=false; render(snapshot); }
  }
}

function roleEditorHtml(snapshot) {
  const editor=state.roleEditor;
  if(!editor)return'';
  const candidate=editor.recommendation;
  const index=shipIndex(snapshot);
  const members=(candidate?.fleetIds||[]).map(normalizeId).filter((id)=>id&&id!==normalizeId(candidate.counterCapitalShipBaseId));
  const selected=new Set(editor.starters.map(normalizeId));
  const capital=unitFor(snapshot,candidate.counterCapitalShipBaseId);
  const reinforcements=members.filter((id)=>!selected.has(id));
  return `<section class="gac-fleet-role-editor"><header><div><span>LOCK FLEET COUNTER</span><strong>Confirm the attacking starting three</strong><small>Historical GAHistory proves fleet member identity, not starter-vs-reinforcement roles. Select exactly 3 starters from this evidence-backed fleet.</small></div><button type="button" data-gac-fleet-role-close>Close</button></header><div class="gac-fleet-role-capital"><span>CAPITAL SHIP</span>${portrait(capital,'is-capital')}</div><div class="gac-fleet-role-members">${members.map((id)=>{const unit=index.get(id)||unitFor(snapshot,id);const active=selected.has(id);return `<button type="button" class="${active?'is-starter':'is-reinforcement'}" data-gac-fleet-role-toggle="${escapeAttr(id)}">${portrait(unit)}<b>${active?'STARTER':'REINFORCEMENT'}</b></button>`;}).join('')}</div><div class="gac-fleet-role-summary"><div><span>STARTERS CONFIRMED</span><strong>${selected.size}/3</strong></div><div><span>REINFORCEMENTS</span><strong>${reinforcements.length}</strong></div></div><footer><button type="button" data-gac-fleet-role-close>Cancel</button><button type="button" data-gac-fleet-role-save ${selected.size===3&&reinforcements.length<=4?'':'disabled'}>Lock Canonical Fleet Counter</button></footer></section>`;
}

function ownDefenseEditorHtml(snapshot) {
  const editor=state.ownEditor;
  if(!editor)return'';
  const all=shipRows(snapshot).slice().sort((a,b)=>n(b.power)-n(a.power)||clean(a.name).localeCompare(clean(b.name)));
  const capitals=all.filter(isCapitalShip);
  const normals=all.filter((unit)=>!isCapitalShip(unit));
  const selected=new Set([editor.capitalShipBaseId,...editor.starters,...editor.reinforcements].map(normalizeId).filter(Boolean));
  const pool=editor.mode==='capital'?capitals:normals;
  const query=clean(editor.query).toLowerCase();
  const results=pool.filter((unit)=>!selected.has(normalizeId(unit))&&(!query||clean(unit.name).toLowerCase().includes(query)||normalizeId(unit).toLowerCase().includes(query))).slice(0,50);
  const selectedGroup=(label,ids,type)=>`<div class="gac-fleet-own-selected"><span>${label}</span><div>${ids.map((id)=>`<button type="button" data-gac-fleet-own-remove="${type}|${escapeAttr(id)}">${portrait(unitFor(snapshot,id))}<b>×</b></button>`).join('')||'<small>None selected</small>'}</div></div>`;
  const capital=editor.capitalShipBaseId?unitFor(snapshot,editor.capitalShipBaseId):null;
  const complete=Boolean(editor.capitalShipBaseId&&editor.starters.length===3&&editor.reinforcements.length<=4);
  return `<section class="gac-fleet-own-editor"><header><div><span>MY GAC FLEET DEFENSE</span><strong>Fleet Slot ${editor.slot+1}</strong><small>This full fleet composition is persisted against the verified current event/round and automatically reserved from offense.</small></div><button type="button" data-gac-fleet-own-close>Close</button></header><div class="gac-fleet-own-selected"><span>CAPITAL SHIP</span><div>${capital?`<button type="button" data-gac-fleet-own-remove="capital|${escapeAttr(editor.capitalShipBaseId)}">${portrait(capital)}<b>×</b></button>`:'<small>Choose a capital ship</small>'}</div></div>${selectedGroup('STARTING 3',editor.starters,'starter')}${selectedGroup('REINFORCEMENTS · OPTIONAL',editor.reinforcements,'reinforcement')}<div class="gac-fleet-own-modes">${['capital','starter','reinforcement'].map((mode)=>`<button type="button" class="${editor.mode===mode?'active':''}" data-gac-fleet-own-mode="${mode}">${mode==='capital'?'Capital':mode==='starter'?'Starter':'Reinforcement'}</button>`).join('')}</div><div class="gac-fleet-own-search"><input data-gac-fleet-own-search placeholder="Search ${editor.mode} ships…" value="${escapeAttr(editor.query)}"><b>${editor.capitalShipBaseId?1:0}+${editor.starters.length}+${editor.reinforcements.length}</b></div><div class="gac-fleet-own-results">${results.map((unit)=>`<button type="button" data-gac-fleet-own-add="${escapeAttr(normalizeId(unit))}">${portrait(unit)}<span><strong>${escapeHtml(unit.name||normalizeId(unit))}</strong><small>${number.format(n(unit.power))} GP</small></span></button>`).join('')||'<p>No matching ships.</p>'}</div><footer><button type="button" data-gac-fleet-own-delete="${editor.slot}" ${editor.id?'':'disabled'}>Delete Canonical Defense</button><button type="button" data-gac-fleet-own-save ${complete?'':'disabled'}>Save Canonical Defense</button></footer></section>`;
}

function ownDefenseHtml(snapshot) {
  const capacity=Math.max(0,Number(snapshot?.rule?.fleetTeams)||0);
  if(!capacity)return'';
  const rows=Array.from({length:capacity},(_,slot)=>state.ownDefenseFleets.find((row)=>Number(row.slot)===slot)||null);
  return `<section class="gac-fleet-own-defense"><header><div><span>MY DEFENSE FLEETS</span><strong>${state.ownDefenseFleets.length}/${capacity} canonical fleet slots</strong><small>Saved fleet defense ships are automatically excluded from offense allocation.</small></div><b>VERIFIED ROUND STATE</b></header><div class="gac-fleet-own-slots">${rows.map((row,slot)=>{if(!row)return `<button type="button" class="is-empty" data-gac-fleet-own-edit="${slot}"><span>FLEET ${slot+1}</span><strong>+ ENTER MY DEFENSE</strong></button>`;const cap=unitFor(snapshot,row.capitalShipBaseId);return `<article><div><span>FLEET ${slot+1}</span><strong>${escapeHtml(cap.name||row.capitalShipBaseId)}</strong><small>${row.starters.length} starters · ${row.reinforcements.length} reinforcements</small></div><div>${portrait(cap,'is-capital')}${row.starters.map((id)=>portrait(unitFor(snapshot,id))).join('')}</div><button type="button" data-gac-fleet-own-edit="${slot}">Edit</button></article>`;}).join('')}</div>${ownDefenseEditorHtml(snapshot)}</section>`;
}

function attemptControls(assignment) {
  const status=clean(assignment?.status).toLowerCase();
  if(status==='planned')return `<div class="gac-fleet-attempt-actions"><button type="button" data-gac-fleet-status="${assignment.id}|attempted">Start Attempt</button><button type="button" class="is-release" data-gac-fleet-status="${assignment.id}|abandoned">Release Counter</button></div>`;
  if(status==='attempted')return `<div class="gac-fleet-attempt-actions"><label>Banners <input type="number" min="0" step="1" data-gac-fleet-banners="${assignment.id}" placeholder="optional"></label><button type="button" class="is-win" data-gac-fleet-result="${assignment.id}|win">Record Win</button><button type="button" class="is-loss" data-gac-fleet-result="${assignment.id}|loss">Record Loss</button></div>`;
  if(['win','loss'].includes(status)){
    const attemptIndex=Math.max(0,(assignment.attemptLog?.length||1)-1);
    const key=`${assignment.id}:${attemptIndex}`;
    return `<div class="gac-fleet-attempt-actions"><b class="is-${status}">${status.toUpperCase()}${assignment.banners==null?'':` · ${assignment.banners} banners`}</b><button type="button" data-gac-fleet-archive="${assignment.id}|${attemptIndex}" ${state.archiveBusy.has(key)||state.archivedKeys.has(key)?'disabled':''}>${state.archivedKeys.has(key)?'Verified Evidence Archived':'Archive Verified Evidence'}</button>${status==='loss'?'<small>Lost fleet units remain consumed for this round. Replanning will exclude them.</small>':''}</div>`;
  }
  return `<div class="gac-fleet-attempt-actions"><b>RELEASED</b></div>`;
}

function canonicalPlanHtml(snapshot) {
  const rows=state.enemyFleets.map((defense)=>{
    const persisted=assignmentForDefense(defense.id);
    const suggestion=plannerAssignmentForSlot(defense.slot);
    const enemyCap=unitFor({...snapshot,ownerRoster:snapshot.opponentRoster},defense.capitalShipBaseId);
    if(persisted){
      const cap=unitFor(snapshot,persisted.capitalShipBaseId);
      return `<article class="gac-fleet-canonical-plan-row is-${escapeAttr(clean(persisted.status).toLowerCase())}"><div class="gac-fleet-plan-enemy"><span>ENEMY FLEET ${defense.slot+1}</span><strong>${escapeHtml(enemyCap.name||defense.capitalShipBaseId)}</strong><small>Canonical defense #${defense.id}</small></div><div class="gac-fleet-plan-counter">${portrait(cap,'is-capital')}<div><span>LOCKED COUNTER</span><strong>${escapeHtml(cap.name||persisted.capitalShipBaseId)}</strong><small>${persisted.starters.length} confirmed starters · ${persisted.reinforcements.length} reinforcements</small></div></div><div class="gac-fleet-plan-status"><b>${escapeHtml(clean(persisted.status).toUpperCase())}</b>${attemptControls(persisted)}</div></article>`;
    }
    if(suggestion?.recommendation){
      const rec=suggestion.recommendation;
      const cap=unitFor(snapshot,rec.counterCapitalShipBaseId);
      return `<article class="gac-fleet-canonical-plan-row is-suggested"><div class="gac-fleet-plan-enemy"><span>ENEMY FLEET ${defense.slot+1}</span><strong>${escapeHtml(enemyCap.name||defense.capitalShipBaseId)}</strong><small>Canonical defense #${defense.id}</small></div><div class="gac-fleet-plan-counter">${portrait(cap,'is-capital')}<div><span>EVIDENCE-BACKED SUGGESTION</span><strong>${escapeHtml(cap.name||rec.counterCapitalShipBaseId)}</strong><small>${rec.wins}/${rec.battles} observed wins · ${escapeHtml(observedPercent(rec.observedWinRate))}</small></div></div><div class="gac-fleet-plan-status"><button type="button" data-gac-fleet-lock="${defense.id}|${defense.slot}">Confirm Roles & Lock</button><small>Starter roles must be confirmed by you before persistence.</small></div></article>`;
    }
    return `<article class="gac-fleet-canonical-plan-row is-blocked"><div class="gac-fleet-plan-enemy"><span>ENEMY FLEET ${defense.slot+1}</span><strong>${escapeHtml(enemyCap.name||defense.capitalShipBaseId)}</strong><small>Canonical defense #${defense.id}</small></div><div class="gac-fleet-plan-counter"><div><span>NO LOCKABLE COUNTER</span><strong>Evidence/resource gate blocked</strong><small>No roster-fit fleet guess is generated.</small></div></div></article>`;
  });
  return `<section class="gac-fleet-canonical-plans"><header><div><span>CANONICAL FLEET ATTACK PLAN</span><strong>${state.assignments.filter((row)=>['planned','attempted'].includes(clean(row.status).toLowerCase())).length} active locks · ${state.assignments.filter((row)=>clean(row.status).toLowerCase()==='win').length} cleared</strong><small>All locks and attempts are tied to the verified current event, opponent and round.</small></div><b>ROUND ${Number(snapshot.round)}</b></header><div>${rows.join('')||'<p class="gac-fleet-op-note">Enter a visible enemy fleet to create a canonical fleet attack plan.</p>'}</div>${roleEditorHtml(snapshot)}</section>`;
}

function statusHtml(snapshot) {
  const canonical=canonicalReady(snapshot);
  return `<div class="gac-fleet-op-status ${canonical&&!state.error?'is-ready':state.error?'is-error':'is-warn'}"><div><span>FLEET ROUND STATE</span><strong>${state.loading?'SYNCING CANONICAL STATE':canonical&&!state.error?'CANONICAL · VERIFIED ROUND':'LOCAL FALLBACK'}</strong><small>${state.error?escapeHtml(state.error):canonical?'Enemy fleet, own defense, plan locks and attempts persist across sessions.':'Confirm opponent + round and sign in to enable persistence.'}</small></div><div><b>${state.enemyFleets.length}</b><span>ENEMY FLEETS</span></div><div><b>${state.ownDefenseFleets.length}</b><span>MY DEFENSES</span></div><div><b>${state.assignments.length}</b><span>PLAN RECORDS</span></div></div>`;
}

function render(snapshot=boardSnapshot()) {
  const board=document.querySelector('[data-gac-board-v2]');
  if(!board||!snapshot?.rule)return;
  board.classList.toggle('gac-fleet-canonical-active',canonicalReady(snapshot)&&!state.error);
  let host=board.querySelector('[data-gac-fleet-round-operations]');
  const markup=`<section class="gac-fleet-round-operations" data-gac-fleet-round-operations>${statusHtml(snapshot)}${canonicalReady(snapshot)&&!state.error?`${ownDefenseHtml(snapshot)}${canonicalPlanHtml(snapshot)}`:''}</section>`;
  if(host)host.outerHTML=markup;
  else{
    const command=board.querySelector('[data-gac-fleet-command]');
    if(command)command.insertAdjacentHTML('afterend',markup);
    else board.insertAdjacentHTML('beforeend',markup);
  }
  decorateCanonicalFleetCards(snapshot);
}

function decorateCanonicalFleetCards(snapshot) {
  if(!canonicalReady(snapshot)||state.error)return;
  const root=document.querySelector('[data-gac-board-v2]');
  if(!root)return;
  for(const defense of state.enemyFleets){
    const card=root.querySelector(`[data-gac-board-v2-fleet-edit="${defense.slot}"]`)?.closest('.gac-board-v2-slot.is-fleet');
    const gate=card?.querySelector('.gac-board-v2-fleet-gate');
    if(!gate)continue;
    const persisted=assignmentForDefense(defense.id);
    const suggestion=plannerAssignmentForSlot(defense.slot);
    if(persisted){
      gate.className=`gac-board-v2-fleet-gate gac-fleet-gate gac-fleet-canonical-gate is-${escapeAttr(clean(persisted.status).toLowerCase())}`;
      gate.innerHTML=`<strong>CANONICAL FLEET PLAN · ${escapeHtml(clean(persisted.status).toUpperCase())}</strong><span>Counter roles and round state are persisted. Use Fleet Attack Plan controls below for battle execution.</span>`;
    }else if(suggestion?.recommendation){
      const rec=suggestion.recommendation;
      gate.className='gac-board-v2-fleet-gate gac-fleet-gate gac-fleet-canonical-gate is-evidence';
      gate.innerHTML=`<strong>HISTORICAL FLEET COUNTER · READY TO LOCK</strong><span>${escapeHtml(rec.compositionMatch.label)} · ${rec.wins}/${rec.battles} observed wins · ${escapeHtml(observedPercent(rec.observedWinRate))}</span><button type="button" data-gac-fleet-lock="${defense.id}|${defense.slot}">Confirm Starter Roles & Lock</button>`;
    }else{
      gate.className='gac-board-v2-fleet-gate gac-fleet-gate gac-fleet-canonical-gate is-empty';
      gate.innerHTML='<strong>NO CANONICAL FLEET COUNTER</strong><span>No evidence-backed non-overlapping owned fleet can be locked for this defense.</span>';
    }
  }
}

function startRoleEditor(defenseId,slot) {
  const defense=state.enemyFleets.find((row)=>Number(row.id)===Number(defenseId));
  const suggestion=plannerAssignmentForSlot(slot);
  if(!defense||!suggestion?.recommendation)return;
  state.roleEditor={defenseId:Number(defenseId),slot:Number(slot),recommendation:suggestion.recommendation,starters:[]};
  render();
  document.querySelector('.gac-fleet-role-editor')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function toggleRole(id) {
  if(!state.roleEditor)return;
  id=normalizeId(id);
  const set=new Set(state.roleEditor.starters.map(normalizeId));
  if(set.has(id))set.delete(id);else if(set.size<3)set.add(id);
  state.roleEditor.starters=[...set];
  render();
}
async function saveRoleLock(snapshot) {
  const editor=state.roleEditor;
  if(!editor||editor.starters.length!==3)return;
  const rec=editor.recommendation;
  const capital=normalizeId(rec.counterCapitalShipBaseId);
  const nonCapital=(rec.fleetIds||[]).map(normalizeId).filter((id)=>id&&id!==capital);
  const starters=editor.starters.map(normalizeId);
  const reinforcements=nonCapital.filter((id)=>!starters.includes(id));
  if(reinforcements.length>4){state.error='Historical member set exceeds the canonical reinforcement limit; this counter cannot be locked without a narrower verified fleet composition.';render(snapshot);return;}
  state.loading=true;render(snapshot);
  try{
    await fetchJson(planEndpoint(snapshot),{method:'POST',body:JSON.stringify({round:Number(snapshot.round),defenseFleetId:editor.defenseId,capitalShipBaseId:capital,starters,reinforcements,sourceRef:'gac-command-center-fleet-evidence-lock'})});
    state.roleEditor=null;
    await loadState(snapshot);
  }catch(error){state.error=clean(error?.message||error);state.loading=false;render(snapshot);}
}

function startOwnEditor(slot,snapshot) {
  const existing=state.ownDefenseFleets.find((row)=>Number(row.slot)===Number(slot));
  state.ownEditor={
    id:existing?.id||null,
    slot:Number(slot),
    capitalShipBaseId:normalizeId(existing?.capitalShipBaseId),
    starters:existing?.starters?[...existing.starters]:[],
    reinforcements:existing?.reinforcements?[...existing.reinforcements]:[],
    mode:existing?.capitalShipBaseId?(existing?.starters?.length<3?'starter':'reinforcement'):'capital',
    query:'',
  };
  render(snapshot);
  document.querySelector('.gac-fleet-own-editor')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function addOwnShip(id) {
  if(!state.ownEditor)return;
  id=normalizeId(id);if(!id)return;
  const e=state.ownEditor;
  if(e.mode==='capital'){e.capitalShipBaseId=id;e.mode=e.starters.length<3?'starter':'reinforcement';}
  else if(e.mode==='starter'){if(e.starters.length<3&&!e.starters.includes(id))e.starters.push(id);if(e.starters.length>=3)e.mode='reinforcement';}
  else if(e.reinforcements.length<4&&!e.reinforcements.includes(id))e.reinforcements.push(id);
  e.query='';render();
}
function removeOwnShip(type,id) {
  if(!state.ownEditor)return;
  id=normalizeId(id);
  if(type==='capital')state.ownEditor.capitalShipBaseId='';
  if(type==='starter')state.ownEditor.starters=state.ownEditor.starters.filter((value)=>normalizeId(value)!==id);
  if(type==='reinforcement')state.ownEditor.reinforcements=state.ownEditor.reinforcements.filter((value)=>normalizeId(value)!==id);
  render();
}
async function saveOwnDefense(snapshot) {
  const e=state.ownEditor;if(!e)return;
  state.loading=true;render(snapshot);
  try{
    await fetchJson(boardEndpoint(snapshot,'my-defense'),{method:'POST',body:JSON.stringify({round:Number(snapshot.round),slot:e.slot,capitalShipBaseId:e.capitalShipBaseId,starters:e.starters,reinforcements:e.reinforcements})});
    state.ownEditor=null;await loadState(snapshot);
  }catch(error){state.error=clean(error?.message||error);state.loading=false;render(snapshot);}
}
async function deleteOwnDefense(snapshot,slot) {
  const row=state.ownDefenseFleets.find((value)=>Number(value.slot)===Number(slot));if(!row?.id)return;
  state.loading=true;render(snapshot);
  try{
    await fetchJson(boardEndpoint(snapshot,'my-defense'),{method:'DELETE',body:JSON.stringify({round:Number(snapshot.round),id:Number(row.id)})});
    state.ownEditor=null;await loadState(snapshot);
  }catch(error){state.error=clean(error?.message||error);state.loading=false;render(snapshot);}
}

async function patchStatus(snapshot,id,status,banners=null) {
  state.loading=true;render(snapshot);
  try{
    await fetchJson(planEndpoint(snapshot),{method:'PATCH',body:JSON.stringify({round:Number(snapshot.round),id:Number(id),status,banners})});
    await loadState(snapshot);
  }catch(error){state.error=clean(error?.message||error);state.loading=false;render(snapshot);}
}
async function archiveAttempt(snapshot,id,attemptIndex) {
  const key=`${id}:${attemptIndex}`;state.archiveBusy.add(key);render(snapshot);
  try{
    await fetchJson(archiveEndpoint(snapshot),{method:'POST',body:JSON.stringify({round:Number(snapshot.round),assignmentId:Number(id),attemptIndex:Number(attemptIndex),confirm:true})});
    state.archivedKeys.add(key);
    await loadState(snapshot);
    window.dispatchEvent(new CustomEvent('gac-fleet-evidence-archived',{detail:{assignmentId:Number(id),attemptIndex:Number(attemptIndex)}}));
  }catch(error){state.error=clean(error?.message||error);render(snapshot);}finally{state.archiveBusy.delete(key);render(snapshot);}
}

function bind() {
  if(document.documentElement.dataset.gacFleetRoundOperationsBound==='true')return;
  document.documentElement.dataset.gacFleetRoundOperationsBound='true';
  document.addEventListener('click',(event)=>{
    const snapshot=boardSnapshot();
    const lock=event.target.closest?.('[data-gac-fleet-lock]');
    if(lock){const [id,slot]=clean(lock.dataset.gacFleetLock).split('|');startRoleEditor(Number(id),Number(slot));return;}
    const roleToggle=event.target.closest?.('[data-gac-fleet-role-toggle]');
    if(roleToggle){toggleRole(roleToggle.dataset.gacFleetRoleToggle);return;}
    if(event.target.closest?.('[data-gac-fleet-role-close]')){state.roleEditor=null;render(snapshot);return;}
    if(event.target.closest?.('[data-gac-fleet-role-save]')){void saveRoleLock(snapshot);return;}
    const ownEdit=event.target.closest?.('[data-gac-fleet-own-edit]');
    if(ownEdit){startOwnEditor(Number(ownEdit.dataset.gacFleetOwnEdit),snapshot);return;}
    if(event.target.closest?.('[data-gac-fleet-own-close]')){state.ownEditor=null;render(snapshot);return;}
    const ownMode=event.target.closest?.('[data-gac-fleet-own-mode]');
    if(ownMode&&state.ownEditor){state.ownEditor.mode=ownMode.dataset.gacFleetOwnMode;state.ownEditor.query='';render(snapshot);return;}
    const ownAdd=event.target.closest?.('[data-gac-fleet-own-add]');
    if(ownAdd){addOwnShip(ownAdd.dataset.gacFleetOwnAdd);return;}
    const ownRemove=event.target.closest?.('[data-gac-fleet-own-remove]');
    if(ownRemove){const [type,id]=clean(ownRemove.dataset.gacFleetOwnRemove).split('|');removeOwnShip(type,id);return;}
    if(event.target.closest?.('[data-gac-fleet-own-save]')){void saveOwnDefense(snapshot);return;}
    const ownDelete=event.target.closest?.('[data-gac-fleet-own-delete]');
    if(ownDelete){void deleteOwnDefense(snapshot,Number(ownDelete.dataset.gacFleetOwnDelete));return;}
    const status=event.target.closest?.('[data-gac-fleet-status]');
    if(status){const [id,next]=clean(status.dataset.gacFleetStatus).split('|');void patchStatus(snapshot,Number(id),next);return;}
    const result=event.target.closest?.('[data-gac-fleet-result]');
    if(result){const [id,next]=clean(result.dataset.gacFleetResult).split('|');const input=document.querySelector(`[data-gac-fleet-banners="${id}"]`);const banners=clean(input?.value)===''?null:Number(input.value);void patchStatus(snapshot,Number(id),next,banners);return;}
    const archive=event.target.closest?.('[data-gac-fleet-archive]');
    if(archive){const [id,index]=clean(archive.dataset.gacFleetArchive).split('|');void archiveAttempt(snapshot,Number(id),Number(index));return;}
  },true);
  document.addEventListener('input',(event)=>{
    if(event.target?.matches?.('[data-gac-fleet-own-search]')&&state.ownEditor){state.ownEditor.query=event.target.value;const cursor=event.target.selectionStart;render();const input=document.querySelector('[data-gac-fleet-own-search]');input?.focus();if(Number.isInteger(cursor))input?.setSelectionRange?.(cursor,cursor);}
  },true);
  window.addEventListener('gac-board-v2-rendered',()=>schedule(160));
  window.addEventListener('gac-v2-matchup-loaded',()=>schedule(220));
  window.addEventListener('gac-board-evidence-updated',()=>schedule(220));
  window.addEventListener('gac-fleet-plan-updated',()=>{if(!state.loading)setTimeout(()=>decorateCanonicalFleetCards(boardSnapshot()),40);});
  window.addEventListener('gac-fleet-canonical-updated',()=>schedule(160));
  document.addEventListener('change',(event)=>{
    if(event.target?.matches?.('[data-gacv2-round],[data-gacv2-opponent],[data-gacv2-mode]')||event.target?.id==='allyCode')schedule(260);
  },true);
}
function schedule(delay=120) {
  clearTimeout(state.timer);
  state.timer=setTimeout(()=>{
    const snapshot=boardSnapshot();
    const key=contextKey(snapshot);
    if(key!==state.contextKey){state.contextKey=key;state.enemyFleets=[];state.ownDefenseFleets=[];state.assignments=[];state.evidence=null;state.planner=null;state.roleEditor=null;state.ownEditor=null;}
    void loadState(snapshot);
  },Math.max(0,delay));
}
function injectStyle() {
  if(document.querySelector('link[data-gac-fleet-round-operations-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-fleet-round-operations.css?v=20260821-fleetops';link.dataset.gacFleetRoundOperationsStyle='true';document.head.appendChild(link);
}

if(typeof document!=='undefined'){
  injectStyle();bind();schedule(600);
  document.addEventListener('DOMContentLoaded',()=>schedule(260),{once:true});
}

export {
  assignmentUsedIds,
  canonicalReady,
  contextKey,
  normalizeFleetRow,
  openEnemyDrafts,
  reserveIds,
};
