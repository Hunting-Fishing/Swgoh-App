import { boardSnapshot } from './gac-manual-board-workspace.js';
import { fleetCandidates, normalizeId } from './gac-fleet-war-room-model.js';

const state = {
  contextKey: '',
  observations: [],
  latest: [],
  evidence: null,
  candidatesByAssignment: new Map(),
  editor: null,
  roleEditor: null,
  loading: false,
  error: '',
  timer: null,
  requestId: 0,
};

const clean = (value) => String(value ?? '').trim();
const allyCode = (value) => clean(value).replace(/\D/g,'').slice(0,9);
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const escapeAttr = escapeHtml;

function canonicalReady(snapshot) {
  return /^\d{9}$/.test(allyCode(snapshot?.ownerCode))
    && /^\d{9}$/.test(allyCode(snapshot?.opponentCode))
    && [1,2,3].includes(Number(snapshot?.round));
}
function contextKey(snapshot) {
  return `${allyCode(snapshot?.ownerCode)||'anonymous'}:${allyCode(snapshot?.opponentCode)||'manual'}:${Number(snapshot?.round)||0}:${snapshot?.format||'5v5'}`;
}
function endpoint(snapshot) { return `/api/gac/fleet-cleanup/${allyCode(snapshot.ownerCode)}`; }
function planEndpoint(snapshot) { return `/api/gac/fleet-attack-plan/${allyCode(snapshot.ownerCode)}`; }
function operations() { return window.__gacFleetCanonicalOperations || {}; }
function assignments() { return Array.isArray(operations()?.assignments) ? operations().assignments : []; }
function ownDefenseFleets() { return Array.isArray(operations()?.ownDefenseFleets) ? operations().ownDefenseFleets : []; }
function enemyFleets() { return Array.isArray(operations()?.enemyFleets) ? operations().enemyFleets : []; }
function lossAssignments() {
  return assignments().filter((row)=>clean(row?.status).toLowerCase()==='loss' && Array.isArray(row?.attemptLog) && row.attemptLog.some((attempt)=>clean(attempt?.status).toLowerCase()==='loss'));
}
function latestLossIndex(assignment) {
  const attempts=Array.isArray(assignment?.attemptLog)?assignment.attemptLog:[];
  for(let index=attempts.length-1;index>=0;index-=1){if(clean(attempts[index]?.status).toLowerCase()==='loss')return index;}
  return -1;
}
function latestObservation(assignmentId,attemptIndex) {
  return state.latest.find((row)=>Number(row?.assignmentId)===Number(assignmentId)&&Number(row?.attemptIndex)===Number(attemptIndex))||null;
}
function defenseFor(assignment) {
  return assignment?.defense || enemyFleets().find((row)=>Number(row?.id)===Number(assignment?.defenseFleetId)) || null;
}
function allDefenseIds(defense={}) {
  return [...new Set([defense.capitalShipBaseId,...(defense.starters||[]),...(defense.reinforcements||[])].map(normalizeId).filter(Boolean))];
}
function usedFleetIds() {
  const ids=new Set();
  for(const fleet of ownDefenseFleets())for(const id of allDefenseIds(fleet))ids.add(id);
  for(const assignment of assignments()){
    for(const attempt of Array.isArray(assignment?.attemptLog)?assignment.attemptLog:[]){
      for(const id of Array.isArray(attempt?.members)?attempt.members:[])if(normalizeId(id))ids.add(normalizeId(id));
    }
    if(['planned','attempted'].includes(clean(assignment?.status).toLowerCase())){
      for(const id of Array.isArray(assignment?.members)?assignment.members:[])if(normalizeId(id))ids.add(normalizeId(id));
    }
  }
  return [...ids];
}
async function fetchJson(pathname,options={}) {
  const hasBody=options.body!==undefined;
  const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',...(hasBody?{'Content-Type':'application/json'}:{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body?.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
  return body;
}
function shipRows(snapshot,side='owner') {
  const roster=side==='owner'?snapshot?.ownerRoster:snapshot?.opponentRoster;
  const rows=Array.isArray(roster?.units)?roster.units:[];
  return rows.filter((unit)=>clean(unit?.unitType).toLowerCase()==='ship');
}
function unitIndex(snapshot,side='owner') {
  const roster=shipRows(snapshot,side);
  const catalog=(Array.isArray(snapshot?.catalog?.units)?snapshot.catalog.units:[]).filter((unit)=>clean(unit?.unitType).toLowerCase()==='ship');
  const source=roster.length?roster:catalog;
  return new Map(source.map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));
}
function unitFor(snapshot,id,side='owner') {
  const key=normalizeId(id);
  return unitIndex(snapshot,side).get(key)||{baseId:key,name:key};
}
function imageUrl(unit={}) { return clean(unit.image||unit.imageUrl||unit.portrait||unit.portraitUrl||unit.thumbnail||unit.icon); }
function portrait(unit={},cls='') {
  const name=clean(unit?.name||unit?.baseId||'Unknown');
  const image=imageUrl(unit);
  return `<span class="gac-cleanup-unit ${escapeAttr(cls)}" title="${escapeAttr(name)}">${image?`<img src="${escapeAttr(image)}" alt="${escapeAttr(name)}" loading="lazy">`:`<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function observedPercent(value) { return value==null?'—':`${Math.round(n(value)*1000)/10}% observed`; }

async function loadEvidence(snapshot,losses) {
  const capitals=[...new Set(losses.map((assignment)=>normalizeId(defenseFor(assignment)?.capitalShipBaseId)).filter(Boolean))];
  if(!capitals.length)return null;
  return fetchJson(`/api/gac/fleet/counters/batch?format=${encodeURIComponent(snapshot.format)}&capitals=${encodeURIComponent(capitals.join(','))}&limit=60`);
}
function rebuildCandidates(snapshot) {
  state.candidatesByAssignment.clear();
  if(!snapshot?.ownerRoster||!state.evidence)return;
  const reserved=usedFleetIds();
  for(const assignment of lossAssignments()){
    const attemptIndex=latestLossIndex(assignment);
    const observation=latestObservation(assignment.id,attemptIndex);
    const defense=defenseFor(assignment);
    if(!observation||!defense)continue;
    const candidates=fleetCandidates(snapshot.ownerRoster,snapshot.catalog,defense,state.evidence,{reservedBaseIds:reserved})
      .filter((candidate)=>candidate.actionable)
      .slice(0,5);
    state.candidatesByAssignment.set(Number(assignment.id),candidates);
  }
}
async function load(snapshot=boardSnapshot()) {
  if(!canonicalReady(snapshot)){state.observations=[];state.latest=[];state.evidence=null;state.candidatesByAssignment.clear();render(snapshot);return;}
  const losses=lossAssignments();
  if(!losses.length){state.observations=[];state.latest=[];state.evidence=null;state.candidatesByAssignment.clear();render(snapshot);return;}
  const requestId=++state.requestId;state.loading=true;state.error='';render(snapshot);
  try{
    const [cleanup,evidence]=await Promise.all([
      fetchJson(`${endpoint(snapshot)}?round=${Number(snapshot.round)}`),
      loadEvidence(snapshot,losses),
    ]);
    if(requestId!==state.requestId)return;
    state.observations=Array.isArray(cleanup?.observations)?cleanup.observations:[];
    state.latest=Array.isArray(cleanup?.latest)?cleanup.latest:[];
    state.evidence=evidence;
    rebuildCandidates(snapshot);
  }catch(error){if(requestId!==state.requestId)return;state.error=clean(error?.message||error||'Fleet cleanup state unavailable');state.evidence=null;state.candidatesByAssignment.clear();}
  finally{if(requestId===state.requestId){state.loading=false;render(snapshot);}}
}

function observationSummary(observation) {
  const units=Array.isArray(observation?.units)?observation.units:[];
  return Object.freeze({
    alive:units.filter((row)=>row.status==='alive'),
    destroyed:units.filter((row)=>row.status==='destroyed'),
    unknown:units.filter((row)=>row.status==='unknown'),
  });
}
function telemetryLabel(row) {
  if(row.status!=='alive')return row.status==='destroyed'?'Destroyed · explicitly confirmed':'State unknown';
  const parts=[];
  if(row.healthPct!=null)parts.push(`HP ~${row.healthPct}%`);
  if(row.protectionPct!=null)parts.push(`Prot ~${row.protectionPct}%`);
  if(row.turnMeterPct!=null)parts.push(`TM ~${row.turnMeterPct}%`);
  if(row.cooldownNotes)parts.push(`Cooldowns: ${row.cooldownNotes}`);
  if(row.statusNotes)parts.push(row.statusNotes);
  return parts.join(' · ')||'Alive · exact telemetry not entered';
}
function observationHtml(snapshot,observation) {
  const summary=observationSummary(observation);
  return `<div class="gac-cleanup-observation"><header><div><span>POST-LOSS STATE · REV ${observation.revision}</span><strong>${summary.alive.length} alive · ${summary.destroyed.length} destroyed · ${summary.unknown.length} unknown</strong><small>Only explicitly entered facts are treated as known. Unknown ships remain unknown.</small></div><button type="button" data-gac-cleanup-edit="${observation.assignmentId}|${observation.attemptIndex}">Add New Observation</button></header><div>${observation.units.map((row)=>`<article class="is-${escapeAttr(row.status)}">${portrait(unitFor(snapshot,row.baseId,'opponent'))}<div><strong>${escapeHtml(unitFor(snapshot,row.baseId,'opponent').name||row.baseId)}</strong><span>${escapeHtml(row.status.toUpperCase())}</span><small>${escapeHtml(telemetryLabel(row))}</small></div></article>`).join('')}</div>${observation.notes?`<p>${escapeHtml(observation.notes)}</p>`:''}</div>`;
}
function editorUnit(defense,id,existing=null) {
  const baseId=normalizeId(id);
  const row=existing?.units?.find((unit)=>normalizeId(unit.baseId)===baseId);
  return {
    baseId,
    status:clean(row?.status||'unknown').toLowerCase(),
    healthPct:row?.healthPct??'',
    protectionPct:row?.protectionPct??'',
    turnMeterPct:row?.turnMeterPct??'',
    cooldownNotes:clean(row?.cooldownNotes),
    statusNotes:clean(row?.statusNotes),
  };
}
function startEditor(assignmentId,attemptIndex) {
  const assignment=assignments().find((row)=>Number(row.id)===Number(assignmentId));
  const defense=defenseFor(assignment);
  if(!assignment||!defense)return;
  const existing=latestObservation(assignmentId,attemptIndex);
  state.editor={assignmentId:Number(assignmentId),attemptIndex:Number(attemptIndex),defense,units:allDefenseIds(defense).map((id)=>editorUnit(defense,id,existing)),notes:clean(existing?.notes)};
  render(boardSnapshot());
  document.querySelector('.gac-cleanup-editor')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function editorHtml(snapshot) {
  const editor=state.editor;if(!editor)return'';
  return `<section class="gac-cleanup-editor"><header><div><span>OBSERVE SURVIVING ENEMY FLEET</span><strong>Failed Attempt ${editor.attemptIndex+1}</strong><small>Set only what you can actually confirm after the battle. Health / protection / TM are optional visual estimates and remain null when not entered.</small></div><button type="button" data-gac-cleanup-editor-close>Close</button></header><div class="gac-cleanup-editor-list">${editor.units.map((row)=>{const alive=row.status==='alive';return `<article data-gac-cleanup-unit-row="${escapeAttr(row.baseId)}">${portrait(unitFor(snapshot,row.baseId,'opponent'))}<div class="gac-cleanup-editor-main"><strong>${escapeHtml(unitFor(snapshot,row.baseId,'opponent').name||row.baseId)}</strong><select data-gac-cleanup-status="${escapeAttr(row.baseId)}"><option value="unknown" ${row.status==='unknown'?'selected':''}>Unknown</option><option value="alive" ${row.status==='alive'?'selected':''}>Alive</option><option value="destroyed" ${row.status==='destroyed'?'selected':''}>Destroyed</option></select></div><div class="gac-cleanup-telemetry ${alive?'':'is-disabled'}"><label>HP %<input type="number" min="0" max="100" step="1" data-gac-cleanup-field="${escapeAttr(row.baseId)}|healthPct" value="${escapeAttr(row.healthPct)}" ${alive?'':'disabled'}></label><label>Prot %<input type="number" min="0" max="100" step="1" data-gac-cleanup-field="${escapeAttr(row.baseId)}|protectionPct" value="${escapeAttr(row.protectionPct)}" ${alive?'':'disabled'}></label><label>TM %<input type="number" min="0" max="100" step="1" data-gac-cleanup-field="${escapeAttr(row.baseId)}|turnMeterPct" value="${escapeAttr(row.turnMeterPct)}" ${alive?'':'disabled'}></label><label class="is-wide">Cooldown / status note<input type="text" maxlength="240" data-gac-cleanup-field="${escapeAttr(row.baseId)}|cooldownNotes" value="${escapeAttr(row.cooldownNotes)}" ${alive?'':'disabled'}></label></div></article>`;}).join('')}</div><label class="gac-cleanup-general-note">Battle-state notes<textarea maxlength="1000" data-gac-cleanup-notes>${escapeHtml(editor.notes)}</textarea></label><footer><button type="button" data-gac-cleanup-editor-close>Cancel</button><button type="button" data-gac-cleanup-save>Save Verified Observation</button></footer></section>`;
}
function updateEditorStatus(baseId,status) {
  const row=state.editor?.units?.find((unit)=>unit.baseId===normalizeId(baseId));if(!row)return;
  row.status=['alive','destroyed'].includes(status)?status:'unknown';
  if(row.status!=='alive'){row.healthPct='';row.protectionPct='';row.turnMeterPct='';row.cooldownNotes='';}
  render(boardSnapshot());
}
function updateEditorField(baseId,field,value) {
  const row=state.editor?.units?.find((unit)=>unit.baseId===normalizeId(baseId));if(!row)return;
  if(['healthPct','protectionPct','turnMeterPct','cooldownNotes','statusNotes'].includes(field))row[field]=value;
}
async function saveEditor(snapshot) {
  const editor=state.editor;if(!editor)return;
  const units=editor.units.map((row)=>({
    baseId:row.baseId,
    status:row.status,
    healthPct:row.status==='alive'&&clean(row.healthPct)!==''?Number(row.healthPct):null,
    protectionPct:row.status==='alive'&&clean(row.protectionPct)!==''?Number(row.protectionPct):null,
    turnMeterPct:row.status==='alive'&&clean(row.turnMeterPct)!==''?Number(row.turnMeterPct):null,
    cooldownNotes:row.status==='alive'?clean(row.cooldownNotes):'',
    statusNotes:clean(row.statusNotes),
  }));
  state.loading=true;state.error='';render(snapshot);
  try{
    await fetchJson(endpoint(snapshot),{method:'POST',body:JSON.stringify({round:Number(snapshot.round),opponentAllyCode:allyCode(snapshot.opponentCode),assignmentId:editor.assignmentId,attemptIndex:editor.attemptIndex,units,notes:clean(editor.notes),sourceRef:'gac-command-center-fleet-cleanup-control'})});
    state.editor=null;await load(snapshot);
  }catch(error){state.loading=false;state.error=clean(error?.message||error);render(snapshot);}
}

function candidateHtml(snapshot,assignment,observation) {
  const candidates=state.candidatesByAssignment.get(Number(assignment.id))||[];
  const summary=observationSummary(observation);
  if(!candidates.length)return `<div class="gac-cleanup-candidates is-empty"><strong>NO RESOURCE-SAFE HISTORICAL REFERENCE AVAILABLE</strong><span>Your observed residual state is saved, but the warehouse has no remaining owned non-overlapping fleet reference that passes the historical evidence gate.</span></div>`;
  return `<div class="gac-cleanup-candidates"><header><div><span>CLEANUP REFERENCES</span><strong>${candidates.length} remaining owned fleet reference${candidates.length===1?'':'s'}</strong><small>These samples are from the original/full enemy fleet history. They are not residual-specific win rates. Current observed state: ${summary.alive.length} alive · ${summary.destroyed.length} destroyed · ${summary.unknown.length} unknown.</small></div><b>FULL-FLEET HISTORICAL REFERENCE</b></header><div>${candidates.map((candidate,index)=>{const cap=unitFor(snapshot,candidate.counterCapitalShipBaseId);return `<article><div>${portrait(cap,'is-capital')}<div><span>HISTORICAL REFERENCE</span><strong>${escapeHtml(cap.name||candidate.counterCapitalShipBaseId)}</strong><small>${candidate.wins}/${candidate.battles} observed wins vs original/full fleet · ${escapeHtml(observedPercent(candidate.observedWinRate))}</small></div></div><p>${escapeHtml(candidate.reliability.label)} · ${escapeHtml(candidate.compositionMatch.label)} · residual state not represented by this sample</p><button type="button" data-gac-cleanup-candidate="${assignment.id}|${index}">Review Roles & Replan Cleanup</button></article>`;}).join('')}</div></div>`;
}
function startRoleEditor(assignmentId,candidateIndex) {
  const assignment=assignments().find((row)=>Number(row.id)===Number(assignmentId));
  const candidates=state.candidatesByAssignment.get(Number(assignmentId))||[];
  const candidate=candidates[Number(candidateIndex)];
  if(!assignment||!candidate)return;
  state.roleEditor={assignmentId:Number(assignmentId),defenseFleetId:Number(assignment.defenseFleetId),candidate,starters:[]};
  render(boardSnapshot());
  document.querySelector('.gac-cleanup-role-editor')?.scrollIntoView?.({behavior:'smooth',block:'center'});
}
function roleEditorHtml(snapshot) {
  const editor=state.roleEditor;if(!editor)return'';
  const candidate=editor.candidate;
  const capital=normalizeId(candidate.counterCapitalShipBaseId);
  const members=(candidate.fleetIds||[]).map(normalizeId).filter((id)=>id&&id!==capital);
  const selected=new Set(editor.starters.map(normalizeId));
  const reinforcements=members.filter((id)=>!selected.has(id));
  return `<section class="gac-cleanup-role-editor"><header><div><span>REPLAN CLEANUP FLEET</span><strong>Confirm the cleanup starting three</strong><small>The fleet composition comes from full-fleet historical evidence; starter roles are still confirmed by you. This does not convert the historical observed rate into a residual-state prediction.</small></div><button type="button" data-gac-cleanup-role-close>Close</button></header><div class="gac-cleanup-role-capital">${portrait(unitFor(snapshot,capital),'is-capital')}<strong>${escapeHtml(unitFor(snapshot,capital).name||capital)}</strong></div><div class="gac-cleanup-role-members">${members.map((id)=>`<button type="button" class="${selected.has(id)?'is-starter':'is-reinforcement'}" data-gac-cleanup-role-toggle="${escapeAttr(id)}">${portrait(unitFor(snapshot,id))}<b>${selected.has(id)?'STARTER':'REINFORCEMENT'}</b></button>`).join('')}</div><footer><span>${selected.size}/3 starters · ${reinforcements.length} reinforcements</span><button type="button" data-gac-cleanup-role-save ${selected.size===3&&reinforcements.length<=4?'':'disabled'}>Lock Cleanup Fleet</button></footer></section>`;
}
function toggleRole(id) {
  if(!state.roleEditor)return;id=normalizeId(id);const set=new Set(state.roleEditor.starters.map(normalizeId));if(set.has(id))set.delete(id);else if(set.size<3)set.add(id);state.roleEditor.starters=[...set];render(boardSnapshot());
}
async function lockCleanup(snapshot) {
  const editor=state.roleEditor;if(!editor||editor.starters.length!==3)return;
  const candidate=editor.candidate;const capital=normalizeId(candidate.counterCapitalShipBaseId);const all=(candidate.fleetIds||[]).map(normalizeId).filter((id)=>id&&id!==capital);const starters=editor.starters.map(normalizeId);const reinforcements=all.filter((id)=>!starters.includes(id));
  if(reinforcements.length>4){state.error='Historical fleet member set exceeds the canonical reinforcement limit; choose another cleanup reference.';render(snapshot);return;}
  state.loading=true;state.error='';render(snapshot);
  try{
    await fetchJson(planEndpoint(snapshot),{method:'POST',body:JSON.stringify({round:Number(snapshot.round),defenseFleetId:editor.defenseFleetId,capitalShipBaseId:capital,starters,reinforcements,sourceRef:'gac-command-center-fleet-cleanup-lock'})});
    state.roleEditor=null;window.dispatchEvent(new CustomEvent('gac-fleet-canonical-updated',{detail:{reason:'cleanup-replan'}}));setTimeout(()=>load(snapshot),220);
  }catch(error){state.loading=false;state.error=clean(error?.message||error);render(snapshot);}
}

function cleanupRowHtml(snapshot,assignment) {
  const attemptIndex=latestLossIndex(assignment);const observation=latestObservation(assignment.id,attemptIndex);const defense=defenseFor(assignment);const enemyCap=unitFor(snapshot,defense?.capitalShipBaseId,'opponent');
  return `<article class="gac-cleanup-loss-row"><header><div><span>UNRESOLVED FLEET LOSS · ATTEMPT ${attemptIndex+1}</span><strong>${escapeHtml(enemyCap.name||defense?.capitalShipBaseId||'Enemy fleet')}</strong><small>Lost attack fleet is permanently consumed for this round.</small></div><b>${observation?'OBSERVED STATE SAVED':'POST-LOSS STATE REQUIRED'}</b></header>${observation?observationHtml(snapshot,observation):`<div class="gac-cleanup-required"><strong>DO NOT REPLAN FROM THE ORIGINAL BOARD SNAPSHOT</strong><span>Record what actually survived the failed attack first. Command Center will not infer destroyed ships, health, protection, turn meter, cooldowns, or hidden reinforcements.</span><button type="button" data-gac-cleanup-edit="${assignment.id}|${attemptIndex}">Enter Observed Post-Battle State</button></div>`}${observation?candidateHtml(snapshot,assignment,observation):''}</article>`;
}
function render(snapshot=boardSnapshot()) {
  const host=document.querySelector('[data-gac-fleet-round-operations]');if(!host)return;
  host.querySelector('[data-gac-fleet-cleanup-control]')?.remove();
  const losses=lossAssignments();if(!canonicalReady(snapshot)||!losses.length)return;
  const section=document.createElement('section');section.className='gac-fleet-cleanup-control';section.dataset.gacFleetCleanupControl='true';
  section.innerHTML=`<header class="gac-cleanup-head"><div><span>FLEET CLEANUP CONTROL</span><strong>${losses.length} unresolved failed fleet defense${losses.length===1?'':'s'}</strong><p>Cleanup planning is gated by the enemy state you explicitly observe after the loss. Unknown remains unknown; historical references stay labeled as full-fleet evidence.</p></div><div class="${state.error?'is-error':state.loading?'is-loading':'is-ready'}"><b>${state.loading?'SYNCING':state.error?'CLEANUP STATE ERROR':'TRUTH GATE ACTIVE'}</b><small>${state.error?escapeHtml(state.error):'No residual-state prediction'}</small></div></header>${losses.map((assignment)=>cleanupRowHtml(snapshot,assignment)).join('')}${editorHtml(snapshot)}${roleEditorHtml(snapshot)}`;
  host.append(section);
}
function bind() {
  if(document.documentElement.dataset.gacFleetCleanupBound==='true')return;document.documentElement.dataset.gacFleetCleanupBound='true';
  document.addEventListener('click',(event)=>{
    const edit=event.target.closest?.('[data-gac-cleanup-edit]');if(edit){const [id,index]=clean(edit.dataset.gacCleanupEdit).split('|');startEditor(Number(id),Number(index));return;}
    if(event.target.closest?.('[data-gac-cleanup-editor-close]')){state.editor=null;render();return;}
    if(event.target.closest?.('[data-gac-cleanup-save]')){void saveEditor(boardSnapshot());return;}
    const candidate=event.target.closest?.('[data-gac-cleanup-candidate]');if(candidate){const [id,index]=clean(candidate.dataset.gacCleanupCandidate).split('|');startRoleEditor(Number(id),Number(index));return;}
    if(event.target.closest?.('[data-gac-cleanup-role-close]')){state.roleEditor=null;render();return;}
    const toggle=event.target.closest?.('[data-gac-cleanup-role-toggle]');if(toggle){toggleRole(toggle.dataset.gacCleanupRoleToggle);return;}
    if(event.target.closest?.('[data-gac-cleanup-role-save]')){void lockCleanup(boardSnapshot());return;}
  },true);
  document.addEventListener('change',(event)=>{
    if(event.target?.matches?.('[data-gac-cleanup-status]')){updateEditorStatus(event.target.dataset.gacCleanupStatus,event.target.value);return;}
  },true);
  document.addEventListener('input',(event)=>{
    if(event.target?.matches?.('[data-gac-cleanup-field]')){const [id,field]=clean(event.target.dataset.gacCleanupField).split('|');updateEditorField(id,field,event.target.value);return;}
    if(event.target?.matches?.('[data-gac-cleanup-notes]')&&state.editor)state.editor.notes=event.target.value;
  },true);
  window.addEventListener('gac-fleet-round-state-updated',()=>schedule(120));
  window.addEventListener('gac-fleet-canonical-updated',()=>schedule(220));
  window.addEventListener('gac-v2-matchup-loaded',()=>schedule(260));
}
function schedule(delay=120) {
  clearTimeout(state.timer);state.timer=setTimeout(()=>{const snapshot=boardSnapshot();const key=contextKey(snapshot);if(key!==state.contextKey){state.contextKey=key;state.observations=[];state.latest=[];state.evidence=null;state.candidatesByAssignment.clear();state.editor=null;state.roleEditor=null;}void load(snapshot);},Math.max(0,delay));
}
function injectStyle() {
  if(document.querySelector('link[data-gac-fleet-cleanup-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-fleet-cleanup-control.css?v=20260821-cleanup1';link.dataset.gacFleetCleanupStyle='true';document.head.appendChild(link);
}

if(typeof document!=='undefined'){
  injectStyle();bind();schedule(900);document.addEventListener('DOMContentLoaded',()=>schedule(300),{once:true});
  new MutationObserver(()=>{if(document.querySelector('[data-gac-fleet-round-operations]')&&!document.querySelector('[data-gac-fleet-cleanup-control]')&&lossAssignments().length)schedule(100);}).observe(document.documentElement,{childList:true,subtree:true});
}

export {
  allDefenseIds,
  canonicalReady,
  contextKey,
  latestLossIndex,
  observationSummary,
  usedFleetIds,
};
