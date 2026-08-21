import { bestCoverage, loadEligibilityContext } from './gac-datacron-eligibility.js';
import { cleanupCandidatePlan, normalizeId } from './gac-cleanup-intelligence-model.js';
import { cleanupAttackBrief, cleanupResidualTruth } from './gac-cleanup-attack-brief-model.js';
import { findStrategyGuidance } from './gac-strategy-catalog.js';

const CARD_SELECTOR='[data-gac-board-workspace] .gac-visible-defense[data-defense-id]';
const state={
  key:'',assignments:[],ownerRoster:null,opponentRoster:null,defenses:[],ownDefenses:[],eligibility:null,
  busy:new Set(),errors:new Map(),requestId:0,timer:null,
};

const clean=(value)=>String(value??'').trim();
const allyCode=(value)=>clean(value).replace(/\D/g,'').slice(0,9);
const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function identity(){
  const mine=allyCode(document.getElementById('allyCode')?.value||window.__swgohAccountAllyCode||window.__swgohPlayerRosterSnapshot?.allyCode);
  const opponent=allyCode(document.querySelector('[data-gacv2-opponent]')?.value||document.getElementById('gacOpponentCode')?.value);
  const round=Number(document.querySelector('[data-gacv2-round]')?.value||document.getElementById('gacBracketRound')?.value);
  const size=Number(document.querySelector('[data-gac-board-format]')?.value||document.querySelector('[data-gacv2-mode]')?.value||document.getElementById('gacMode')?.value)===3?3:5;
  if(!/^\d{9}$/.test(mine)||!/^\d{9}$/.test(opponent)||![1,2,3].includes(round))return null;
  return Object.freeze({mine,opponent,round,size,format:size===3?'3v3':'5v5',key:`${mine}|${opponent}|${round}|${size}`});
}

async function fetchJson(pathname,options={}){
  const response=await fetch(pathname,{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body?.error||`HTTP ${response.status}`);error.status=response.status;throw error;}
  return body;
}

function assignmentFor(defenseId){return state.assignments.find((row)=>Number(row?.defenseId)===Number(defenseId))||null;}
function defenseFor(defenseId){return state.defenses.find((row)=>Number(row?.id)===Number(defenseId))||assignmentFor(defenseId)?.defense||null;}
function hasRecordedLoss(assignment={}){return (Array.isArray(assignment?.attemptLog)?assignment.attemptLog:[]).some((row)=>clean(row?.status).toLowerCase()==='loss');}
function needsCleanup(assignment={}){const status=clean(assignment?.status).toLowerCase();return status==='loss'||(status==='abandoned'&&hasRecordedLoss(assignment));}
function activeCleanup(assignment={}){return clean(assignment?.planKind).toLowerCase()==='cleanup'&&['planned','attempted'].includes(clean(assignment?.status).toLowerCase());}
function unitIndex(roster={}){return new Map((Array.isArray(roster?.units)?roster.units:[]).map((unit)=>[normalizeId(unit),unit]).filter(([id])=>id));}
function unitFor(roster,id){return unitIndex(roster).get(normalizeId(id))||{baseId:normalizeId(id),name:normalizeId(id)};}
function portrait(roster,id,cls=''){
  const unit=unitFor(roster,id);const name=clean(unit?.name||unit?.baseId||id)||'Unknown';const image=clean(unit?.image||unit?.imageUrl||unit?.portrait||unit?.portraitUrl||unit?.thumbnail||unit?.icon);
  return `<span class="gac-b10-unit ${escapeHtml(cls)}" data-inspect-base-id="${escapeHtml(normalizeId(id))}" title="${escapeHtml(name)}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:`<b>${escapeHtml(name.slice(0,2).toUpperCase())}</b>`}<small>${escapeHtml(name)}</small></span>`;
}

function ownDatacron(candidate){
  if(!candidate?.squad?.length||!state.eligibility||!Array.isArray(state.ownerRoster?.datacrons))return null;
  try{return bestCoverage(state.ownerRoster.datacrons,candidate.squad,state.eligibility.unitIndex,state.eligibility.datacronCatalog)||null;}catch{return null;}
}

function suppressOriginalRetry(card,assignment){
  if(!needsCleanup(assignment))return false;
  const normal=card.querySelector('[data-gac-manual-dc-lock],[data-gac-manual-war-action="lock"]');
  if(normal){
    delete normal.dataset.gacManualDcLock;
    delete normal.dataset.gacManualWarAction;
    normal.dataset.gacManualCleanupOpen='true';
    normal.textContent='USE CLEANUP INTELLIGENCE';
  }
  const counter=card.querySelector('.gac-manual-war-counter:not(.is-locked):not(.is-cleared)');
  if(counter)counter.innerHTML='<div><strong>ORIGINAL-DEFENSE RETRY BLOCKED</strong><span>Cleanup recommendations use only confirmed surviving defenders from the recorded loss.</span></div>';
  card.querySelector('[data-gac-manual-dc]')?.remove();
  return true;
}

function candidateHtml(ctx,assignment,candidate,index){
  const members=(candidate?.squad||[]).map((unit)=>normalizeId(unit)).filter(Boolean);
  const leader=members[0]||'';const coverage=ownDatacron(candidate);const datacronId=clean(coverage?.datacron?.id);const busy=state.busy.has(Number(assignment?.id));
  return `<article class="gac-b10-candidate" data-gac-manual-cleanup-candidate="${index}"><header><span>CLEANUP OPTION ${index+1}</span><strong>${escapeHtml(candidate?.confidence||'Roster-fit cleanup')}</strong><b>FIT ${Number(candidate?.score)||0}</b></header><div class="gac-b10-squad">${members.map((id)=>portrait(state.ownerRoster,id)).join('')}</div><div class="gac-b10-metrics"><span>Relic Δ ${Number(candidate?.relicDelta)||0}</span><span>${escapeHtml(candidate?.speedProfile?.label||'Speed evidence incomplete')}</span><span>${Number(candidate?.reserveUses?.length)||0} reserve uses</span></div><div class="gac-b10-dc"><strong>OWN DATACRON</strong><span>${datacronId?`Exact live match · …${escapeHtml(datacronId.slice(-8))}`:'No fully resolved owned Datacron selected'}</span></div><small class="gac-b10-prediction-boundary">ROSTER-FIT CLEANUP HEURISTIC · NOT A WIN PROBABILITY · TM / HP / Protection remain unknown.</small><button type="button" data-gac-manual-cleanup-lock data-defense-id="${Number(assignment?.defenseId)}" data-members="${escapeHtml(members.join(','))}" data-leader="${escapeHtml(leader)}" data-datacron-id="${escapeHtml(datacronId)}" ${busy||members.length!==ctx.size?'disabled':''}>${busy?'LOCKING…':'LOCK CLEANUP COUNTER'}</button></article>`;
}

function cleanupPlanHtml(ctx,assignment,defense){
  const plan=cleanupCandidatePlan({ownerRoster:state.ownerRoster,opponentRoster:state.opponentRoster,assignment,defense,assignments:state.assignments,ownDefenses:state.ownDefenses,size:ctx.size,limit:5});
  const error=clean(state.errors.get(Number(assignment?.id)));
  if(!plan.ready)return `<section class="gac-b10-cleanup is-blocked" data-gac-manual-cleanup><header><div><span>MANUAL WAR ROOM · CLEANUP</span><strong>CLEANUP TRUTH BLOCKED</strong></div><b>${escapeHtml(plan.truth?.code||'UNKNOWN')}</b></header><p>${escapeHtml(plan.truth?.detail||'Confirmed survivor state is required.')}</p><div class="gac-b10-boundary"><strong>NO FULL-DEFENSE RETRY</strong><span>The original defense is not treated as the current battle state. Confirm survivors from the result panel before generating another counter.</span></div>${error?`<div class="gac-b10-error">${escapeHtml(error)}</div>`:''}</section>`;
  const survivors=plan.truth.survivorBaseIds||[];
  return `<section class="gac-b10-cleanup is-ready" data-gac-manual-cleanup><header><div><span>MANUAL WAR ROOM · CLEANUP</span><strong>${survivors.length} CONFIRMED SURVIVOR${survivors.length===1?'':'S'} · CLEANUP READY</strong><small>Loss attempt ${Number(plan.truth.attemptIndex)+1} · ${plan.excludedBaseIds.length} round resources unavailable</small></div><b>RESIDUAL TRUTH</b></header><div class="gac-b10-survivors"><span>CONFIRMED ENEMY SURVIVORS</span><div>${survivors.map((id)=>portrait(state.opponentRoster,id,'is-enemy')).join('')}</div></div><div class="gac-b10-telemetry"><strong>POST-BATTLE TELEMETRY</strong><span>TM UNKNOWN · HP UNKNOWN · PROTECTION UNKNOWN · cooldowns not inferred</span></div><div class="gac-b10-resource"><strong>ROUND RESOURCE LOCK</strong><span>${plan.excludedBaseIds.length} characters excluded because they were consumed, reserved, or placed on verified defense.</span></div>${plan.candidates.length?`<div class="gac-b10-options">${plan.candidates.map((candidate,index)=>candidateHtml(ctx,assignment,candidate,index)).join('')}</div>`:`<div class="gac-b10-boundary"><strong>NO LEGAL CLEANUP SQUAD FOUND</strong><span>No complete ${ctx.size}-character squad remains after round-wide exclusions.</span></div>`}${error?`<div class="gac-b10-error"><strong>LOCK REJECTED</strong><span>${escapeHtml(error)}</span></div>`:''}</section>`;
}

function mechanicIds(datacron){return [...new Set((Array.isArray(datacron?.affixes)?datacron.affixes:[]).map((row)=>clean(row?.abilityId||row?.mechanicId)).filter(Boolean))].sort();}
function dcContext(datacron,stateInput=''){
  const requested=clean(stateInput).toLowerCase();
  if(requested==='none')return Object.freeze({known:true,state:'none',setId:'',mechanicIds:Object.freeze([])});
  if(!datacron)return Object.freeze({known:false,state:requested==='assigned'?'assigned':'unknown',setId:'',mechanicIds:Object.freeze([])});
  return Object.freeze({known:true,state:'assigned',setId:clean(datacron?.setId),mechanicIds:Object.freeze(mechanicIds(datacron))});
}
function attackerDc(assignment){return assignment?.datacron?.id?dcContext(assignment.datacron,'assigned'):dcContext(null,'none');}
function defenderDc(defense){const status=clean(defense?.datacronState).toLowerCase();if(status==='none')return dcContext(null,'none');return defense?.datacron?.id?dcContext(defense.datacron,'assigned'):dcContext(null,status||'unknown');}

async function strategyFor(ctx,assignment,defense){
  const residual=cleanupResidualTruth(assignment,defense,state.opponentRoster);if(!residual.ready)return null;
  try{return await findStrategyGuidance({format:ctx.format,defenderMembers:residual.survivorBaseIds,attackerMembers:(assignment?.members||[]).map(normalizeId).filter(Boolean),attackerDatacron:attackerDc(assignment),defenderDatacron:defenderDc(defense),now:Date.now()});}catch{return null;}
}

function guidanceHtml(execution={}){
  if(execution?.available!==true)return `<section class="gac-b11-exec is-gated"><span>SOURCE-GATED EXECUTION</span><strong>${escapeHtml(execution?.label||'NO SOURCED CLEANUP SEQUENCE')}</strong><p>${escapeHtml(execution?.reason||'No approved exact strategy record matches this residual state.')}</p><small>No opener or target order is inferred from roster-fit scoring.</small></section>`;
  const g=execution.guidance||{};const list=(label,rows)=>Array.isArray(rows)&&rows.length?`<div><strong>${escapeHtml(label)}</strong><ol>${rows.map((row)=>`<li>${escapeHtml(row?.text||row)}</li>`).join('')}</ol></div>`:'';
  return `<section class="gac-b11-exec"><span>EXACT SOURCED EXECUTION</span><strong>${escapeHtml(g.sourceName||'Approved strategy record')}</strong><div class="gac-b11-guidance">${list('OPENING',g.opening)}${list('TARGETS',g.targets)}${list('MECHANICS',g.mechanics)}${list('AVOID',g.avoid)}</div></section>`;
}

async function cleanupBriefHtml(ctx,assignment,defense){
  const strategy=await strategyFor(ctx,assignment,defense);
  const brief=cleanupAttackBrief({assignment,defense,ownerRoster:state.ownerRoster,opponentRoster:state.opponentRoster,assignments:state.assignments,ownDefenses:state.ownDefenses,size:ctx.size,strategyMatch:strategy});
  const survivors=brief?.residual?.survivorBaseIds||assignment?.cleanup?.survivorBaseIds||[];const attackers=brief?.attack?.ids||assignment?.members||[];
  return `<section class="gac-b11-brief ${brief.ready?'is-ready':'is-blocked'}" data-gac-manual-cleanup-brief><header><div><span>MANUAL CLEANUP ATTACK BRIEF · B11</span><strong>${brief.ready?'RESIDUAL BATTLE PLAN VERIFIED':'CLEANUP BRIEF BLOCKED'}</strong><small>${clean(assignment?.status).toUpperCase()} · recovery chain after recorded loss</small></div><b>${brief.source==='approved-exact-strategy'?'SOURCED':'HEURISTIC'}</b></header><div class="gac-b11-grid"><section><span>CONFIRMED RESIDUAL DEFENSE</span><div class="gac-b11-squad">${survivors.map((id)=>portrait(state.opponentRoster,id,'is-enemy')).join('')}</div><small>TM / HP / Protection / cooldowns remain UNKNOWN.</small></section><section><span>LOCKED CLEANUP ATTACK</span><div class="gac-b11-squad">${attackers.map((id)=>portrait(state.ownerRoster,id)).join('')}</div><small>${assignment?.datacron?.id?`Exact owned Datacron · …${escapeHtml(clean(assignment.datacron.id).slice(-8))}`:'No attacker Datacron locked'}</small></section></div><div class="gac-b11-resource"><strong>RESOURCE PROTECTION</strong><span>${Number(brief?.resource?.protectedIds?.length||0)} characters consumed/reserved round-wide. These cleanup attackers stay reserved until release or attempt.</span></div>${guidanceHtml(brief.execution)}</section>`;
}

async function renderCard(card,ctx){
  card.querySelectorAll('[data-gac-manual-cleanup],[data-gac-manual-cleanup-brief]').forEach((node)=>node.remove());
  const defenseId=Number(card?.dataset?.defenseId);const assignment=assignmentFor(defenseId);if(!assignment)return;
  const defense=defenseFor(defenseId)||{};const anchor=card.querySelector('[data-gac-result-history]')||card.querySelector('[data-gac-manual-war-panel]')||card;
  if(activeCleanup(assignment)){
    const brief=await cleanupBriefHtml(ctx,assignment,defense);anchor.insertAdjacentHTML('afterend',brief);return;
  }
  if(!needsCleanup(assignment))return;
  suppressOriginalRetry(card,assignment);
  anchor.insertAdjacentHTML('afterend',cleanupPlanHtml(ctx,assignment,defense));
}

async function renderAll(){const ctx=identity();if(!ctx)return;for(const card of document.querySelectorAll(CARD_SELECTOR))await renderCard(card,ctx);}

async function load(force=false){
  const ctx=identity();if(!ctx)return;
  if(!force&&state.key===ctx.key&&state.assignments.length&&state.ownerRoster&&state.opponentRoster){await renderAll();return;}
  const requestId=++state.requestId;
  try{
    const [warRoom,ownerRoster,opponentRoster,board,ownBoard,eligibility]=await Promise.all([
      fetchJson(`/api/gac/attack-plan/${ctx.mine}?round=${ctx.round}`),fetchJson(`/api/player/${ctx.mine}`),fetchJson(`/api/player/${ctx.opponent}`),fetchJson(`/api/gac/current-board/${ctx.mine}/defense?round=${ctx.round}`),fetchJson(`/api/gac/current-board/${ctx.mine}/my-defense?round=${ctx.round}`),loadEligibilityContext().catch(()=>null),
    ]);
    if(requestId!==state.requestId)return;
    if(allyCode(board?.opponent?.allyCode)!==ctx.opponent)throw new Error('Verified board opponent does not match the selected opponent.');
    if(state.key!==ctx.key){state.busy.clear();state.errors.clear();}
    state.key=ctx.key;state.assignments=Array.isArray(warRoom?.assignments)?warRoom.assignments:[];state.ownerRoster=ownerRoster;state.opponentRoster=opponentRoster;state.defenses=Array.isArray(board?.defenses)?board.defenses:[];state.ownDefenses=Array.isArray(ownBoard?.defenses)?ownBoard.defenses:[];state.eligibility=eligibility;
    await renderAll();
  }catch(error){if(requestId===state.requestId)console.warn('GAC manual cleanup parity unavailable',error);}
}

async function lockCleanup(button){
  const ctx=identity();const defenseId=Number(button?.dataset?.defenseId);const assignment=assignmentFor(defenseId);if(!ctx||!assignment?.id||!needsCleanup(assignment))return;
  const id=Number(assignment.id);if(state.busy.has(id))return;
  const members=clean(button.dataset.members).split(',').map(normalizeId).filter(Boolean);const leaderBaseId=normalizeId(button.dataset.leader);const datacronId=clean(button.dataset.datacronId);
  state.busy.add(id);state.errors.delete(id);await renderAll();
  try{
    await fetchJson(`/api/gac/attack-plan/${ctx.mine}`,{method:'POST',body:JSON.stringify({round:ctx.round,defenseId,leaderBaseId,members,datacronId})});
    window.dispatchEvent(new CustomEvent('gac-war-room-updated',{detail:{action:'manual-cleanup-counter-locked',assignmentId:id,defenseId}}));
    await load(true);
  }catch(error){state.errors.set(id,clean(error?.message||error));}
  finally{state.busy.delete(id);await renderAll();}
}

function schedule(delay=80,force=false){clearTimeout(state.timer);state.timer=setTimeout(()=>void load(force),Math.max(0,delay));}
function bind(){
  document.addEventListener('click',(event)=>{
    const normal=event.target.closest?.(`${CARD_SELECTOR} [data-gac-manual-dc-lock],${CARD_SELECTOR} [data-gac-manual-war-action="lock"],${CARD_SELECTOR} [data-gac-manual-cleanup-open]`);
    if(normal){const card=normal.closest('.gac-visible-defense[data-defense-id]');const assignment=assignmentFor(Number(card?.dataset?.defenseId));if(needsCleanup(assignment)){event.preventDefault();event.stopImmediatePropagation();suppressOriginalRetry(card,assignment);void renderCard(card,identity());card.querySelector('[data-gac-manual-cleanup]')?.scrollIntoView?.({behavior:'smooth',block:'center'});return;}}
    const lock=event.target.closest?.('[data-gac-manual-cleanup-lock]');if(lock){event.preventDefault();event.stopImmediatePropagation();void lockCleanup(lock);}
  },true);
  document.addEventListener('change',(event)=>{if(['allyCode','gacOpponentCode','gacBracketRound','gacMode'].includes(event.target?.id)||event.target?.matches?.('[data-gacv2-opponent],[data-gacv2-round],[data-gacv2-mode],[data-gac-board-format]'))schedule(120,true);},true);
  window.addEventListener('gac-visible-board-rendered',()=>schedule(60,true));window.addEventListener('gac-war-room-updated',()=>schedule(70,true));window.addEventListener('gac-board-evidence-updated',()=>schedule(100,true));document.addEventListener('DOMContentLoaded',()=>schedule(220,true),{once:true});schedule(420,true);
}

if(typeof document!=='undefined')bind();

export { activeCleanup, hasRecordedLoss, identity, lockCleanup, needsCleanup, renderAll, suppressOriginalRetry };
