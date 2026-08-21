import { bestCoverage, loadEligibilityContext } from './gac-datacron-eligibility.js';
import { cleanupCandidatePlan, normalizeId } from './gac-cleanup-intelligence-model.js';

const state = {
  key:'', assignments:[], ownerRoster:null, opponentRoster:null, defenses:[], ownDefenses:[], eligibility:null,
  busy:new Set(), errors:new Map(), requestId:0, timer:null,
};

const clean=(value)=>String(value??'').trim();
const allyCode=(value)=>clean(value).replace(/\D/g,'').slice(0,9);
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=new Intl.NumberFormat('en-US');

function identity(){
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode);
  const opponent=allyCode(document.getElementById('gacOpponentCode')?.value||document.querySelector('[data-gacv2-opponent]')?.value);
  const round=Number(document.getElementById('gacBracketRound')?.value||document.querySelector('[data-gacv2-round]')?.value);
  const size=Number(document.getElementById('gacMode')?.value||document.querySelector('[data-gacv2-mode]')?.value)===3?3:5;
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,size,key:`${mine}|${opponent}|${round}|${size}`});
}
async function fetchJson(pathname,options={}){
  const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body?.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
  return body;
}
function assignmentFor(defenseId){return state.assignments.find((row)=>Number(row?.defenseId)===Number(defenseId))||null;}
function defenseFor(defenseId){return state.defenses.find((row)=>Number(row?.id)===Number(defenseId))||assignmentFor(defenseId)?.defense||null;}
function hasRecordedLoss(assignment={}){return (Array.isArray(assignment?.attemptLog)?assignment.attemptLog:[]).some((attempt)=>clean(attempt?.status).toLowerCase()==='loss');}
function needsCleanupReplan(assignment={}){const status=clean(assignment?.status).toLowerCase();return status==='loss'||(status==='abandoned'&&hasRecordedLoss(assignment));}
function isActiveCleanup(assignment={}){return clean(assignment?.planKind).toLowerCase()==='cleanup'&&['planned','attempted'].includes(clean(assignment?.status).toLowerCase());}
function unitIndex(roster){return new Map((Array.isArray(roster?.units)?roster.units:[]).map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));}
function unitFor(roster,id){return unitIndex(roster).get(normalizeId(id))||{baseId:normalizeId(id),name:normalizeId(id)};}
function imageUrl(unit={}){return clean(unit.image||unit.imageUrl||unit.portrait||unit.portraitUrl||unit.thumbnail||unit.icon);}
function portrait(roster,id,cls=''){
  const unit=unitFor(roster,id);const name=clean(unit?.name||unit?.baseId||id)||'Unknown';const image=imageUrl(unit);
  return `<span class="gac-b10-unit ${escapeHtml(cls)}" title="${escapeHtml(name)}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:`<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}
function ownDatacron(candidate){
  if(!candidate?.squad?.length||!state.eligibility||!Array.isArray(state.ownerRoster?.datacrons))return null;
  try{return bestCoverage(state.ownerRoster.datacrons,candidate.squad,state.eligibility.unitIndex,state.eligibility.datacronCatalog)||null;}catch{return null;}
}
function disableLegacyLossRetry(card){
  const assignment=assignmentFor(Number(card?.dataset?.defenseId));
  const visibleLoss=clean(card?.querySelector('.gac-war-attempt-log')?.textContent).toUpperCase().includes('LOSS');
  if(!needsCleanupReplan(assignment)&&!card?.classList?.contains('gac-war-is-loss')&&!visibleLoss)return;
  card.dataset.recommendedAttackerMembers='';card.dataset.recommendedAttackerLeader='';card.dataset.recommendedDatacronId='';
  const lane=card.querySelector('.gac-war-room-counter-lane .gac-board-units');
  if(lane)lane.innerHTML='<div class="gac-board-no-counter">Original-defense retry disabled. Cleanup uses only confirmed surviving defenders.</div>';
  const legacy=card.querySelector('[data-war-action="lock"]');
  if(legacy){legacy.disabled=true;legacy.textContent='Use Cleanup Intelligence Below';legacy.classList.add('is-muted');}
}
function lockedCleanupHtml(assignment){
  const survivors=(Array.isArray(assignment?.cleanup?.survivorBaseIds)?assignment.cleanup.survivorBaseIds:[]).map(normalizeId).filter(Boolean);
  const status=clean(assignment?.status).toUpperCase()||'PLANNED';
  return `<section class="gac-b10-cleanup is-locked" data-gac-b10-cleanup><header><div><span>FAILURE & CLEANUP INTELLIGENCE · B10</span><strong>LOCKED CLEANUP TARGET · ${status}</strong><small>Residual defender identity comes from the confirmed prior-loss state, not the original saved squad.</small></div><b>RESIDUAL LOCK</b></header><div class="gac-b10-survivors"><span>DEFENDERS ALIVE AT CLEANUP START</span><div>${survivors.length?survivors.map((id)=>portrait(state.opponentRoster,id,'is-enemy')).join(''):'<small>Residual survivor set unavailable — execution should remain blocked.</small>'}</div></div><div class="gac-b10-telemetry"><strong>POST-BATTLE TELEMETRY</strong><span>TM UNKNOWN · HP UNKNOWN · PROTECTION UNKNOWN · cooldowns not inferred</span></div><div class="gac-b10-boundary"><strong>EXECUTION IDENTITY</strong><span>B08 pre-battle fingerprint uses these survivor IDs with the original verified zone, slot, and Datacron truth.</span></div></section>`;
}
function candidateHtml(current,assignment,candidate,index){
  const coverage=ownDatacron(candidate);const datacronId=clean(coverage?.datacron?.id);const members=(candidate?.squad||[]).map((unit)=>normalizeId(unit)).filter(Boolean);
  const leader=members[0]||'';const busy=state.busy.has(Number(assignment.id));
  return `<article class="gac-b10-candidate" data-gac-b10-candidate="${index}">
    <header><span>CLEANUP OPTION ${index+1}</span><strong>${escapeHtml(candidate.confidence||'Roster-fit candidate')}</strong><b>FIT ${number.format(Number(candidate.score)||0)}</b></header>
    <div class="gac-b10-squad">${members.map((id)=>portrait(state.ownerRoster,id)).join('')}</div>
    <div class="gac-b10-metrics"><span>Relic Δ ${number.format(Number(candidate.relicDelta)||0)}</span><span>${escapeHtml(candidate.speedProfile?.label||'Speed evidence incomplete')}</span><span>${number.format(Number(candidate.reserveUses?.length)||0)} reserve uses</span></div>
    <div class="gac-b10-dc"><strong>OWN DATACRON</strong><span>${datacronId?`Recommended exact live ID · ${escapeHtml(datacronId.slice(-10))}`:'No fully resolved owned Datacron match selected'}</span></div>
    <small class="gac-b10-prediction-boundary">ROSTER-FIT CLEANUP HEURISTIC · NOT A WIN PROBABILITY · starting TM / HP / Protection remain unknown.</small>
    <button type="button" data-gac-b10-lock data-defense-id="${Number(assignment.defenseId)}" data-members="${escapeHtml(members.join(','))}" data-leader="${escapeHtml(leader)}" data-datacron-id="${escapeHtml(datacronId)}" ${busy||!leader?'disabled':''}>${busy?'LOCKING…':'LOCK CLEANUP COUNTER'}</button>
  </article>`;
}
function panelHtml(current,assignment,defense){
  const plan=cleanupCandidatePlan({ownerRoster:state.ownerRoster,opponentRoster:state.opponentRoster,assignment,defense,assignments:state.assignments,ownDefenses:state.ownDefenses,size:current.size,limit:5});
  const error=clean(state.errors.get(Number(assignment.id)));
  if(!plan.ready){
    return `<section class="gac-b10-cleanup is-blocked" data-gac-b10-cleanup><header><div><span>FAILURE & CLEANUP INTELLIGENCE · B10</span><strong>CLEANUP TRUTH BLOCKED</strong></div><b>${escapeHtml(plan.truth?.code||'UNKNOWN')}</b></header><p>${escapeHtml(plan.truth?.detail||'Cleanup state is unavailable.')}</p><div class="gac-b10-boundary"><strong>NO RESIDUAL COUNTER GENERATED</strong><span>The original defense is not treated as the current battle state. Confirmed survivor identities are required.</span></div>${error?`<div class="gac-b10-error">${escapeHtml(error)}</div>`:''}</section>`;
  }
  const survivors=plan.truth.survivorBaseIds||[];
  return `<section class="gac-b10-cleanup is-ready" data-gac-b10-cleanup>
    <header><div><span>FAILURE & CLEANUP INTELLIGENCE · B10</span><strong>${survivors.length} CONFIRMED SURVIVOR${survivors.length===1?'':'S'} · CLEANUP READY</strong><small>Loss attempt ${Number(plan.truth.attemptIndex)+1} · ${plan.excludedBaseIds.length} round resources excluded</small></div><b>RESIDUAL TRUTH</b></header>
    <div class="gac-b10-survivors"><span>CONFIRMED ENEMY SURVIVORS</span><div>${survivors.map((id)=>portrait(state.opponentRoster,id,'is-enemy')).join('')}</div></div>
    <div class="gac-b10-telemetry"><strong>POST-BATTLE TELEMETRY</strong><span>TM UNKNOWN · HP UNKNOWN · PROTECTION UNKNOWN · cooldowns not inferred</span></div>
    <div class="gac-b10-resource"><strong>RESOURCE LOCK</strong><span>${plan.excludedBaseIds.length} characters are unavailable because they were consumed, are on verified defense, or are committed to another active plan.</span></div>
    ${plan.candidates.length?`<div class="gac-b10-options">${plan.candidates.map((candidate,index)=>candidateHtml(current,assignment,candidate,index)).join('')}</div>`:`<div class="gac-b10-boundary"><strong>NO LEGAL CLEANUP SQUAD FOUND</strong><span>No full ${current.size}-character roster-fit squad remains after round resource exclusions.</span></div>`}
    ${error?`<div class="gac-b10-error"><strong>LOCK REJECTED</strong><span>${escapeHtml(error)}</span></div>`:''}
  </section>`;
}
function renderCard(card,current){
  card.querySelector('[data-gac-b10-cleanup]')?.remove();
  const defenseId=Number(card?.dataset?.defenseId);const assignment=assignmentFor(defenseId);
  if(!assignment)return;
  const anchor=card.querySelector('[data-gac-result-history]')||card.querySelector('.gac-war-room')||card;
  if(isActiveCleanup(assignment)){anchor.insertAdjacentHTML('afterend',lockedCleanupHtml(assignment));return;}
  if(!needsCleanupReplan(assignment))return;
  disableLegacyLossRetry(card);
  const defense=defenseFor(defenseId)||{};
  anchor.insertAdjacentHTML('afterend',panelHtml(current,assignment,defense));
}
function renderAll(){const current=identity();if(!current)return;for(const card of document.querySelectorAll('#gacBoardPlannerGrid .gac-saved-board-card'))renderCard(card,current);}
async function load(force=false){
  const current=identity();if(!current)return;
  if(!force&&state.key===current.key&&state.assignments.length&&state.ownerRoster&&state.opponentRoster){renderAll();return;}
  const requestId=++state.requestId;
  try{
    const [warRoom,ownerRoster,opponentRoster,board,ownBoard,eligibility]=await Promise.all([
      fetchJson(`/api/gac/attack-plan/${current.mine}?round=${current.round}`),fetchJson(`/api/player/${current.mine}`),fetchJson(`/api/player/${current.opponent}`),fetchJson(`/api/gac/current-board/${current.mine}/defense?round=${current.round}`),fetchJson(`/api/gac/current-board/${current.mine}/my-defense?round=${current.round}`),loadEligibilityContext().catch(()=>null),
    ]);
    if(requestId!==state.requestId)return;
    if(allyCode(board?.opponent?.allyCode)!==current.opponent)throw new Error('Verified board opponent does not match selected opponent.');
    if(state.key!==current.key){state.errors.clear();state.busy.clear();}
    state.key=current.key;state.assignments=Array.isArray(warRoom?.assignments)?warRoom.assignments:[];state.ownerRoster=ownerRoster;state.opponentRoster=opponentRoster;state.defenses=Array.isArray(board?.defenses)?board.defenses:[];state.ownDefenses=Array.isArray(ownBoard?.defenses)?ownBoard.defenses:[];state.eligibility=eligibility;
    renderAll();
  }catch(error){if(requestId===state.requestId)console.warn('GAC B10 cleanup intelligence unavailable',error);}
}
async function lockCleanup(button){
  const current=identity();if(!current)return;
  const defenseId=Number(button?.dataset?.defenseId);const assignment=assignmentFor(defenseId);if(!assignment?.id||!needsCleanupReplan(assignment))return;
  const members=clean(button.dataset.members).split(',').map(normalizeId).filter(Boolean);const leaderBaseId=normalizeId(button.dataset.leader);const datacronId=clean(button.dataset.datacronId);const id=Number(assignment.id);
  if(state.busy.has(id))return;state.busy.add(id);state.errors.delete(id);renderAll();
  try{
    await fetchJson(`/api/gac/attack-plan/${current.mine}`,{method:'POST',body:JSON.stringify({round:current.round,defenseId,leaderBaseId,members,datacronId})});
    window.dispatchEvent(new CustomEvent('gac-war-room-updated',{detail:{action:'cleanup-counter-locked',assignmentId:id,defenseId}}));await load(true);
  }catch(error){state.errors.set(id,clean(error?.message||error));}
  finally{state.busy.delete(id);renderAll();}
}
function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}
function injectStyle(){if(document.querySelector('link[data-gac-b10-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/gac-cleanup-intelligence-ui.css?v=20260821-b10a';link.dataset.gacB10Style='true';document.head.appendChild(link);}
function bind(){
  injectStyle();
  document.addEventListener('click',(event)=>{
    const legacy=event.target.closest?.('#gacBoardPlannerGrid [data-war-action="lock"]');
    if(legacy){const card=legacy.closest('.gac-saved-board-card');const assignment=assignmentFor(Number(card?.dataset?.defenseId));const visibleLoss=clean(card?.querySelector('.gac-war-attempt-log')?.textContent).toUpperCase().includes('LOSS');if(card?.classList?.contains('gac-war-is-loss')||visibleLoss||needsCleanupReplan(assignment)){event.preventDefault();event.stopImmediatePropagation();disableLegacyLossRetry(card);if(assignment)renderCard(card,identity());card.querySelector('[data-gac-b10-cleanup]')?.scrollIntoView?.({behavior:'smooth',block:'center'});return;}}
    const lock=event.target.closest?.('[data-gac-b10-lock]');if(lock){event.preventDefault();const card=lock.closest('.gac-saved-board-card');if(card)void lockCleanup(lock);}
  },true);
  document.addEventListener('change',(event)=>{if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode]'))schedule(120,true);},true);
  window.addEventListener('gac-saved-board-rendered',()=>schedule(50,true));window.addEventListener('gac-war-room-updated',()=>schedule(70,true));window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));document.addEventListener('DOMContentLoaded',()=>schedule(200,true),{once:true});schedule(400,true);
}
if(typeof document!=='undefined')bind();

export { disableLegacyLossRetry, hasRecordedLoss, identity, isActiveCleanup, lockCleanup, needsCleanupReplan, renderAll };
